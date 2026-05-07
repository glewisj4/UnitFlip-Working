import {
  ChecklistScopedOverride,
  ChecklistRecipeSection,
  ChecklistTemplate,
  GeneratedInspectionItem,
  GeneratedInspectionSection,
  InspectionTemplateSnapshot,
  LayoutRoomBlueprint,
  LayoutTemplate,
  TurnoverPreset,
  TurnoverPresetId,
  TurnoverPresetRule,
} from '../models/templates';
import { createDeterministicPrefixedId } from '../../services/storage';
import { Unit } from '../models/inspections';
import { ChecklistTemplateService } from './ChecklistTemplateService';
import { ChecklistScopedOverrideService } from './ChecklistScopedOverrideService';
import { LayoutChecklistMappingService } from './LayoutChecklistMappingService';
import { LayoutTemplateService } from './LayoutTemplateService';
import { TurnoverPresetService } from './TurnoverPresetService';

export interface InspectionTemplateGenerationResult {
  snapshot: InspectionTemplateSnapshot;
  sections: GeneratedInspectionSection[];
  items: GeneratedInspectionItem[];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const sortRooms = (rooms: LayoutRoomBlueprint[]): LayoutRoomBlueprint[] =>
  [...rooms].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if ((a.sequence ?? 0) !== (b.sequence ?? 0)) return (a.sequence ?? 0) - (b.sequence ?? 0);
    return a.label.localeCompare(b.label);
  });

const sortSections = (sections: ChecklistRecipeSection[]): ChecklistRecipeSection[] =>
  [...sections].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });

const normalizeList = (values?: string[]) =>
  Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));

const inferInputMode = (itemTemplate: ChecklistRecipeSection['items'][number]) => {
  if (itemTemplate.inputMode && itemTemplate.inputMode !== 'none') {
    return itemTemplate.inputMode;
  }

  if (!itemTemplate.requiresMeasurements) {
    if ((itemTemplate.defaultActionMode === 'always_replace' || itemTemplate.itemType === 'always_replace') && itemTemplate.defaultQuantity) {
      return 'count' as const;
    }
    return 'none' as const;
  }

  const normalizedFields = normalizeList(itemTemplate.dataFields).map((field) => field.toLowerCase());
  if (normalizedFields.includes('width') && normalizedFields.includes('height')) {
    return 'dimensions' as const;
  }
  if (normalizedFields.some((field) => ['area', 'sqft', 'square_feet', 'square footage'].includes(field))) {
    return 'area' as const;
  }
  return itemTemplate.inputMode || 'none';
};

const inferItemType = (itemTemplate: ChecklistRecipeSection['items'][number]) => {
  if (itemTemplate.itemType) return itemTemplate.itemType;
  return itemTemplate.defaultActionMode === 'always_replace' ? 'always_replace' : 'inspection';
};

const resolvePresetRule = (
  itemTemplate: ChecklistRecipeSection['items'][number],
  preset: TurnoverPreset | null
): TurnoverPresetRule | null => preset?.rules.find((rule) => rule.templateItemId === itemTemplate.id) || null;

const resolveActionMode = (
  itemTemplate: ChecklistRecipeSection['items'][number],
  presetRule: TurnoverPresetRule | null
) => {
  const baseActionMode =
    itemTemplate.defaultActionMode || (itemTemplate.itemType === 'always_replace' ? 'always_replace' : 'inspect');
  if (presetRule?.actionMode === 'always_replace' && !(itemTemplate.supportsAlwaysReplace || itemTemplate.itemType === 'always_replace')) {
    return baseActionMode;
  }
  return presetRule?.actionMode || baseActionMode;
};

function assertTemplateIsUsable(
  layoutTemplate: LayoutTemplate | null,
  checklistTemplate: ChecklistTemplate | null
): asserts checklistTemplate is ChecklistTemplate {
  if (!layoutTemplate) {
    throw new Error('Inspection template generation requires a layout template.');
  }

  if (!checklistTemplate) {
    throw new Error('Inspection template generation requires a checklist template.');
  }

  if (!layoutTemplate.isActive) {
    throw new Error(`Layout template "${layoutTemplate.id}" is archived and cannot be used.`);
  }

  if (!checklistTemplate.isActive) {
    throw new Error(`Checklist template "${checklistTemplate.id}" is archived and cannot be used.`);
  }
}

const getTargetRooms = (
  layoutTemplate: LayoutTemplate,
  recipeSection: ChecklistRecipeSection
): LayoutRoomBlueprint[] => {
  if (recipeSection.appliesTo === 'unit') {
    return [];
  }

  if (!recipeSection.roomType) {
    throw new Error(
      `Checklist section "${recipeSection.title}" uses "${recipeSection.appliesTo}" but does not declare a roomType.`
    );
  }

  const matchingRooms = sortRooms(layoutTemplate.roomBlueprint).filter(
    (room) => room.roomType === recipeSection.roomType
  );

  if (matchingRooms.length === 0) {
    throw new Error(
      `Checklist section "${recipeSection.title}" targets room type "${recipeSection.roomType}" but layout "${layoutTemplate.name}" has no matching rooms.`
    );
  }

  if (recipeSection.appliesTo === 'specific_room_type') {
    return [matchingRooms[0]];
  }

  if (recipeSection.appliesTo === 'each_room_type') {
    return matchingRooms;
  }

  throw new Error(
    `Checklist section "${recipeSection.title}" uses unsupported application mode "${recipeSection.appliesTo}".`
  );
};

const buildSectionItems = (
  recipeSection: ChecklistRecipeSection,
  sectionId: string,
  preset: TurnoverPreset | null,
  scopedOverrideLookup: Record<string, ChecklistScopedOverride | undefined>,
  room?: LayoutRoomBlueprint
): GeneratedInspectionItem[] =>
  recipeSection.items.map((itemTemplate, itemIndex) => {
    const presetRule = resolvePresetRule(itemTemplate, preset);
    const scopedOverride = scopedOverrideLookup[itemTemplate.id];
    const supportsAlwaysReplace = Boolean(itemTemplate.supportsAlwaysReplace || itemTemplate.itemType === 'always_replace');
    const defaultActionMode = scopedOverride?.actionMode || resolveActionMode(itemTemplate, presetRule);
    const itemType =
      defaultActionMode === 'always_replace' && supportsAlwaysReplace
        ? 'always_replace'
        : itemTemplate.itemType === 'conditional'
          ? 'conditional'
          : 'inspection';
    const inputMode = itemType === 'always_replace' ? inferInputMode(itemTemplate) : 'none';

    return {
      id: createDeterministicPrefixedId('gii_', [sectionId, itemTemplate.id, itemIndex + 1]),
      sourceTemplateItemId: itemTemplate.id,
      sourceRecipeSectionId: recipeSection.id,
      label: itemTemplate.label,
      category: itemTemplate.category,
      repairOptions: normalizeList(itemTemplate.repairOptions),
      replaceOptions: normalizeList(itemTemplate.replaceOptions),
      requiresMeasurements: Boolean(itemTemplate.requiresMeasurements),
      dataFields: normalizeList(itemTemplate.dataFields),
      lowesCategory: itemTemplate.lowesCategory?.trim() || undefined,
      supportsAlwaysReplace,
      defaultActionMode,
      preferredReplaceOption: scopedOverride?.preferredReplaceOption?.trim() || presetRule?.preferredReplaceOption?.trim() || undefined,
      preferredProductTier: scopedOverride?.preferredProductTier || presetRule?.preferredProductTier || preset?.preferredProductTier,
      turnoverPresetId: preset?.id || null,
      turnoverPresetNotes: presetRule?.notes?.trim() || undefined,
      scopedOverrideId: scopedOverride?.id,
      scopedOverrideScopeType: scopedOverride?.scopeType,
      scopedOverrideScopeRefId: scopedOverride?.scopeRefId,
      scopedOverrideNotes: scopedOverride?.notes?.trim() || undefined,
      itemType,
      inputMode,
      status: 'not_started',
      required: itemTemplate.required,
      photoIds: [],
      defaultQuantity: itemTemplate.defaultQuantity,
      materialReference: itemTemplate.materialReference,
      inputValue: undefined,
      roomType: room?.roomType,
      roomLabel: room?.label,
      notes: undefined,
      order: itemIndex + 1,
      severity: itemTemplate.severityDefault,
      findingIds: [],
      repairTaskIds: [],
      materialRequirementIds: [],
      updatedAt: Date.now(),
    };
  });

export const InspectionTemplateGenerationService = {
  async generateFromLayout(params: {
    layoutTemplateId: string;
    checklistTemplateId?: string;
    orgId?: string | null;
    turnoverPresetId?: TurnoverPresetId | null;
    unit?: Unit | null;
  }): Promise<InspectionTemplateGenerationResult> {
    const layoutTemplate = await LayoutTemplateService.getById(params.layoutTemplateId, params.orgId);
    if (!layoutTemplate) {
      throw new Error(`Layout template "${params.layoutTemplateId}" was not found.`);
    }

    const checklistTemplate = params.checklistTemplateId
      ? await ChecklistTemplateService.getById(params.checklistTemplateId, params.orgId)
      : await LayoutChecklistMappingService.resolveChecklistTemplate(params.layoutTemplateId, params.orgId);

    if (params.checklistTemplateId && !checklistTemplate) {
      throw new Error(`Checklist template "${params.checklistTemplateId}" was not found.`);
    }

    const scopedOverrides =
      params.orgId && params.unit
        ? await ChecklistScopedOverrideService.listAll(params.orgId)
        : params.orgId
          ? await ChecklistScopedOverrideService.listAll(params.orgId)
          : [];

    return this.generateSnapshot({
      layoutTemplate,
      checklistTemplate: checklistTemplate || null,
      turnoverPreset: TurnoverPresetService.getById(params.turnoverPresetId || null),
      scopedOverrides,
      unit: params.unit || null,
      organizationId: params.orgId || null,
    });
  },

  generateSnapshot(params: {
    layoutTemplate: LayoutTemplate | null;
    checklistTemplate: ChecklistTemplate | null;
    turnoverPreset?: TurnoverPreset | null;
    scopedOverrides?: ChecklistScopedOverride[];
    unit?: Unit | null;
    organizationId?: string | null;
  }): InspectionTemplateGenerationResult {
    const layoutTemplate = params.layoutTemplate;
    const checklistTemplate = params.checklistTemplate;
    const turnoverPreset = params.turnoverPreset || null;
    const scopedOverrides = params.scopedOverrides || [];
    assertTemplateIsUsable(layoutTemplate, checklistTemplate);

    const allTemplateItemIds = checklistTemplate.recipeSections.flatMap((section) => section.items.map((item) => item.id));
    const scopedOverrideLookup =
      params.organizationId
        ? ChecklistScopedOverrideService.buildEffectiveOverrideLookup(scopedOverrides, {
            organizationId: params.organizationId,
            unit: params.unit || null,
            templateItemIds: allTemplateItemIds,
          })
        : {};
    const appliedScopedOverrideIds = Array.from(
      new Set(
        Object.values(scopedOverrideLookup)
          .map((entry) => entry?.id)
          .filter((entry): entry is string => Boolean(entry))
      )
    );

    const generatedAt = Date.now();
    const snapshot: InspectionTemplateSnapshot = {
      layoutTemplateId: layoutTemplate.id,
      layoutTemplateVersion: layoutTemplate.version,
      checklistTemplateId: checklistTemplate.id,
      checklistTemplateVersion: checklistTemplate.version,
      turnoverPresetId: turnoverPreset?.id || null,
      turnoverPresetLabel: turnoverPreset?.label || null,
      turnoverPresetProductTier: turnoverPreset?.preferredProductTier || null,
      appliedScopedOverrideIds,
      generatedAt,
    };

    const sections: GeneratedInspectionSection[] = [];
    let generatedSectionOrder = 1;

    for (const recipeSection of sortSections(checklistTemplate.recipeSections)) {
      if (recipeSection.appliesTo === 'unit') {
        const sectionId = createDeterministicPrefixedId('gis_', [
          layoutTemplate.id,
          checklistTemplate.id,
          recipeSection.id,
          'unit',
        ]);
        const items = buildSectionItems(recipeSection, sectionId, turnoverPreset, scopedOverrideLookup);
        sections.push({
          id: sectionId,
          sourceRecipeSectionId: recipeSection.id,
          title: recipeSection.title,
          order: generatedSectionOrder,
          items,
        });
        generatedSectionOrder += 1;
        continue;
      }

      const targetRooms = getTargetRooms(layoutTemplate, recipeSection);
      for (const room of targetRooms) {
        const sectionId = createDeterministicPrefixedId('gis_', [
          layoutTemplate.id,
          checklistTemplate.id,
          recipeSection.id,
          room.id,
        ]);
        const items = buildSectionItems(recipeSection, sectionId, turnoverPreset, scopedOverrideLookup, room);

        sections.push({
          id: sectionId,
          sourceRecipeSectionId: recipeSection.id,
          title: room.label,
          roomType: room.roomType,
          roomLabel: room.label,
          order: generatedSectionOrder,
          items,
        });
        generatedSectionOrder += 1;
      }
    }

    const items = sections.flatMap((section) => section.items.map((item) => clone(item)));

    return {
      snapshot,
      sections,
      items,
    };
  },
};
