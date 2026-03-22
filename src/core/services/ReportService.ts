import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ReportJob } from '../models/reports';
import { createId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';
import { InspectionReportSnapshotService } from './InspectionReportSnapshotService';

const STORAGE_KEY_PREFIX = 'unitflip_reports_v1:';
const adapter = createLocalDbAdapter();

export const ReportService = {
  async listReports(orgId: string, inspectionId?: string): Promise<ReportJob[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const reports = (await adapter.getItem<ReportJob[]>(key)) || [];
    
    let filtered = reports;
    if (inspectionId) {
      filtered = filtered.filter((r) => r.inspectionId === inspectionId);
    }
    
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  },

  async createReportRequest(params: { 
    orgId: string; 
    inspectionId: string; 
    userId: string; 
    options?: ReportJob['options'] 
  }): Promise<ReportJob> {
    const key = `${STORAGE_KEY_PREFIX}${params.orgId}`;
    const reports = (await adapter.getItem<ReportJob[]>(key)) || [];
    const snapshot = await InspectionReportSnapshotService.buildSnapshot(params.orgId, params.inspectionId);
    
    const newReport: ReportJob = {
      id: createId(),
      orgId: params.orgId,
      inspectionId: params.inspectionId,
      requestedByUserId: params.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'queued',
      options: params.options,
      snapshot: snapshot || undefined,
    };

    reports.push(newReport);
    await adapter.setItem(key, reports);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(params.orgId, {
        type: 'GENERATE_REPORT',
        userId: params.userId,
        payload: {
            reportId: newReport.id,
            inspectionId: params.inspectionId,
            options: params.options
        }
    });

    return newReport;
  },

  async updateReport(orgId: string, report: ReportJob): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const reports = (await adapter.getItem<ReportJob[]>(key)) || [];
    
    const updatedReports = reports.map((r) => 
      r.id === report.id ? { ...report, updatedAt: Date.now() } : r
    );
    
    await adapter.setItem(key, updatedReports);
  },

  async getLatestReport(orgId: string, inspectionId: string): Promise<ReportJob | null> {
    const reports = await this.listReports(orgId, inspectionId);
    return reports.length > 0 ? reports[0] : null;
  }
};
