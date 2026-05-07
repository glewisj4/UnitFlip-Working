import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { Inspection } from '../models/inspections';
import { createId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';
import {
  GeneratedInspectionItem,
  GeneratedInspectionSection,
  InspectionTemplateSnapshot,
} from '../models/templates';

const STORAGE_KEY_PREFIX = 'unitflip_inspections_v1:';
const adapter = createLocalDbAdapter();

interface CreateInspectionOptions {
  templateSnapshot?: InspectionTemplateSnapshot;
  generatedSections?: GeneratedInspectionSection[];
  generatedItems?: GeneratedInspectionItem[];
  notes?: string;
}

const normalizeInspection = (inspection: Inspection): Inspection => ({
  ...inspection,
  isInspectionFinalized: Boolean(inspection.isInspectionFinalized),
});

export const InspectionService = {
  async listInspections(orgId: string, unitId?: string): Promise<Inspection[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    let filtered = inspections;
    if (unitId) {
      filtered = filtered.filter((i) => i.unitId === unitId);
    }
    
    return filtered.map((inspection) => normalizeInspection(inspection)).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async createInspection(
    orgId: string,
    unitId: string,
    title: string,
    userId: string,
    options?: CreateInspectionOptions
  ): Promise<Inspection> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const newInspection: Inspection = {
      id: createId(),
      orgId,
      unitId,
      title,
      status: 'draft',
      isInspectionFinalized: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByUserId: userId,
      lastEditedByUserId: userId,
      photoIds: [],
      productIds: [],
      notes: options?.notes,
      templateSnapshot: options?.templateSnapshot,
      generatedSections: options?.generatedSections || [],
      generatedItems: options?.generatedItems || [],
    };

    inspections.push(normalizeInspection(newInspection));
    await adapter.setItem(key, inspections);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_INSPECTION',
        userId,
        payload: normalizeInspection(newInspection) as unknown as Record<string, unknown>
    });

    return normalizeInspection(newInspection);
  },

  async updateInspection(orgId: string, inspection: Inspection, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const normalizedInspection = normalizeInspection(inspection);
    const updatedInspections = inspections.map((i) => 
      i.id === inspection.id 
        ? { ...normalizedInspection, updatedAt: Date.now(), lastEditedByUserId: userId }
        : i
    );
    
    await adapter.setItem(key, updatedInspections);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_INSPECTION',
        userId,
        payload: normalizedInspection as unknown as Record<string, unknown>
    });
  },

  async addPhoto(orgId: string, inspectionId: string, photoId: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const updatedInspections = inspections.map((i) => {
      if (i.id === inspectionId) {
        return {
          ...i,
          photoIds: [...(i.photoIds || []), photoId],
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

  async addProduct(orgId: string, inspectionId: string, productId: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const updatedInspections = inspections.map((i) => {
      if (i.id === inspectionId) {
        return {
          ...i,
          productIds: [...(i.productIds || []), productId],
          updatedAt: Date.now(),
          lastEditedByUserId: userId
        };
      }
      return i;
    });
    
    await adapter.setItem(key, updatedInspections);
  },

  async removeProduct(orgId: string, inspectionId: string, productId: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    
    const updatedInspections = inspections.map((i) => {
      if (i.id === inspectionId) {
        return {
          ...i,
          productIds: (i.productIds || []).filter(id => id !== productId),
          updatedAt: Date.now(),
          lastEditedByUserId: userId
        };
      }
      return i;
    });
    
    await adapter.setItem(key, updatedInspections);
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
  },

  async deleteInspection(orgId: string, inspectionId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const inspections = (await adapter.getItem<Inspection[]>(key)) || [];
    await adapter.setItem(
      key,
      inspections.filter((inspection) => inspection.id !== inspectionId)
    );
  }
};
