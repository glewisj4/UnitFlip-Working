import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { Unit } from '../models/inspections';
import {
  ChecklistOverrideScopeType,
  ChecklistScopedOverride,
} from '../models/templates';
import { createPrefixedId } from '../../services/storage';

const STORAGE_KEY = 'unitflip_checklist_scoped_overrides_v1';
const adapter = createLocalDbAdapter();

type ChecklistScopedOverrideCreateInput = Omit<ChecklistScopedOverride, 'id' | 'createdAt' | 'updatedAt'>;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase();

const buildPropertyScopeCandidates = (unit?: Unit | null) =>
  [normalizeText(unit?.buildingName), normalizeText(unit?.facilityName)].filter(Boolean);

const validateOverride = (override: ChecklistScopedOverrideCreateInput | ChecklistScopedOverride) => {
  if (!override.organizationId.trim()) {
    throw new Error('Organization id is required for a checklist override.');
  }
  if (!override.scopeRefId.trim()) {
    throw new Error('Scope reference is required for a checklist override.');
  }
  if (!override.templateItemId.trim()) {
    throw new Error('Checklist template item id is required for a checklist override.');
  }
};

export const ChecklistScopedOverrideService = {
  buildPropertyScopeCandidates,

  async listAll(organizationId: string): Promise<ChecklistScopedOverride[]> {
    const stored = (await adapter.getItem<ChecklistScopedOverride[]>(STORAGE_KEY)) || [];
    return stored
      .filter((entry) => entry.organizationId === organizationId)
      .map((entry) => clone(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  },

  async create(input: ChecklistScopedOverrideCreateInput): Promise<ChecklistScopedOverride> {
    validateOverride(input);
    const stored = (await adapter.getItem<ChecklistScopedOverride[]>(STORAGE_KEY)) || [];
    const now = Date.now();
    const created: ChecklistScopedOverride = {
      ...clone(input),
      id: createPrefixedId('chk_override_'),
      createdAt: now,
      updatedAt: now,
    };
    stored.push(created);
    await adapter.setItem(STORAGE_KEY, stored);
    return clone(created);
  },

  async update(override: ChecklistScopedOverride): Promise<ChecklistScopedOverride> {
    validateOverride(override);
    const stored = (await adapter.getItem<ChecklistScopedOverride[]>(STORAGE_KEY)) || [];
    const existing = stored.find((entry) => entry.id === override.id);
    if (!existing) {
      throw new Error(`Checklist override "${override.id}" was not found.`);
    }
    const updated: ChecklistScopedOverride = {
      ...clone(override),
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    await adapter.setItem(
      STORAGE_KEY,
      stored.map((entry) => (entry.id === override.id ? updated : entry))
    );
    return clone(updated);
  },

  async delete(id: string, organizationId: string): Promise<void> {
    const stored = (await adapter.getItem<ChecklistScopedOverride[]>(STORAGE_KEY)) || [];
    await adapter.setItem(
      STORAGE_KEY,
      stored.filter((entry) => !(entry.id === id && entry.organizationId === organizationId))
    );
  },

  resolveEffectiveOverride(
    overrides: ChecklistScopedOverride[],
    params: {
      organizationId: string;
      unit?: Unit | null;
      templateItemId: string;
    }
  ): ChecklistScopedOverride | null {
    const relevant = overrides.filter(
      (entry) => entry.organizationId === params.organizationId && entry.templateItemId === params.templateItemId
    );
    if (relevant.length === 0) return null;

    const unitMatch =
      params.unit &&
      relevant.find((entry) => entry.scopeType === 'unit' && entry.scopeRefId === params.unit?.id);
    if (unitMatch) return clone(unitMatch);

    const propertyCandidates = buildPropertyScopeCandidates(params.unit);
    const propertyMatch = relevant.find(
      (entry) => entry.scopeType === 'property' && propertyCandidates.includes(normalizeText(entry.scopeRefId))
    );
    if (propertyMatch) return clone(propertyMatch);

    const organizationMatch = relevant.find(
      (entry) => entry.scopeType === 'organization' && entry.scopeRefId === params.organizationId
    );
    return organizationMatch ? clone(organizationMatch) : null;
  },

  buildEffectiveOverrideLookup(
    overrides: ChecklistScopedOverride[],
    params: {
      organizationId: string;
      unit?: Unit | null;
      templateItemIds: string[];
    }
  ): Record<string, ChecklistScopedOverride | undefined> {
    return params.templateItemIds.reduce<Record<string, ChecklistScopedOverride | undefined>>((lookup, templateItemId) => {
      lookup[templateItemId] =
        this.resolveEffectiveOverride(overrides, {
          organizationId: params.organizationId,
          unit: params.unit,
          templateItemId,
        }) || undefined;
      return lookup;
    }, {});
  },

  getScopeLabel(scopeType: ChecklistOverrideScopeType, scopeRefId: string) {
    if (scopeType === 'organization') return 'Organization';
    if (scopeType === 'property') return `Property • ${scopeRefId}`;
    return `Unit • ${scopeRefId}`;
  },
};
