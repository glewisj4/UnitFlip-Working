import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { DEFAULT_LAYOUT_CHECKLIST_MAPPINGS } from '../data/defaultTemplates';
import { ChecklistTemplate, LayoutChecklistMapping } from '../models/templates';
import { createPrefixedId } from '../../services/storage';
import { ChecklistTemplateService } from './ChecklistTemplateService';
import { LayoutTemplateService } from './LayoutTemplateService';

const STORAGE_KEY = 'unitflip_layout_checklist_mappings_v1';
const adapter = createLocalDbAdapter();

type LayoutChecklistMappingCreateInput = Omit<
  LayoutChecklistMapping,
  'id' | 'orgId' | 'isActive' | 'createdAt' | 'updatedAt'
> & {
  orgId?: string | null;
  isActive?: boolean;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const isVisibleToOrg = (mapping: LayoutChecklistMapping, orgId?: string | null): boolean =>
  mapping.orgId === null || (orgId ? mapping.orgId === orgId : mapping.orgId === null);

const sortMappings = (
  mappings: LayoutChecklistMapping[],
  orgId?: string | null
): LayoutChecklistMapping[] =>
  [...mappings].sort((a, b) => {
    const aOrgSpecific = orgId ? a.orgId === orgId : false;
    const bOrgSpecific = orgId ? b.orgId === orgId : false;
    if (aOrgSpecific !== bOrgSpecific) return aOrgSpecific ? -1 : 1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.layoutTemplateId !== b.layoutTemplateId) {
      return a.layoutTemplateId.localeCompare(b.layoutTemplateId);
    }
    return a.checklistTemplateId.localeCompare(b.checklistTemplateId);
  });

const getStoredMappings = async (): Promise<LayoutChecklistMapping[]> =>
  (await adapter.getItem<LayoutChecklistMapping[]>(STORAGE_KEY)) || [];

const mergeMappings = (storedMappings: LayoutChecklistMapping[], orgId?: string | null): LayoutChecklistMapping[] => {
  const merged = new Map<string, LayoutChecklistMapping>();

  for (const mapping of DEFAULT_LAYOUT_CHECKLIST_MAPPINGS) {
    merged.set(mapping.id, clone(mapping));
  }

  for (const mapping of storedMappings) {
    if (!isVisibleToOrg(mapping, orgId)) continue;
    merged.set(mapping.id, clone(mapping));
  }

  return sortMappings([...merged.values()], orgId);
};

const validateMappingReferences = async (mapping: {
  layoutTemplateId: string;
  checklistTemplateId: string;
  orgId?: string | null;
}) => {
  const [layoutTemplate, checklistTemplate] = await Promise.all([
    LayoutTemplateService.getById(mapping.layoutTemplateId, mapping.orgId),
    ChecklistTemplateService.getById(mapping.checklistTemplateId, mapping.orgId),
  ]);

  if (!layoutTemplate) {
    throw new Error(`Cannot save mapping. Layout template "${mapping.layoutTemplateId}" was not found.`);
  }

  if (!layoutTemplate.isActive) {
    throw new Error(`Cannot save mapping. Layout template "${mapping.layoutTemplateId}" is archived.`);
  }

  if (!checklistTemplate) {
    throw new Error(`Cannot save mapping. Checklist template "${mapping.checklistTemplateId}" was not found.`);
  }

  if (!checklistTemplate.isActive) {
    throw new Error(`Cannot save mapping. Checklist template "${mapping.checklistTemplateId}" is archived.`);
  }
};

const validateMappingUniqueness = async (mapping: {
  id?: string;
  layoutTemplateId: string;
  isDefault: boolean;
  isActive?: boolean;
  orgId?: string | null;
}) => {
  if (!mapping.isDefault || mapping.isActive === false) {
    return;
  }

  const existingMappings = await getStoredMappings();
  const visibleMappings = mergeMappings(existingMappings, mapping.orgId).filter(
    (existing) =>
      existing.layoutTemplateId === mapping.layoutTemplateId &&
      existing.isDefault &&
      existing.isActive &&
      existing.id !== mapping.id &&
      existing.orgId === (mapping.orgId ?? null)
  );

  if (visibleMappings.length > 0) {
    throw new Error(
      'Only one active default mapping is allowed per layout in the same scope. Archive or change the existing mapping first.'
    );
  }
};

export const LayoutChecklistMappingService = {
  async listAll(orgId?: string | null): Promise<LayoutChecklistMapping[]> {
    const stored = await getStoredMappings();
    return mergeMappings(stored, orgId);
  },

  async listActive(orgId?: string | null): Promise<LayoutChecklistMapping[]> {
    const mappings = await this.listAll(orgId);
    return mappings.filter((mapping) => mapping.isActive);
  },

  async listByOrganization(orgId: string): Promise<LayoutChecklistMapping[]> {
    return this.listAll(orgId);
  },

  async getById(id: string, orgId?: string | null): Promise<LayoutChecklistMapping | null> {
    const mappings = await this.listAll(orgId);
    return mappings.find((mapping) => mapping.id === id) || null;
  },

  async create(input: LayoutChecklistMappingCreateInput): Promise<LayoutChecklistMapping> {
    await validateMappingReferences(input);
    await validateMappingUniqueness(input);

    const stored = await getStoredMappings();
    const now = Date.now();
    const createdMapping: LayoutChecklistMapping = {
      ...clone(input),
      id: createPrefixedId('map_'),
      orgId: input.orgId ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    stored.push(createdMapping);
    await adapter.setItem(STORAGE_KEY, stored);
    return clone(createdMapping);
  },

  async update(mapping: LayoutChecklistMapping): Promise<LayoutChecklistMapping> {
    await validateMappingReferences(mapping);
    await validateMappingUniqueness(mapping);

    const stored = await getStoredMappings();
    const existing = await this.getById(mapping.id, mapping.orgId);
    if (!existing) {
      throw new Error(`Layout checklist mapping "${mapping.id}" was not found.`);
    }

    const updatedMapping: LayoutChecklistMapping = {
      ...clone(mapping),
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    const next = stored.filter((item) => item.id !== mapping.id);
    next.push(updatedMapping);
    await adapter.setItem(STORAGE_KEY, next);
    return clone(updatedMapping);
  },

  async archive(id: string, orgId?: string | null): Promise<LayoutChecklistMapping> {
    const existing = await this.getById(id, orgId);
    if (!existing) {
      throw new Error(`Layout checklist mapping "${id}" was not found.`);
    }

    return this.update({
      ...existing,
      orgId: existing.orgId ?? orgId ?? null,
      isActive: false,
    });
  },

  async resolveChecklistTemplate(layoutTemplateId: string, orgId?: string | null): Promise<ChecklistTemplate> {
    const layoutTemplate = await LayoutTemplateService.getById(layoutTemplateId, orgId);
    if (!layoutTemplate) {
      throw new Error(`Cannot resolve checklist. Layout template "${layoutTemplateId}" was not found.`);
    }

    if (!layoutTemplate.isActive) {
      throw new Error(`Cannot resolve checklist. Layout template "${layoutTemplateId}" is archived.`);
    }

    const mappings = (await this.listActive(orgId)).filter(
      (mapping) => mapping.layoutTemplateId === layoutTemplateId
    );

    const resolvedMapping = sortMappings(mappings, orgId)[0];

    // Fallback order is intentionally fixed to keep generation predictable:
    // 1. Active mapping for the selected layout (preferring org-specific defaults)
    // 2. The layout template's explicit defaultChecklistTemplateId
    // 3. The seeded global default checklist template
    if (resolvedMapping) {
      const checklistFromMapping = await ChecklistTemplateService.getById(
        resolvedMapping.checklistTemplateId,
        orgId
      );

      if (!checklistFromMapping || !checklistFromMapping.isActive) {
        throw new Error(
          `Mapping "${resolvedMapping.id}" points to unavailable checklist template "${resolvedMapping.checklistTemplateId}".`
        );
      }

      return checklistFromMapping;
    }

    if (layoutTemplate.defaultChecklistTemplateId) {
      const fallbackChecklist = await ChecklistTemplateService.getById(
        layoutTemplate.defaultChecklistTemplateId,
        orgId
      );

      if (!fallbackChecklist || !fallbackChecklist.isActive) {
        throw new Error(
          `Layout template "${layoutTemplate.id}" references unavailable default checklist "${layoutTemplate.defaultChecklistTemplateId}".`
        );
      }

      return fallbackChecklist;
    }

    return ChecklistTemplateService.getDefaultTemplate(orgId);
  },
};
