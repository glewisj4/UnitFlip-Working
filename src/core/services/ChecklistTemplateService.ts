import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import {
  DEFAULT_CHECKLIST_TEMPLATE_ID,
  DEFAULT_CHECKLIST_TEMPLATES,
} from '../data/defaultTemplates';
import { ChecklistTemplate } from '../models/templates';
import { createPrefixedId } from '../../services/storage';

const STORAGE_KEY = 'unitflip_checklist_templates_v1';
const adapter = createLocalDbAdapter();

type ChecklistTemplateCreateInput = Omit<
  ChecklistTemplate,
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

const sortChecklists = (checklists: ChecklistTemplate[]): ChecklistTemplate[] =>
  [...checklists].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

const isVisibleToOrg = (template: ChecklistTemplate, orgId?: string | null): boolean =>
  template.orgId === null || (orgId ? template.orgId === orgId : template.orgId === null);

const getStoredTemplates = async (): Promise<ChecklistTemplate[]> =>
  (await adapter.getItem<ChecklistTemplate[]>(STORAGE_KEY)) || [];

const mergeTemplates = (storedTemplates: ChecklistTemplate[], orgId?: string | null): ChecklistTemplate[] => {
  const merged = new Map<string, ChecklistTemplate>();

  for (const template of DEFAULT_CHECKLIST_TEMPLATES) {
    merged.set(template.id, clone(template));
  }

  for (const template of storedTemplates) {
    if (!isVisibleToOrg(template, orgId)) continue;
    merged.set(template.id, clone(template));
  }

  return sortChecklists([...merged.values()]);
};

const validateChecklistTemplate = (template: Pick<ChecklistTemplate, 'name' | 'recipeSections'>) => {
  if (!template.name.trim()) {
    throw new Error('Checklist template name is required.');
  }

  if (template.recipeSections.length === 0) {
    throw new Error('Checklist templates must include at least one section.');
  }

  template.recipeSections.forEach((section) => {
    if (!section.title.trim()) {
      throw new Error('Checklist section titles cannot be empty.');
    }

    if ((section.appliesTo === 'each_room_type' || section.appliesTo === 'specific_room_type') && !section.roomType) {
      throw new Error(`Section "${section.title}" must define a room type for its application mode.`);
    }

    if (section.appliesTo === 'unit' && section.roomType) {
      throw new Error(`Section "${section.title}" cannot set a room type when it applies to the whole unit.`);
    }

    if (section.items.length === 0) {
      throw new Error(`Section "${section.title}" must contain at least one checklist item.`);
    }

    section.items.forEach((item) => {
      if (!item.label.trim()) {
        throw new Error(`Section "${section.title}" contains an empty checklist item label.`);
      }
    });
  });
};

export const ChecklistTemplateService = {
  async listAll(orgId?: string | null): Promise<ChecklistTemplate[]> {
    const stored = await getStoredTemplates();
    return mergeTemplates(stored, orgId);
  },

  async listActive(orgId?: string | null): Promise<ChecklistTemplate[]> {
    const templates = await this.listAll(orgId);
    return templates.filter((template) => template.isActive);
  },

  async listByOrganization(orgId: string): Promise<ChecklistTemplate[]> {
    return this.listAll(orgId);
  },

  async getById(id: string, orgId?: string | null): Promise<ChecklistTemplate | null> {
    const templates = await this.listAll(orgId);
    return templates.find((template) => template.id === id) || null;
  },

  async getDefaultTemplate(orgId?: string | null): Promise<ChecklistTemplate> {
    const template = await this.getById(DEFAULT_CHECKLIST_TEMPLATE_ID, orgId);
    if (!template || !template.isActive) {
      throw new Error('The default checklist template is unavailable or archived.');
    }
    return template;
  },

  async create(input: ChecklistTemplateCreateInput): Promise<ChecklistTemplate> {
    validateChecklistTemplate(input);
    const stored = await getStoredTemplates();
    const now = Date.now();
    const createdTemplate: ChecklistTemplate = {
      ...clone(input),
      id: createPrefixedId('chk_'),
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

  async update(template: ChecklistTemplate): Promise<ChecklistTemplate> {
    const stored = await getStoredTemplates();
    const existing = await this.getById(template.id, template.orgId);
    if (!existing) {
      throw new Error(`Checklist template "${template.id}" was not found.`);
    }

    if (existing.isSystem) {
      throw new Error('System checklist templates cannot be edited directly. Duplicate and customize instead.');
    }

    validateChecklistTemplate(template);

    const updatedTemplate: ChecklistTemplate = {
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

  async archive(id: string, orgId?: string | null): Promise<ChecklistTemplate> {
    const existing = await this.getById(id, orgId);
    if (!existing) {
      throw new Error(`Checklist template "${id}" was not found.`);
    }

    if (existing.isSystem) {
      throw new Error('System checklist templates cannot be archived. Duplicate and customize instead.');
    }

    return this.update({
      ...existing,
      orgId: existing.orgId ?? orgId ?? null,
      isActive: false,
    });
  },

  async duplicate(id: string, orgId?: string | null): Promise<ChecklistTemplate> {
    const existing = await this.getById(id, orgId);
    if (!existing) {
      throw new Error(`Checklist template "${id}" was not found.`);
    }

    return this.create({
      orgId: orgId ?? existing.orgId ?? null,
      name: `${existing.name} (Custom)`,
      slug: `${existing.slug}-custom`,
      recipeSections: existing.recipeSections.map((section, sectionIndex) => ({
        ...clone(section),
        id: createPrefixedId(`recipe_${sectionIndex}_`),
        items: section.items.map((item, itemIndex) => ({
          ...clone(item),
          id: createPrefixedId(`recipe_item_${sectionIndex}_${itemIndex}_`),
        })),
      })),
    });
  },
};
