import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { DEFAULT_LAYOUT_TEMPLATES } from '../data/defaultTemplates';
import { LayoutTemplate } from '../models/templates';
import { createPrefixedId } from '../../services/storage';

const STORAGE_KEY = 'unitflip_layout_templates_v1';
const adapter = createLocalDbAdapter();

type LayoutTemplateCreateInput = Omit<
  LayoutTemplate,
  'id' | 'orgId' | 'isSystem' | 'isActive' | 'version' | 'createdAt' | 'updatedAt'
> & {
  orgId?: string | null;
  isActive?: boolean;
  version?: number;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const createSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const sortLayouts = (layouts: LayoutTemplate[]): LayoutTemplate[] =>
  [...layouts].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    if (a.bedrooms !== b.bedrooms) return a.bedrooms - b.bedrooms;
    if (a.bathroomsFull !== b.bathroomsFull) return a.bathroomsFull - b.bathroomsFull;
    return a.name.localeCompare(b.name);
  });

const isVisibleToOrg = (template: LayoutTemplate, orgId?: string | null): boolean =>
  template.orgId === null || (orgId ? template.orgId === orgId : template.orgId === null);

const getStoredTemplates = async (): Promise<LayoutTemplate[]> =>
  (await adapter.getItem<LayoutTemplate[]>(STORAGE_KEY)) || [];

const mergeTemplates = (storedTemplates: LayoutTemplate[], orgId?: string | null): LayoutTemplate[] => {
  const merged = new Map<string, LayoutTemplate>();

  for (const template of DEFAULT_LAYOUT_TEMPLATES) {
    merged.set(template.id, clone(template));
  }

  for (const template of storedTemplates) {
    if (!isVisibleToOrg(template, orgId)) continue;
    merged.set(template.id, clone(template));
  }

  return sortLayouts([...merged.values()]);
};

const validateLayoutTemplate = (template: Pick<LayoutTemplate, 'name' | 'roomBlueprint'>) => {
  if (!template.name.trim()) {
    throw new Error('Layout template name is required.');
  }

  if (template.roomBlueprint.length === 0) {
    throw new Error('Layout templates must include at least one room.');
  }

  const seenLabels = new Set<string>();
  for (const room of template.roomBlueprint) {
    const normalizedLabel = room.label.trim().toLowerCase();
    if (!normalizedLabel) {
      throw new Error('Every room must have a label.');
    }

    if (seenLabels.has(normalizedLabel)) {
      throw new Error(`Room label "${room.label}" is duplicated. Use unique room labels.`);
    }

    seenLabels.add(normalizedLabel);
  }
};

export const LayoutTemplateService = {
  async listAll(orgId?: string | null): Promise<LayoutTemplate[]> {
    const stored = await getStoredTemplates();
    return mergeTemplates(stored, orgId);
  },

  async listActive(orgId?: string | null): Promise<LayoutTemplate[]> {
    const templates = await this.listAll(orgId);
    return templates.filter((template) => template.isActive);
  },

  async listByOrganization(orgId: string): Promise<LayoutTemplate[]> {
    return this.listAll(orgId);
  },

  async getById(id: string, orgId?: string | null): Promise<LayoutTemplate | null> {
    const templates = await this.listAll(orgId);
    return templates.find((template) => template.id === id) || null;
  },

  async create(input: LayoutTemplateCreateInput): Promise<LayoutTemplate> {
    validateLayoutTemplate(input);
    const stored = await getStoredTemplates();
    const now = Date.now();
    const createdTemplate: LayoutTemplate = {
      ...clone(input),
      id: createPrefixedId('layout_'),
      orgId: input.orgId ?? null,
      slug: input.slug?.trim() || createSlug(input.name),
      isSystem: false,
      isActive: input.isActive ?? true,
      version: input.version ?? 1,
      createdAt: now,
      updatedAt: now,
    };

    stored.push(createdTemplate);
    await adapter.setItem(STORAGE_KEY, stored);
    return clone(createdTemplate);
  },

  async update(template: LayoutTemplate): Promise<LayoutTemplate> {
    const stored = await getStoredTemplates();
    const existing = await this.getById(template.id, template.orgId);
    if (!existing) {
      throw new Error(`Layout template "${template.id}" was not found.`);
    }

    if (existing.isSystem) {
      throw new Error('System layout templates cannot be edited directly. Duplicate and customize instead.');
    }

    validateLayoutTemplate(template);

    const updatedTemplate: LayoutTemplate = {
      ...clone(template),
      slug: template.slug?.trim() || createSlug(template.name),
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    const next = stored.filter((item) => item.id !== template.id);
    next.push(updatedTemplate);
    await adapter.setItem(STORAGE_KEY, next);
    return clone(updatedTemplate);
  },

  async archive(id: string, orgId?: string | null): Promise<LayoutTemplate> {
    const existing = await this.getById(id, orgId);
    if (!existing) {
      throw new Error(`Layout template "${id}" was not found.`);
    }

    if (existing.isSystem) {
      throw new Error('System layout templates cannot be archived. Duplicate and customize instead.');
    }

    return this.update({
      ...existing,
      orgId: existing.orgId ?? orgId ?? null,
      isActive: false,
    });
  },

  async duplicate(id: string, orgId?: string | null): Promise<LayoutTemplate> {
    const existing = await this.getById(id, orgId);
    if (!existing) {
      throw new Error(`Layout template "${id}" was not found.`);
    }

    return this.create({
      orgId: orgId ?? existing.orgId ?? null,
      name: `${existing.name} (Custom)`,
      slug: `${existing.slug}-custom`,
      unitType: existing.unitType,
      bedrooms: existing.bedrooms,
      bathroomsFull: existing.bathroomsFull,
      bathroomsHalf: existing.bathroomsHalf,
      defaultChecklistTemplateId: existing.defaultChecklistTemplateId,
      roomBlueprint: existing.roomBlueprint.map((room, index) => ({
        ...clone(room),
        id: createPrefixedId(`layout_room_${index}_`),
      })),
    });
  },
};
