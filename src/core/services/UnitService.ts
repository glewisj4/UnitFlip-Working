import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { Unit } from '../models/inspections';
import { createId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';

const STORAGE_KEY_PREFIX = 'unitflip_units_v1:';
const adapter = createLocalDbAdapter();

export const UnitService = {
  async listUnits(orgId: string): Promise<Unit[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const units = (await adapter.getItem<Unit[]>(key)) || [];
    return units
      .map((unit) => ({
        ...unit,
        assignedLayoutTemplateId: unit.assignedLayoutTemplateId ?? null,
        favoriteProductIds: Array.isArray(unit.favoriteProductIds) ? unit.favoriteProductIds : [],
        managementData: unit.managementData
          ? {
              ...unit.managementData,
              applianceLogs: Array.isArray(unit.managementData.applianceLogs) ? unit.managementData.applianceLogs : [],
              maintenanceHistory: Array.isArray(unit.managementData.maintenanceHistory)
                ? unit.managementData.maintenanceHistory
                : [],
              warrantyInfo: Array.isArray(unit.managementData.warrantyInfo) ? unit.managementData.warrantyInfo : [],
              keyLog: Array.isArray(unit.managementData.keyLog) ? unit.managementData.keyLog : [],
              physicalDetails: unit.managementData.physicalDetails
                ? {
                    ...unit.managementData.physicalDetails,
                    roomMeasurements: Array.isArray(unit.managementData.physicalDetails.roomMeasurements)
                      ? unit.managementData.physicalDetails.roomMeasurements
                      : [],
                    windowSizes: Array.isArray(unit.managementData.physicalDetails.windowSizes)
                      ? unit.managementData.physicalDetails.windowSizes
                      : [],
                    doorWidthsIn: Array.isArray(unit.managementData.physicalDetails.doorWidthsIn)
                      ? unit.managementData.physicalDetails.doorWidthsIn
                      : [],
                  }
                : undefined,
            }
          : undefined,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getUnit(orgId: string, unitId: string): Promise<Unit | null> {
    const units = await this.listUnits(orgId);
    return units.find((unit) => unit.id === unitId) || null;
  },

  async createUnit(
    orgId: string,
    partial: Pick<Unit, 'name'> & Partial<Unit>
  ): Promise<Unit> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const units = (await adapter.getItem<Unit[]>(key)) || [];
    
    const newUnit: Unit = {
      id: createId(),
      orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
      ...partial,
    };

    units.push(newUnit);
    await adapter.setItem(key, units);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_UNIT',
        userId: 'system', // In a real app, pass userId
        payload: newUnit as unknown as Record<string, unknown>
    });

    return newUnit;
  },

  async updateUnit(orgId: string, unit: Unit): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const units = (await adapter.getItem<Unit[]>(key)) || [];
    
    const updatedUnits = units.map((u) => 
      u.id === unit.id ? { ...unit, updatedAt: Date.now() } : u
    );
    
    await adapter.setItem(key, updatedUnits);

    // Enqueue Sync Op
    await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_UNIT',
        userId: 'system',
        payload: unit as unknown as Record<string, unknown>
    });
  },

  async archiveUnit(orgId: string, unitId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const units = (await adapter.getItem<Unit[]>(key)) || [];
    
    const updatedUnits = units.map((u) => 
      u.id === unitId ? { ...u, status: 'archived', updatedAt: Date.now() } : u
    );
    
    await adapter.setItem(key, updatedUnits);

    // Enqueue Sync Op (UPSERT with archived status)
    const archivedUnit = updatedUnits.find(u => u.id === unitId);
    if (archivedUnit) {
        await SyncQueueService.enqueue(orgId, {
            type: 'UPSERT_UNIT',
            userId: 'system',
            payload: archivedUnit as unknown as Record<string, unknown>
        });
    }
  },

  async deleteUnit(orgId: string, unitId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const units = (await adapter.getItem<Unit[]>(key)) || [];
    const updatedUnits = units.filter((unit) => unit.id !== unitId);
    await adapter.setItem(key, updatedUnits);
  }
};
