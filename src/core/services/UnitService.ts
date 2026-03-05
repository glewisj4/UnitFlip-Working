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
    return units.sort((a, b) => b.updatedAt - a.updatedAt);
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
  }
};
