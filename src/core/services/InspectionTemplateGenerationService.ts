import {
  ChecklistRecipeSection,
  ChecklistTemplate,
  GeneratedInspectionItem,
  GeneratedInspectionSection,
  InspectionTemplateSnapshot,
  LayoutRoomBlueprint,
  LayoutTemplate,
} from '../models/templates';
import { createDeterministicPrefixedId } from '../../services/storage';
import { ChecklistTemplateService } from './ChecklistTemplateService';
import { LayoutChecklistMappingService } from './LayoutChecklistMappingService';
import { LayoutTemplateService } from './LayoutTemplateService';

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
  room?: LayoutRoomBlueprint
): GeneratedInspectionItem[] =>
  recipeSection.items.map((itemTemplate, itemIndex) => ({
    id: createDeterministicPrefixedId('gii_', [sectionId, itemTemplate.id, itemIndex + 1]),
    sourceTemplateItemId: itemTemplate.id,
    sourceRecipeSectionId: recipeSection.id,
    label: itemTemplate.label,
    category: itemTemplate.category,
    status: 'not_started',
    required: itemTemplate.required,
    photoIds: [],
    roomType: room?.roomType,
    roomLabel: room?.label,
    notes: undefined,
    order: itemIndex + 1,
    severity: itemTemplate.severityDefault,
    findingIds: [],
    repairTaskIds: [],
    materialRequirementIds: [],
    updatedAt: Date.now(),
  }));

export const InspectionTemplateGenerationService = {
  async generateFromLayout(params: {
    layoutTemplateId: string;
    checklistTemplateId?: string;
    orgId?: string | null;
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

    return this.generateSnapshot({
      layoutTemplate,
      checklistTemplate: checklistTemplate || null,
    });
  },

  generateSnapshot(params: {
    layoutTemplate: LayoutTemplate | null;
    checklistTemplate: ChecklistTemplate | null;
  }): InspectionTemplateGenerationResult {
    const layoutTemplate = params.layoutTemplate;
    const checklistTemplate = params.checklistTemplate;
    assertTemplateIsUsable(layoutTemplate, checklistTemplate);

    const generatedAt = Date.now();
    const snapshot: InspectionTemplateSnapshot = {
      layoutTemplateId: layoutTemplate.id,
      layoutTemplateVersion: layoutTemplate.version,
      checklistTemplateId: checklistTemplate.id,
      checklistTemplateVersion: checklistTemplate.version,
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
        const items = buildSectionItems(recipeSection, sectionId);
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
        const items = buildSectionItems(recipeSection, sectionId, room);

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
