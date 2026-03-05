import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { Inspection } from '../models/inspections';
import { createId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';

const STORAGE_KEY_PREFIX = 'unitflip_inspections_v1:';
const adapter = createLocalDbAdapter();

export const InspectionService = {
  async listInspections(orgId: string, unitId?: string): Promise<Inspection[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    let filtered = inspections;
    if (unitId) {
      filtered = filtered.filter((i) => i.unitId === unitId);
    }
    
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async createInspection(
    orgId: string,
    unitId: string,
    title: string,
    userId: string
  ): Promise<Inspection> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const newInspection: Inspection = {
      id: createId(),
      orgId,
      unitId,
      title,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByUserId: userId,
      lastEditedByUserId: userId,
      photoIds: [],
    };

    inspections.push(newInspection);
    await adapter.setItem(key, inspections);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_INSPECTION',
        userId,
        payload: newInspection as unknown as Record<string, unknown>
    });

    return newInspection;
  },

  async updateInspection(orgId: string, inspection: Inspection, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const updatedInspections = inspections.map((i) => 
      i.id === inspection.id 
        ? { ...inspection, updatedAt: Date.now(), lastEditedByUserId: userId } 
        : i
    );
    
    await adapter.setItem(key, updatedInspections);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_INSPECTION',
        userId,
        payload: inspection as unknown as Record<string, unknown>
    });
  },

  async addPhoto(orgId: string, inspectionId: string, photoId: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const updatedInspections = inspections.map((i) => {
      if (i.id === inspectionId) {
        return {
          ...i,
          photoIds: [...i.photoIds, photoId],
          updatedAt: Date.now(),
          lastEditedByUserId: userId
        };
      }
      return i;
    });
    
    await adapter.setItem(key, updatedInspections);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'ATTACH_PHOTO',
        userId,
        payload: { inspectionId, photoId }
    });
  },

  async removePhoto(orgId: string, inspectionId: string, photoId: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const updatedInspections = inspections.map((i) => {
      if (i.id === inspectionId) {
        return {
          ...i,
          photoIds: i.photoIds.filter(id => id !== photoId),
          updatedAt: Date.now(),
          lastEditedByUserId: userId
        };
      }
      return i;
    });
    
    await adapter.setItem(key, updatedInspections);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'DETACH_PHOTO',
        userId,
        payload: { inspectionId, photoId }
    });
  }
};
