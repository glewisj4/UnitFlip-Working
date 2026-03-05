import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ArchiveJob, ArchiveStatus } from '../models/archive';
import { MediaService } from './MediaService';
import { createPhotoArchiveZip } from './zipArchive';
import { AuditLogService } from './AuditLogService';
import { SyncQueueService } from './SyncQueueService';
import { Role } from '../models/auth';
import { createId } from '../../services/storage';

const ARCHIVE_KEY_PREFIX = 'unitflip_archives_v1:';
const BLOB_STORE_NAME = 'blobs';
const DB_NAME = 'unitflip';
const DB_VERSION = 3;
const adapter = createLocalDbAdapter();

export const ArchiveService = {
  async listArchives(orgId: string, pendingPurgeId?: string): Promise<ArchiveJob[]> {
    const key = `${ARCHIVE_KEY_PREFIX}${orgId}`;
    const archives = (await adapter.getItem<ArchiveJob[]>(key)) || [];
    if (pendingPurgeId) {
      return archives.filter(a => a.pendingPurgeId === pendingPurgeId);
    }
    return archives;
  },

  async createArchiveRequest(params: { 
    orgId: string; 
    userId: string; 
    role: Role; 
    pendingPurgeId: string; 
    photoId: string; 
    variant?: 'full' | 'thumb' 
  }): Promise<ArchiveJob> {
    if (params.role !== 'admin') throw new Error('Unauthorized');

    const job: ArchiveJob = {
      id: createId(),
      orgId: params.orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      requestedByUserId: params.userId,
      pendingPurgeId: params.pendingPurgeId,
      photoId: params.photoId,
      variant: params.variant || 'full',
      status: 'queued'
    };

    const key = `${ARCHIVE_KEY_PREFIX}${params.orgId}`;
    const archives = (await adapter.getItem<ArchiveJob[]>(key)) || [];
    archives.unshift(job); // Newest first
    await adapter.setItem(key, archives);

    await AuditLogService.logEvent({
      orgId: params.orgId,
      userId: params.userId,
      userRole: params.role,
      type: 'RETENTION_ARCHIVE_REQUESTED',
      entityId: params.photoId,
      metadata: { archiveId: job.id, pendingId: params.pendingPurgeId, variant: job.variant }
    });

    return job;
  },

  async generateArchiveNow(params: { orgId: string; archiveId: string }): Promise<ArchiveJob> {
    const key = `${ARCHIVE_KEY_PREFIX}${params.orgId}`;
    const archives = (await adapter.getItem<ArchiveJob[]>(key)) || [];
    const jobIndex = archives.findIndex(a => a.id === params.archiveId);
    
    if (jobIndex === -1) throw new Error('Archive job not found');
    const job = archives[jobIndex];

    try {
      job.status = 'generating';
      job.updatedAt = Date.now();
      await adapter.setItem(key, archives);

      const photoBlob = await MediaService.getPhotoBlob(job.photoId, job.variant);
      if (!photoBlob) {
        throw new Error(`Photo blob not found for ID: ${job.photoId}`);
      }

      const manifest = {
        orgId: job.orgId,
        photoId: job.photoId,
        pendingPurgeId: job.pendingPurgeId,
        requestedByUserId: job.requestedByUserId,
        createdAt: job.createdAt,
        variant: job.variant,
        exportedAt: Date.now(),
        photoMetadata: {
          size: photoBlob.size,
          type: photoBlob.type
        }
      };

      const { zipBlob, sizeBytes } = await createPhotoArchiveZip({
        filenameBase: `unitflip-archive-${job.photoId}`,
        photoFileName: `${job.photoId}.jpg`,
        photoBlob,
        manifest
      });

      const blobKey = `archive:${job.id}`;
      
      // Store Blob in raw IndexedDB
      await new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          const tx = db.transaction([BLOB_STORE_NAME], 'readwrite');
          const store = tx.objectStore(BLOB_STORE_NAME);
          store.put(zipBlob, blobKey);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });

      job.status = 'ready';
      job.updatedAt = Date.now();
      job.output = {
        blobKey,
        filename: `unitflip-archive-${job.photoId}.zip`,
        sizeBytes
      };

      await adapter.setItem(key, archives);

      await SyncQueueService.enqueue(params.orgId, {
        type: 'ARCHIVE_EXPORTED',
        userId: job.requestedByUserId,
        payload: { archiveId: job.id, photoId: job.photoId, sizeBytes }
      });

      await AuditLogService.logEvent({
        orgId: params.orgId,
        userId: job.requestedByUserId,
        userRole: 'admin',
        type: 'RETENTION_ARCHIVE_READY',
        entityId: job.photoId,
        metadata: { archiveId: job.id, sizeBytes }
      });

    } catch (error) {
      console.error('Archive generation failed', error);
      job.status = 'failed';
      job.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.updatedAt = Date.now();
      await adapter.setItem(key, archives);

      await AuditLogService.logEvent({
        orgId: params.orgId,
        userId: job.requestedByUserId,
        userRole: 'admin',
        type: 'RETENTION_ARCHIVE_FAILED',
        entityId: job.photoId,
        metadata: { archiveId: job.id, error: job.errorMessage }
      });
    }

    return job;
  },

  async getArchiveBlob(orgId: string, archiveId: string): Promise<Blob | null> {
    const blobKey = `archive:${archiveId}`;
    return new Promise((resolve) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = db.transaction([BLOB_STORE_NAME], 'readonly');
        const store = tx.objectStore(BLOB_STORE_NAME);
        const getReq = store.get(blobKey);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    });
  },

  async deleteArchive(orgId: string, archiveId: string): Promise<void> {
    const key = `${ARCHIVE_KEY_PREFIX}${orgId}`;
    const archives = (await adapter.getItem<ArchiveJob[]>(key)) || [];
    const filtered = archives.filter(a => a.id !== archiveId);
    await adapter.setItem(key, filtered);

    const blobKey = `archive:${archiveId}`;
    await new Promise<void>((resolve) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = db.transaction([BLOB_STORE_NAME], 'readwrite');
        const store = tx.objectStore(BLOB_STORE_NAME);
        store.delete(blobKey);
        tx.oncomplete = () => resolve();
      };
    });
  }
};
