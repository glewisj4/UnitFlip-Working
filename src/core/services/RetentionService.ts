import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ArchiveService } from './ArchiveService';
import { RetentionPolicy, PendingPurgeItem } from '../models/retention';
import { ArchiveJob } from '../models/archive';
import { OrgSettingsService } from './OrgSettingsService';
import { MediaService } from './MediaService';
import { InspectionService } from './InspectionService';
import { SyncQueueService } from './SyncQueueService';
import { AuditLogService } from './AuditLogService';
import { Role } from '../models/auth';
import { createId } from '../../services/storage';
import { AuthPolicyService } from './AuthPolicyService';

const PENDING_PURGE_KEY_PREFIX = 'unitflip_pending_purge_v1:';
const adapter = createLocalDbAdapter();

export const RetentionService = {
  async getPolicy(orgId: string): Promise<RetentionPolicy> {
    const settings = await OrgSettingsService.getSettings(orgId);
    return {
      orgId,
      ...settings.retention,
      updatedAt: Date.now(), // Placeholder if not stored
    };
  },

  async updatePolicy(params: { orgId: string; userId: string; role: Role; patch: Partial<RetentionPolicy> }): Promise<void> {
    if (!AuthPolicyService.canManageRetention(params.role)) throw new Error('Unauthorized');
    
    const currentSettings = await OrgSettingsService.getSettings(params.orgId);
    await OrgSettingsService.updateSettings(params.orgId, {
      retention: {
        ...currentSettings.retention,
        ...params.patch
      }
    });

    await SyncQueueService.enqueue(params.orgId, {
      type: 'RETENTION_POLICY_UPDATED',
      userId: params.userId,
      payload: params.patch
    });

    await AuditLogService.logEvent({
      orgId: params.orgId,
      userId: params.userId,
      userRole: params.role,
      type: 'RETENTION_POLICY_UPDATED',
      metadata: params.patch
    });
  },

  async scanForEligiblePhotos(orgId: string): Promise<{ created: number; totalEligible: number }> {
    const policy = await this.getPolicy(orgId);
    const photos = await MediaService.listPhotos({ orgId, limit: 1000 }); // Scan up to 1000
    const now = Date.now();
    const retentionMs = policy.retentionDays * 24 * 60 * 60 * 1000;
    const cutoff = now - retentionMs;

    const eligiblePhotos = photos.filter(p => p.createdAt <= cutoff);
    
    const pendingKey = `${PENDING_PURGE_KEY_PREFIX}${orgId}`;
    const pendingItems = (await adapter.getItem<PendingPurgeItem[]>(pendingKey)) || [];
    const pendingPhotoIds = new Set(pendingItems.map(i => i.photoId));

    let createdCount = 0;
    const newPendingItems: PendingPurgeItem[] = [...pendingItems];

    for (const photo of eligiblePhotos) {
      if (!pendingPhotoIds.has(photo.id)) {
        const newItem: PendingPurgeItem = {
          id: createId(),
          orgId,
          photoId: photo.id,
          eligibleAt: photo.createdAt + retentionMs,
          createdAt: now,
          status: 'pending'
        };
        newPendingItems.push(newItem);
        createdCount++;
      }
    }

    if (createdCount > 0) {
      await adapter.setItem(pendingKey, newPendingItems);
    }

    await AuditLogService.logEvent({
      orgId,
      userId: 'system',
      userRole: 'admin',
      type: 'RETENTION_SCAN_COMPLETED',
      message: `Retention scan completed: Found ${eligiblePhotos.length} eligible photos, flagged ${createdCount} for purge.`,
      metadata: { createdCount, totalEligible: eligiblePhotos.length }
    });

    return { created: createdCount, totalEligible: eligiblePhotos.length };
  },

  async listPending(orgId: string, status?: string): Promise<PendingPurgeItem[]> {
    const pendingKey = `${PENDING_PURGE_KEY_PREFIX}${orgId}`;
    const items = (await adapter.getItem<PendingPurgeItem[]>(pendingKey)) || [];
    if (status) {
      return items.filter(i => i.status === status);
    }
    return items;
  },

  async approvePurge(params: { orgId: string; userId: string; role: Role; pendingId: string }): Promise<void> {
    if (!AuthPolicyService.canManageRetention(params.role)) throw new Error('Unauthorized');
    
    const pendingKey = `${PENDING_PURGE_KEY_PREFIX}${params.orgId}`;
    const items = (await adapter.getItem<PendingPurgeItem[]>(pendingKey)) || [];
    const item = items.find(i => i.id === params.pendingId);
    
    if (!item) throw new Error('Item not found');
    
    item.status = 'approved';
    item.approvedAt = Date.now();
    item.approvedByUserId = params.userId;

    await adapter.setItem(pendingKey, items);

    await SyncQueueService.enqueue(params.orgId, {
      type: 'RETENTION_PURGE_APPROVED',
      userId: params.userId,
      payload: { pendingId: params.pendingId, photoId: item.photoId }
    });

    await AuditLogService.logEvent({
      orgId: params.orgId,
      userId: params.userId,
      userRole: params.role,
      type: 'RETENTION_PURGE_APPROVED',
      entityId: item.photoId,
      metadata: { pendingId: params.pendingId }
    });
  },

  async exportArchive(params: { 
    orgId: string; 
    userId: string; 
    role: Role; 
    pendingId: string;
    variant?: 'full' | 'thumb'
  }): Promise<ArchiveJob> {
    const pendingKey = `${PENDING_PURGE_KEY_PREFIX}${params.orgId}`;
    const items = (await adapter.getItem<PendingPurgeItem[]>(pendingKey)) || [];
    const item = items.find(i => i.id === params.pendingId);
    
    if (!item) throw new Error('Item not found');

    // 1. Create the archive request
    const job = await ArchiveService.createArchiveRequest({
      orgId: params.orgId,
      userId: params.userId,
      role: params.role,
      pendingPurgeId: params.pendingId,
      photoId: item.photoId,
      variant: params.variant
    });

    // 2. Update pending item status
    item.status = 'archived';
    item.archivedAt = Date.now();
    await adapter.setItem(pendingKey, items);

    // 3. Trigger generation (async)
    // We don't await this fully if we want to return the job immediately, 
    // but for simplicity in this flow we can trigger it.
    ArchiveService.generateArchiveNow({
      orgId: params.orgId,
      archiveId: job.id
    }).catch(err => console.error('Background archive generation failed', err));

    await SyncQueueService.enqueue(params.orgId, {
      type: 'RETENTION_ARCHIVE_EXPORTED',
      userId: params.userId,
      payload: { pendingId: params.pendingId, photoId: item.photoId, archiveId: job.id, variant: job.variant }
    });

    return job;
  },

  async executePurge(params: { orgId: string; userId: string; role: Role; pendingId: string; force?: boolean }): Promise<void> {
    if (!AuthPolicyService.canManageRetention(params.role)) throw new Error('Unauthorized');
    const policy = await this.getPolicy(params.orgId);
    const pendingKey = `${PENDING_PURGE_KEY_PREFIX}${params.orgId}`;
    const items = (await adapter.getItem<PendingPurgeItem[]>(pendingKey)) || [];
    const item = items.find(i => i.id === params.pendingId);
    
    if (!item) throw new Error('Item not found');

    // Check if approved or auto-purge eligible
    const isApproved = item.status === 'approved' || item.status === 'archived';
    const isAutoPurgeEligible = policy.autoPurgeEnabled && (Date.now() - item.createdAt >= policy.approvalWindowDays * 24 * 60 * 60 * 1000);
    
    if (!isApproved && !isAutoPurgeEligible && !params.force) {
        throw new Error('Purge not approved or auto-purge window not met');
    }

    // Reference Check
    const inspections = await InspectionService.listInspections(params.orgId);
    const isReferenced = inspections.some(ins => ins.photoIds.includes(item.photoId));

    if (isReferenced) {
      item.status = 'skipped';
      item.reason = 'Referenced by inspection';
      await adapter.setItem(pendingKey, items);
      return;
    }

    // Execute deletion
    await MediaService.deletePhoto({ orgId: params.orgId, photoId: item.photoId });
    
    item.status = 'purged';
    item.purgedAt = Date.now();

    await adapter.setItem(pendingKey, items);

    await SyncQueueService.enqueue(params.orgId, {
      type: 'RETENTION_PHOTO_PURGED',
      userId: params.userId,
      payload: { pendingId: params.pendingId, photoId: item.photoId }
    });

    await AuditLogService.logEvent({
      orgId: params.orgId,
      userId: params.userId,
      userRole: params.role,
      type: 'RETENTION_PHOTO_PURGED',
      entityId: item.photoId,
      metadata: { pendingId: params.pendingId }
    });
  }
};
