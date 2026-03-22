import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { MaterialRequirement } from '../models/operations';
import { createPrefixedId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';

const STORAGE_KEY_PREFIX = 'unitflip_material_requirements_v1:';
const adapter = createLocalDbAdapter();

type MaterialRequirementCreateInput = Omit<MaterialRequirement, 'id' | 'createdAt' | 'updatedAt'>;

const normalizeRequirement = (requirement: MaterialRequirement): MaterialRequirement => ({
  ...requirement,
  status: requirement.status || 'draft',
});

export const MaterialRequirementService = {
  async listRequirements(
    orgId: string,
    filters?: { inspectionId?: string; repairTaskId?: string }
  ): Promise<MaterialRequirement[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const requirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];

    return requirements
      .map((requirement) => normalizeRequirement(requirement))
      .filter((requirement) => {
        if (filters?.inspectionId && requirement.inspectionId !== filters.inspectionId) return false;
        if (filters?.repairTaskId && requirement.repairTaskId !== filters.repairTaskId) return false;
        return true;
      })
      .sort((a, b) => a.itemDescription.localeCompare(b.itemDescription));
  },

  async updateRequirement(
    orgId: string,
    requirement: MaterialRequirement,
    userId: string
  ): Promise<MaterialRequirement> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const requirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];
    const existing = requirements.find((entry) => entry.id === requirement.id);
    if (!existing) {
      throw new Error('Material requirement not found.');
    }

    if (['fulfilled', 'canceled'].includes(existing.status) && ['draft', 'reviewed'].includes(requirement.status)) {
      throw new Error('Fulfilled or canceled material requirements cannot move back to draft or reviewed.');
    }

    const updatedRequirement = { ...requirement, updatedAt: Date.now() };

    await adapter.setItem(
      key,
      requirements.map((existing) => (existing.id === requirement.id ? updatedRequirement : existing))
    );
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_MATERIAL_REQUIREMENT',
      userId,
      payload: updatedRequirement as unknown as Record<string, unknown>,
    });

    return updatedRequirement;
  },

  async createRequirement(
    orgId: string,
    requirement: MaterialRequirementCreateInput,
    userId: string
  ): Promise<MaterialRequirement> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const requirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];
    const now = Date.now();
    const createdRequirement: MaterialRequirement = {
      ...requirement,
      status: requirement.status || 'draft',
      id: createPrefixedId('mat_'),
      createdAt: now,
      updatedAt: now,
    };

    requirements.push(createdRequirement);
    await adapter.setItem(key, requirements);
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_MATERIAL_REQUIREMENT',
      userId,
      payload: createdRequirement as unknown as Record<string, unknown>,
    });

    return createdRequirement;
  },

  async replaceForInspection(
    orgId: string,
    inspectionId: string,
    replacements: MaterialRequirementCreateInput[],
    userId: string
  ): Promise<MaterialRequirement[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const existingRequirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];
    const remainingRequirements = existingRequirements.filter(
      (requirement) => requirement.inspectionId !== inspectionId
    );
    const now = Date.now();
    const createdRequirements = replacements.map((requirement, index) => ({
      ...requirement,
      id: createPrefixedId('mat_'),
      createdAt: now + index,
      updatedAt: now + index,
    }));

    await adapter.setItem(key, [...remainingRequirements, ...createdRequirements]);

    const removedRequirements = existingRequirements.filter(
      (requirement) => requirement.inspectionId === inspectionId
    );
    for (const requirement of removedRequirements) {
      await SyncQueueService.enqueue(orgId, {
        type: 'DELETE_MATERIAL_REQUIREMENT',
        userId,
        payload: { materialRequirementId: requirement.id },
      });
    }

    for (const requirement of createdRequirements) {
      await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_MATERIAL_REQUIREMENT',
        userId,
        payload: requirement as unknown as Record<string, unknown>,
      });
    }

    return createdRequirements;
  },

  async clearForInspection(orgId: string, inspectionId: string, userId: string): Promise<void> {
    await this.replaceForInspection(orgId, inspectionId, [], userId);
  },
};
