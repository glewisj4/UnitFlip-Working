import { SyncQueueService } from './SyncQueueService';
import { RemoteSyncAdapter } from '../adapters/RemoteSyncAdapter';
import { NoopRemoteSyncAdapter } from '../adapters/NoopRemoteSyncAdapter';
import { RemoteReportAdapter } from '../adapters/RemoteReportAdapter';
import { NoopRemoteReportAdapter } from '../adapters/NoopRemoteReportAdapter';
import { EdgeFunctionReportAdapter } from '../adapters/EdgeFunctionReportAdapter';
import { RemotePhotoAdapter } from '../adapters/RemotePhotoAdapter';
import { EdgeFunctionPhotoAdapter } from '../adapters/EdgeFunctionPhotoAdapter';
import { ReportService } from './ReportService';
import { MediaService } from './MediaService';
import { AuditLogService } from './AuditLogService';
import { SyncOp } from '../models/sync';
import { FeatureFlagService } from './FeatureFlagService';
import { InspectionService } from './InspectionService';
import { UnitService } from './UnitService';

const MIN_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60000;

export class SyncEngine {
  private orgId: string | null = null;
  private isProcessing = false;
  private isOnline = navigator.onLine;
  private remote: RemoteSyncAdapter;
  private reportAdapter: RemoteReportAdapter;
  private photoAdapter: RemotePhotoAdapter;
  private processTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();
  private lastSyncAt: number | undefined;

  constructor(remote?: RemoteSyncAdapter, reportAdapter?: RemoteReportAdapter, photoAdapter?: RemotePhotoAdapter) {
    const useEdge = import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true';
    this.remote = remote || new NoopRemoteSyncAdapter(process.env.NODE_ENV === 'development');
    this.reportAdapter = reportAdapter || (useEdge ? new EdgeFunctionReportAdapter() : new NoopRemoteReportAdapter(process.env.NODE_ENV === 'development'));
    this.photoAdapter = photoAdapter || new EdgeFunctionPhotoAdapter();
    
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private handleOnline = () => {
    this.isOnline = true;
    this.notifyListeners();
    this.processQueue();
  };

  private handleOffline = () => {
    this.isOnline = false;
    this.notifyListeners();
  };

  start(orgId: string) {
    this.orgId = orgId;
    this.processQueue();
  }

  stop() {
    this.orgId = null;
    if (this.processTimeout) {
      clearTimeout(this.processTimeout);
      this.processTimeout = null;
    }
  }

  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb());
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isProcessing,
      lastSyncAt: this.lastSyncAt,
    };
  }

  async triggerSyncNow(orgId: string) {
    if (this.orgId !== orgId) {
      this.orgId = orgId;
    }
    await this.processQueue();
  }

  private async processQueue() {
    if (!this.orgId || !this.isOnline || this.isProcessing) return;

    this.isProcessing = true;
    this.notifyListeners();

    try {
      // Get next pending op
      const ops = await SyncQueueService.list(this.orgId, { status: 'pending', limit: 1 });
      const failedOps = await SyncQueueService.list(this.orgId, { status: 'failed', limit: 1 });
      
      // Prioritize pending, but also retry failed if backoff allows
      let opToProcess: SyncOp | undefined = ops[0];
      
      if (!opToProcess && failedOps.length > 0) {
        const failedOp = failedOps[0];
        const backoffTime = Math.min(
          MIN_BACKOFF_MS * Math.pow(2, failedOp.attemptCount - 1),
          MAX_BACKOFF_MS
        );
        
        if (Date.now() - (failedOp.lastAttemptAt || 0) > backoffTime) {
          opToProcess = failedOp;
        }
      }

      if (opToProcess) {
        await this.processOp(opToProcess);
        // Continue processing immediately if successful
        this.isProcessing = false;
        this.processQueue();
      } else {
        this.isProcessing = false;
        this.lastSyncAt = Date.now();
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Sync processing error', error);
      this.isProcessing = false;
      this.notifyListeners();
    }
  }

  private async processOp(op: SyncOp) {
    if (!this.orgId) return;

    try {
      // Mark in flight
      op.status = 'in_flight';
      op.lastAttemptAt = Date.now();
      op.attemptCount++;
      await SyncQueueService.update(this.orgId, op);

      // Execute remote call
      switch (op.type) {
        case 'UPSERT_UNIT':
          await this.remote.upsertUnit(this.orgId, op.payload);
          break;
        case 'UPSERT_INSPECTION':
          await this.remote.upsertInspection(this.orgId, op.payload);
          break;
        case 'UPSERT_FINDING':
          await this.remote.upsertFinding(this.orgId, op.payload);
          break;
        case 'DELETE_FINDING':
          await this.remote.deleteFinding(this.orgId, op.payload.findingId as string);
          break;
        case 'UPSERT_REPAIR_TASK':
          await this.remote.upsertRepairTask(this.orgId, op.payload);
          break;
        case 'DELETE_REPAIR_TASK':
          await this.remote.deleteRepairTask(this.orgId, op.payload.repairTaskId as string);
          break;
        case 'UPSERT_MATERIAL_REQUIREMENT':
          await this.remote.upsertMaterialRequirement(this.orgId, op.payload);
          break;
        case 'DELETE_MATERIAL_REQUIREMENT':
          await this.remote.deleteMaterialRequirement(this.orgId, op.payload.materialRequirementId as string);
          break;
        case 'ATTACH_PHOTO':
          await this.remote.attachPhoto(
            this.orgId, 
            op.payload.inspectionId as string, 
            op.payload.photoId as string
          );
          break;
        case 'DETACH_PHOTO':
          await this.remote.detachPhoto(
            this.orgId, 
            op.payload.inspectionId as string, 
            op.payload.photoId as string
          );
          break;
        case 'GENERATE_REPORT':
            await this.handleGenerateReport(op);
            break;
        case 'UPLOAD_PHOTO':
          await this.handleUploadPhoto(op);
          break;
      }

      // Success
      op.status = 'succeeded';
      await SyncQueueService.remove(this.orgId, op.id);
      
    } catch (error: any) {
      // Failure
      op.status = 'failed';
      op.errorMessage = error.message || 'Unknown error';
      await SyncQueueService.update(this.orgId, op);
      
      // Also update report status if applicable
      if (op.type === 'GENERATE_REPORT' && this.orgId) {
          const reportId = op.payload.reportId as string;
          const report = (await ReportService.listReports(this.orgId)).find(r => r.id === reportId);
          if (report) {
              report.status = 'failed';
              report.errorMessage = error.message;
              await ReportService.updateReport(this.orgId, report);
          }
      }
    }
  }

  private async handleUploadPhoto(op: SyncOp) {
    if (!this.orgId) return;
    
    const useRemoteUploads = await FeatureFlagService.isEnabled(this.orgId, 'remote_uploads') || import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true';
    if (!useRemoteUploads) {
      console.log('Remote uploads disabled, skipping photo sync', op.payload.photoId);
      return;
    }

    const { photoId, variants } = op.payload as { photoId: string; variants: ('full' | 'thumb')[] };
    const asset = await MediaService.getPhotoAsset(this.orgId, photoId);
    if (!asset) {
      throw new Error(`Photo asset ${photoId} not found`);
    }

    const uploadedVariants: string[] = [];

    for (const variant of variants) {
      // Skip if already uploaded
      if (asset.remote?.[variant]) {
        continue;
      }

      const blob = await MediaService.getPhotoBlob(photoId, variant);
      if (!blob) {
        console.warn(`Blob for variant ${variant} of photo ${photoId} not found, skipping`);
        continue;
      }

      // 1. Get signed upload URL
      const { bucket, path, uploadUrl } = await this.photoAdapter.getSignedUploadUrl({
        orgId: this.orgId,
        photoId,
        variant,
        contentType: blob.type,
        sizeBytes: blob.size
      });

      // 2. PUT blob to signed URL
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': blob.type
        },
        body: blob
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload ${variant} to Supabase: ${response.statusText} - ${errorText}`);
      }

      // 3. Confirm upload (noop for now)
      await this.photoAdapter.confirmUpload({ bucket, path });

      // 4. Update local metadata
      await MediaService.markVariantUploaded(this.orgId, photoId, variant, bucket, path);
      uploadedVariants.push(variant);
    }

    if (uploadedVariants.length > 0) {
      await AuditLogService.logEvent({
        orgId: this.orgId,
        userId: op.userId,
        userRole: 'admin', // Defaulting to admin for system ops
        type: 'PHOTO_UPLOADED',
        entityId: photoId,
        metadata: { variants: uploadedVariants }
      });
    }
  }

  private async handleGenerateReport(op: SyncOp) {
    if (!this.orgId) return;
    
    const { reportId, inspectionId, options } = op.payload as any;
    
    // Update report status to generating
    const reports = await ReportService.listReports(this.orgId);
    const report = reports.find(r => r.id === reportId);
    
    if (report) {
      report.status = 'generating';
      await ReportService.updateReport(this.orgId, report);
    }

    const inspections = await InspectionService.listInspections(this.orgId);
    const inspection = inspections.find((entry) => entry.id === inspectionId) || null;
    const unit = inspection ? await UnitService.getUnit(this.orgId, inspection.unitId) : null;

    // 1. Request remote generation
    const { bucket, path } = await this.reportAdapter.requestReportGeneration({
      orgId: this.orgId,
      reportId,
      inspectionId,
      options,
      snapshot: report?.snapshot,
      inspection: inspection
        ? {
            id: inspection.id,
            title: inspection.title,
            status: inspection.status,
            notes: inspection.notes,
            createdAt: inspection.createdAt,
            updatedAt: inspection.updatedAt,
            photoCount: inspection.photoIds?.length || 0,
          }
        : undefined,
      unit: unit
        ? {
            id: unit.id,
            name: unit.name,
            unitCode: unit.unitCode,
            facilityName: unit.facilityName,
            buildingName: unit.buildingName,
            address1: unit.address1,
            address2: unit.address2,
            city: unit.city,
            state: unit.state,
            zip: unit.zip,
            notes: unit.notes,
          }
        : undefined,
    });

    // 2. Get short-lived signed URL (e.g. 15 mins)
    const { url, expiresAt } = await this.reportAdapter.getSignedDownloadUrl({
      bucket,
      path,
      expiresInSeconds: 900 // 15 minutes
    });

    // Update report with result
    if (report) {
      report.status = 'ready';
      report.pdf = {
        bucket,
        path,
        url,
        expiresAt
      };
      await ReportService.updateReport(this.orgId, report);
      
      await AuditLogService.logEvent({
        orgId: this.orgId,
        userId: op.userId,
        userRole: 'admin',
        type: 'REPORT_GENERATED_REMOTE',
        entityId: reportId,
        metadata: { bucket, path }
      });
    }
  }
}

export const syncEngine = new SyncEngine();
