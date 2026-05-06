import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ReportJob } from '../models/reports';
import { createId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';
import { InspectionReportSnapshotService } from './InspectionReportSnapshotService';
import { InspectionService } from './InspectionService';
import { UnitService } from './UnitService';
import { renderInspectionReportHtml } from '../../../supabase/functions/_shared/reportRenderer.ts';

const STORAGE_KEY_PREFIX = 'unitflip_reports_v1:';
const adapter = createLocalDbAdapter();
const LOCAL_REPORT_BUCKET = 'local-reports';

const shouldRenderReportsLocally = () => import.meta.env.VITE_USE_EDGE_FUNCTIONS !== 'true';

const createLocalReportUrl = (html: string) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

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

    if (shouldRenderReportsLocally()) {
      try {
        if (!snapshot) {
          throw new Error('Report snapshot could not be created for this inspection.');
        }

        const inspections = await InspectionService.listInspections(params.orgId);
        const inspection = inspections.find((entry) => entry.id === params.inspectionId) || null;
        const unit = inspection ? await UnitService.getUnit(params.orgId, inspection.unitId) : null;

        const html = renderInspectionReportHtml({
          orgId: params.orgId,
          reportId: newReport.id,
          inspectionId: params.inspectionId,
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
          snapshot: snapshot as unknown as Parameters<typeof renderInspectionReportHtml>[0]['snapshot'],
        });

        newReport.status = 'ready';
        newReport.pdf = {
          bucket: LOCAL_REPORT_BUCKET,
          path: `${params.orgId}/${newReport.id}/report.html`,
          url: createLocalReportUrl(html),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          sizeBytes: new Blob([html], { type: 'text/html; charset=utf-8' }).size,
        };

        reports.push(newReport);
        await adapter.setItem(key, reports);
        return newReport;
      } catch (error) {
        newReport.status = 'failed';
        newReport.errorMessage = error instanceof Error ? error.message : 'Failed to render the local report.';
        reports.push(newReport);
        await adapter.setItem(key, reports);
        throw error;
      }
    }

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
