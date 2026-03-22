import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { Finding } from '../models/operations';
import { createPrefixedId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';

const STORAGE_KEY_PREFIX = 'unitflip_findings_v1:';
const adapter = createLocalDbAdapter();

type FindingCreateInput = Omit<Finding, 'id' | 'createdAt' | 'updatedAt'>;

export const FindingService = {
  async listFindings(
    orgId: string,
    filters?: { inspectionId?: string; unitId?: string }
  ): Promise<Finding[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const findings = (await adapter.getItem<Finding[]>(key)) || [];

    return findings
      .filter((finding) => {
        if (filters?.inspectionId && finding.inspectionId !== filters.inspectionId) return false;
        if (filters?.unitId && finding.unitId !== filters.unitId) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async createFinding(orgId: string, finding: FindingCreateInput, userId: string): Promise<Finding> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const findings = (await adapter.getItem<Finding[]>(key)) || [];
    const now = Date.now();

    const newFinding: Finding = {
      ...finding,
      id: createPrefixedId('fnd_'),
      createdAt: now,
      updatedAt: now,
    };

    findings.push(newFinding);
    await adapter.setItem(key, findings);
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_FINDING',
      userId,
      payload: newFinding as unknown as Record<string, unknown>,
    });

    return newFinding;
  },

  async updateFinding(orgId: string, finding: Finding, userId: string): Promise<Finding> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const findings = (await adapter.getItem<Finding[]>(key)) || [];
    const updatedFinding = { ...finding, updatedAt: Date.now() };

    await adapter.setItem(
      key,
      findings.map((existing) => (existing.id === finding.id ? updatedFinding : existing))
    );
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_FINDING',
      userId,
      payload: updatedFinding as unknown as Record<string, unknown>,
    });

    return updatedFinding;
  },

  async deleteFinding(orgId: string, findingId: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const findings = (await adapter.getItem<Finding[]>(key)) || [];
    await adapter.setItem(
      key,
      findings.filter((finding) => finding.id !== findingId)
    );
    await SyncQueueService.enqueue(orgId, {
      type: 'DELETE_FINDING',
      userId,
      payload: { findingId },
    });
  },
};
