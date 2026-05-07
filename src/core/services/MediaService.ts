import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { PhotoAsset, CaptureSource, PhotoUploadVariant } from '../models/media';
import { compressImage, createThumbnail } from './imageCompression';
import { createId } from '../../services/storage';
import { IndexedDbAdapter } from '../adapters/IndexedDbAdapter';
import { OrgSettingsService } from './OrgSettingsService';
import { SyncQueueService } from './SyncQueueService';

const METADATA_DB_KEY_PREFIX = 'unitflip_photos_v1:';
const BLOB_STORE_NAME = 'blobs';
const adapter = createLocalDbAdapter();

// We need to ensure the blob store exists. 
const ensureBlobStore = async () => {
    return new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open('unitflip', 3); // Bump version to 3 for blobs
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
                db.createObjectStore(BLOB_STORE_NAME); 
            }
        };
        request.onerror = () => reject(request.error || new Error('Failed to open photo storage.'));
        request.onblocked = () => reject(new Error('Photo storage upgrade was blocked by another open UnitFlip session.'));
        request.onsuccess = () => {
            request.result.close();
            resolve();
        };
    });
};


export const MediaService = {
  async savePhotoFromFile(params: {
    orgId: string;
    file: File;
    source: CaptureSource;
  }): Promise<PhotoAsset> {
    await ensureBlobStore();
    const settings = await OrgSettingsService.getSettings(params.orgId);
    
    // 1. Full derivative
    const full = await compressImage(params.file, {
      maxBytes: settings.media.photoMaxBytes,
      maxDimension: settings.media.maxDimension,
      minQuality: settings.media.minQuality
    });

    // 2. Thumb derivative
    const thumb = await createThumbnail(params.file, {
      thumbMaxBytes: settings.media.thumbMaxBytes,
      thumbMaxDimension: settings.media.thumbMaxDimension,
      minQuality: settings.media.minQuality
    });

    const photoId = createId();
    const fullKey = `photo:${photoId}:full`;
    const thumbKey = `photo:${photoId}:thumb`;
    
    // Store Blobs
    const dbRequest = window.indexedDB.open('unitflip', 3);
    await new Promise<void>((resolve, reject) => {
        dbRequest.onerror = () => reject(dbRequest.error || new Error('Failed to open photo blob storage.'));
        dbRequest.onblocked = () => reject(new Error('Photo blob storage is blocked by another open UnitFlip session.'));
        dbRequest.onsuccess = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            const tx = db.transaction([BLOB_STORE_NAME], 'readwrite');
            const store = tx.objectStore(BLOB_STORE_NAME);
            store.put(full.blob, fullKey);
            store.put(thumb.blob, thumbKey);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
        };
    });

    const asset: PhotoAsset = {
      id: photoId,
      orgId: params.orgId,
      createdAt: Date.now(),
      mimeType: full.blob.type,
      width: full.width,
      height: full.height,
      originalBytes: params.file.size,
      compressedBytes: full.compressedBytes,
      source: params.source,
      maxBytesTarget: settings.media.photoMaxBytes,
      thumbMaxBytesTarget: settings.media.thumbMaxBytes,
      derivatives: {
        full: { key: fullKey, mimeType: full.blob.type, bytes: full.compressedBytes, width: full.width, height: full.height },
        thumb: { key: thumbKey, mimeType: thumb.blob.type, bytes: thumb.compressedBytes, width: thumb.width, height: thumb.height }
      }
    };

    // Store Metadata
    const key = `${METADATA_DB_KEY_PREFIX}${params.orgId}`;
    const photos = (await adapter.getItem<PhotoAsset[]>(key)) || [];
    photos.push(asset);
    await adapter.setItem(key, photos);

    // Sync Op
    await SyncQueueService.enqueue(params.orgId, {
      type: 'UPLOAD_PHOTO',
      userId: 'system',
      payload: { photoId, variants: ['full', 'thumb'] satisfies PhotoUploadVariant[] }
    });

    return asset;
  },

  async getPhotoBlob(photoId: string, variant: PhotoUploadVariant = 'full'): Promise<Blob | null> {
    await ensureBlobStore();
    const key = `photo:${photoId}:${variant}`;

    return new Promise((resolve) => {
        const request = window.indexedDB.open('unitflip', 3);
        request.onsuccess = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            const tx = db.transaction([BLOB_STORE_NAME], 'readonly');
            const store = tx.objectStore(BLOB_STORE_NAME);
            
            const getReq = store.get(key);
            getReq.onsuccess = () => {
                if (getReq.result) {
                    db.close();
                    resolve(getReq.result);
                } else if (variant === 'full') {
                    // Fallback for legacy photos
                    const fallbackReq = store.get(photoId);
                    fallbackReq.onsuccess = () => {
                      db.close();
                      resolve(fallbackReq.result || null);
                    };
                    fallbackReq.onerror = () => {
                      db.close();
                      resolve(null);
                    };
                } else {
                    db.close();
                    resolve(null);
                }
            };
            getReq.onerror = () => {
              db.close();
              resolve(null);
            };
        };
        request.onerror = () => resolve(null);
    });
  },

  async listPhotos(params: { orgId: string; limit?: number; offset?: number }): Promise<PhotoAsset[]> {
    const key = `${METADATA_DB_KEY_PREFIX}${params.orgId}`;
    const photos = (await adapter.getItem<PhotoAsset[]>(key)) || [];
    
    // Sort newest first
    photos.sort((a, b) => b.createdAt - a.createdAt);
    
    const offset = params.offset || 0;
    const limit = params.limit || 50;
    
    return photos.slice(offset, offset + limit);
  },

  async deletePhoto(params: { orgId: string; photoId: string }): Promise<void> {
    // Remove metadata
    const key = `${METADATA_DB_KEY_PREFIX}${params.orgId}`;
    const photos = (await adapter.getItem<PhotoAsset[]>(key)) || [];
    const updated = photos.filter(p => p.id !== params.photoId);
    await adapter.setItem(key, updated);

    // Remove blobs
    await ensureBlobStore();
    const request = window.indexedDB.open('unitflip', 3);
    return new Promise((resolve) => {
        request.onsuccess = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            const tx = db.transaction([BLOB_STORE_NAME], 'readwrite');
            const store = tx.objectStore(BLOB_STORE_NAME);
            store.delete(`photo:${params.photoId}:full`);
            store.delete(`photo:${params.photoId}:thumb`);
            store.delete(params.photoId); // Legacy
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
        };
    });
  },

  async getPhotoAsset(orgId: string, photoId: string): Promise<PhotoAsset | null> {
    const key = `${METADATA_DB_KEY_PREFIX}${orgId}`;
    const photos = (await adapter.getItem<PhotoAsset[]>(key)) || [];
    return photos.find(p => p.id === photoId) || null;
  },

  async updatePhotoAsset(orgId: string, asset: PhotoAsset): Promise<void> {
    const key = `${METADATA_DB_KEY_PREFIX}${orgId}`;
    const photos = (await adapter.getItem<PhotoAsset[]>(key)) || [];
    const index = photos.findIndex(p => p.id === asset.id);
    if (index !== -1) {
      photos[index] = asset;
      await adapter.setItem(key, photos);
    }
  },

  async markVariantUploaded(orgId: string, photoId: string, variant: PhotoUploadVariant, bucket: string, path: string): Promise<void> {
    const asset = await this.getPhotoAsset(orgId, photoId);
    if (asset) {
      if (!asset.remote) asset.remote = {};
      asset.remote[variant] = { bucket, path };
      await this.updatePhotoAsset(orgId, asset);
    }
  }
};
