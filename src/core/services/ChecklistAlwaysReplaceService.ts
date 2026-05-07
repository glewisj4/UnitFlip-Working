import { MaterialRequirement, RepairTask, TRADE_OPTIONS, TradeOption } from '../models/operations';
import { GeneratedInspectionItem, GeneratedInspectionSection } from '../models/templates';
import { MaterialRequirementService } from './MaterialRequirementService';
import { RepairTaskService } from './RepairTaskService';

interface CommitAlwaysReplaceParams {
  orgId: string;
  userId: string;
  inspectionId: string;
  unitId: string;
  section: GeneratedInspectionSection;
  item: GeneratedInspectionItem;
  existingTask?: RepairTask | null;
  existingRequirement?: MaterialRequirement | null;
}

interface CommitAlwaysReplaceResult {
  task: RepairTask;
  requirement: MaterialRequirement;
}

const CATEGORY_TO_TRADE: Partial<Record<string, TradeOption>> = {
  electrical: 'electrical',
  plumbing: 'plumbing',
  flooring: 'flooring',
  safety: 'safety',
  bathroom: 'fixture',
  kitchen: 'fixture',
  bedroom: 'finish',
  living_room: 'finish',
  blinds: 'finish',
  filter: 'general',
};

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const inferTrade = (item: GeneratedInspectionItem): TradeOption => {
  const normalizedLabel = item.label.toLowerCase();
  if (normalizedLabel.includes('outlet') || normalizedLabel.includes('switch')) return 'electrical';
  if (normalizedLabel.includes('filter')) return 'general';
  if (normalizedLabel.includes('smoke detector')) return 'safety';
  if (normalizedLabel.includes('blind')) return 'finish';
  if (normalizedLabel.includes('floor')) return 'flooring';
  return CATEGORY_TO_TRADE[item.category.toLowerCase()] || 'general';
};

const buildTaskTitle = (item: GeneratedInspectionItem) => `Replace ${item.label}`.trim();

const buildRequirementQuantity = (item: GeneratedInspectionItem) => {
  if (item.inputMode === 'count') {
    return {
      quantity: item.inputValue?.quantity ?? item.defaultQuantity ?? 1,
      unit: item.materialReference?.unit || 'ea',
    };
  }

  if (item.inputMode === 'area') {
    return {
      quantity: item.inputValue?.area ?? 0,
      unit: item.materialReference?.unit || 'sq_ft',
    };
  }

  if (item.inputMode === 'dimensions') {
    return {
      quantity: 1,
      unit: item.materialReference?.unit || 'opening',
    };
  }

  return {
    quantity: item.defaultQuantity ?? 1,
    unit: item.materialReference?.unit || 'ea',
  };
};

const buildMeasurementNote = (item: GeneratedInspectionItem) => {
  if (item.inputMode === 'dimensions' && item.inputValue?.dimensions) {
    const unit = item.inputValue.dimensions.unit || 'in';
    return `Measured ${item.inputValue.dimensions.width}${unit} x ${item.inputValue.dimensions.height}${unit}.`;
  }

  if (item.inputMode === 'area' && typeof item.inputValue?.area === 'number') {
    return `Measured area: ${item.inputValue.area} ${item.materialReference?.unit || 'sq_ft'}.`;
  }

  if (item.inputMode === 'count' && typeof item.inputValue?.quantity === 'number') {
    return `Quantity confirmed: ${item.inputValue.quantity} ${item.materialReference?.unit || 'ea'}.`;
  }

  return '';
};

const combineNotes = (...values: Array<string | undefined>) => {
  const normalized = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return normalized.length > 0 ? normalized.join('\n') : undefined;
};

const validateItemInput = (item: GeneratedInspectionItem) => {
  if (item.itemType !== 'always_replace') {
    throw new Error('Only always-replace checklist items can use the direct replacement path.');
  }

  if (item.inputMode === 'count') {
    const quantity = item.inputValue?.quantity ?? item.defaultQuantity;
    if (!quantity || quantity <= 0) {
      throw new Error('Enter a quantity before saving this always-replace item.');
    }
  }

  if (item.inputMode === 'dimensions') {
    const dimensions = item.inputValue?.dimensions;
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error('Enter width and height before saving this always-replace item.');
    }
  }

  if (item.inputMode === 'area') {
    const area = item.inputValue?.area;
    if (!area || area <= 0) {
      throw new Error('Enter the area measurement before saving this always-replace item.');
    }
  }
};

export const ChecklistAlwaysReplaceService = {
  async commitItem(params: CommitAlwaysReplaceParams): Promise<CommitAlwaysReplaceResult> {
    validateItemInput(params.item);

    const fallbackTask = params.existingTask
      ? null
      : (await RepairTaskService.listTasks(params.orgId, { inspectionId: params.inspectionId })).find(
          (task) => task.metadata?.sourceGeneratedItemId === params.item.id
        ) || null;
    const fallbackRequirement = params.existingRequirement
      ? null
      : (await MaterialRequirementService.listRequirements(params.orgId, { inspectionId: params.inspectionId })).find(
          (requirement) => requirement.sourceGeneratedItemId === params.item.id
        ) || null;
    const existingTask = params.existingTask || fallbackTask;
    const existingRequirement = params.existingRequirement || fallbackRequirement;
    const trade = inferTrade(params.item);
    const taskTitle = buildTaskTitle(params.item);
    const roomLabel = params.item.roomLabel || params.section.title;
    const quantity = buildRequirementQuantity(params.item);
    const measurementNote = buildMeasurementNote(params.item);
    const metadata = {
      source: 'checklist_always_replace',
      checklistOrigin: true,
      checklistSectionId: params.section.id,
      checklistSectionLabel: params.section.title,
      checklistItemId: params.item.id,
      checklistItemLabel: params.item.label,
      checklistItemType: params.item.itemType,
      checklistInputMode: params.item.inputMode,
      checklistInputValue: params.item.inputValue,
      checklistRepairOptions: params.item.repairOptions,
      checklistReplaceOptions: params.item.replaceOptions,
      checklistRequiresMeasurements: params.item.requiresMeasurements,
      checklistDataFields: params.item.dataFields,
      checklistLowesCategory: params.item.lowesCategory,
      checklistSupportsAlwaysReplace: params.item.supportsAlwaysReplace,
      checklistDefaultActionMode: params.item.defaultActionMode,
      checklistScopedOverrideId: params.item.scopedOverrideId,
      checklistScopedOverrideScopeType: params.item.scopedOverrideScopeType,
      checklistScopedOverrideScopeRefId: params.item.scopedOverrideScopeRefId,
      checklistScopedOverrideNotes: params.item.scopedOverrideNotes,
      sourceGeneratedSectionId: params.section.id,
      sourceGeneratedItemId: params.item.id,
      roomLabel,
      materialReference: params.item.materialReference,
    };

    const task = existingTask
      ? await RepairTaskService.updateTask(
          params.orgId,
          {
            ...existingTask,
            title: taskTitle,
            trade,
            priority: trade === 'safety' ? 'high' : 'medium',
            status: existingTask.status === 'done' ? 'ready' : existingTask.status,
            notes: combineNotes(params.item.notes, measurementNote),
            metadata: {
              ...(existingTask.metadata || {}),
              ...metadata,
            },
          },
          params.userId
        )
      : await RepairTaskService.createTask(
          params.orgId,
          {
            orgId: params.orgId,
            inspectionId: params.inspectionId,
            unitId: params.unitId,
            findingIds: [],
            title: taskTitle,
            trade,
            priority: trade === 'safety' ? 'high' : 'medium',
            status: 'ready',
            notes: combineNotes(params.item.notes, measurementNote),
            metadata,
          },
          params.userId
        );

    const requirement = existingRequirement
      ? await MaterialRequirementService.updateRequirement(
          params.orgId,
          {
            ...existingRequirement,
            repairTaskId: task.id,
            category: params.item.category,
            itemDescription: params.item.materialReference?.label || params.item.label,
            quantity: quantity.quantity,
            unit: quantity.unit,
            confidence: 'high',
            source: 'manual',
            status: existingRequirement.status === 'fulfilled' ? 'reviewed' : existingRequirement.status,
            notes: combineNotes(params.item.notes, measurementNote),
            roomLabel,
            sourceGeneratedSectionId: params.section.id,
            sourceGeneratedItemId: params.item.id,
            metadata: {
              ...(existingRequirement.metadata || {}),
              ...metadata,
            },
          },
          params.userId
        )
      : await MaterialRequirementService.createRequirement(
          params.orgId,
          {
            orgId: params.orgId,
            inspectionId: params.inspectionId,
            repairTaskId: task.id,
            category: params.item.category,
            itemDescription: params.item.materialReference?.label || params.item.label,
            quantity: quantity.quantity,
            unit: quantity.unit,
            confidence: 'high',
            source: 'manual',
            status: 'reviewed',
            notes: combineNotes(params.item.notes, measurementNote),
            roomLabel,
            sourceGeneratedSectionId: params.section.id,
            sourceGeneratedItemId: params.item.id,
            metadata,
          },
          params.userId
        );

    return {
      task,
      requirement,
    };
  },

  describeInput(item: GeneratedInspectionItem) {
    if (item.inputMode === 'count') {
      return `${titleCase(item.itemType)} • Count`;
    }
    if (item.inputMode === 'dimensions') {
      return `${titleCase(item.itemType)} • Width x Height`;
    }
    if (item.inputMode === 'area') {
      return `${titleCase(item.itemType)} • Area`;
    }
    return titleCase(item.itemType);
  },
};
