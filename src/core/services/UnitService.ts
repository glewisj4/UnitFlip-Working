import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { Unit } from '../models/inspections';
import { LayoutTemplate } from '../models/templates';
import { createId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';

const STORAGE_KEY_PREFIX = 'unitflip_units_v1:';
const adapter = createLocalDbAdapter();

type LayoutInferenceReason = 'assigned' | 'exact_shape' | 'full_bath_fallback' | 'same_bedroom_fallback' | 'fallback_first_active';

const getUnitShape = (unit: Unit) => {
  const bedrooms = unit.managementData?.physicalDetails?.bedrooms;
  const bathrooms = unit.managementData?.physicalDetails?.bathrooms;
  return {
    bedrooms: typeof bedrooms === 'number' && Number.isFinite(bedrooms) ? bedrooms : null,
    bathrooms: typeof bathrooms === 'number' && Number.isFinite(bathrooms) ? bathrooms : null,
  };
};

const getBathroomTotal = (layout: LayoutTemplate) => layout.bathroomsFull + layout.bathroomsHalf * 0.5;

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
  },

  inferLayoutTemplateForUnit(unit: Unit, layouts: LayoutTemplate[]): { layout: LayoutTemplate; reason: Exclude<LayoutInferenceReason, 'assigned' | 'fallback_first_active'> } | null {
    const activeLayouts = layouts.filter((layout) => layout.isActive);
    const { bedrooms, bathrooms } = getUnitShape(unit);
    if (bedrooms === null || bathrooms === null) {
      return null;
    }

    const exactMatch =
      activeLayouts.find((layout) => layout.bedrooms === bedrooms && getBathroomTotal(layout) === bathrooms) || null;
    if (exactMatch) {
      return { layout: exactMatch, reason: 'exact_shape' };
    }

    const matchingFullBathLayouts = activeLayouts.filter(
      (layout) => layout.bedrooms === bedrooms && layout.bathroomsFull === Math.floor(bathrooms)
    );
    if (matchingFullBathLayouts.length === 1) {
      return { layout: matchingFullBathLayouts[0], reason: 'full_bath_fallback' };
    }

    const matchingBedroomLayouts = activeLayouts.filter((layout) => layout.bedrooms === bedrooms);
    if (matchingBedroomLayouts.length === 1) {
      return { layout: matchingBedroomLayouts[0], reason: 'same_bedroom_fallback' };
    }

    return null;
  },

  resolveTemplateForUnit(unit: Unit, layouts: LayoutTemplate[]): { layout: LayoutTemplate | null; reason: LayoutInferenceReason | null } {
    const activeLayouts = layouts.filter((layout) => layout.isActive);
    const assigned =
      (unit.assignedLayoutTemplateId
        ? activeLayouts.find((layout) => layout.id === unit.assignedLayoutTemplateId) || null
        : null) || null;
    if (assigned) {
      return { layout: assigned, reason: 'assigned' };
    }

    const inferred = this.inferLayoutTemplateForUnit(unit, activeLayouts);
    if (inferred) {
      return { layout: inferred.layout, reason: inferred.reason };
    }

    return { layout: activeLayouts[0] || null, reason: activeLayouts[0] ? 'fallback_first_active' : null };
  },

  async backfillLayoutTemplateIfMissing(orgId: string, unit: Unit, layouts: LayoutTemplate[]): Promise<Unit | null> {
    if (unit.assignedLayoutTemplateId) {
      return unit;
    }

    const inferred = this.inferLayoutTemplateForUnit(unit, layouts);
    if (!inferred) {
      return null;
    }

    const updatedUnit: Unit = {
      ...unit,
      assignedLayoutTemplateId: inferred.layout.id,
      updatedAt: Date.now(),
    };

    await this.updateUnit(orgId, updatedUnit);
    return updatedUnit;
  }
};
