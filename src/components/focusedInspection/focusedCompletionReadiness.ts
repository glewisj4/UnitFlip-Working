import { FocusedItemAction, GeneratedInspectionItem, GeneratedInspectionSection } from '../../core/models/templates';

export interface FocusedCompletionReadinessHelpers {
  isGoodFocusedAction: (action?: FocusedItemAction | null) => boolean;
  isIssueFocusedAction: (action?: FocusedItemAction | null) => boolean;
  isAlwaysReplaceChecklistItem: (item: GeneratedInspectionItem) => boolean;
  hasAlwaysReplaceInputCaptured: (item: GeneratedInspectionItem) => boolean;
  isAlwaysReplaceInputComplete: (item: GeneratedInspectionItem) => boolean;
  itemNeedsFollowThrough: (item: GeneratedInspectionItem) => boolean;
  getRoomKey: (section: GeneratedInspectionSection) => string;
  titleCase: (value?: string | null) => string;
}

export interface FocusedCompletionSummary {
  totalItems: number;
  handledCount: number;
  goodCount: number;
  repairCount: number;
  replaceCount: number;
  issueItemsNeedingMaterialsCount: number;
  alwaysReplacePendingCount: number;
  reportReadinessCount: number;
}

export interface FocusedDecisionProgress {
  inspectedCount: number;
  totalCount: number;
  decisionsLeft: number;
  percentComplete: number;
}

export interface FocusedNeedsMaterialsItem {
  roomId: string;
  roomLabel: string;
  item: GeneratedInspectionItem;
  actionLabel: string;
  isAlwaysReplace: boolean;
}

export type FocusedCompletionPrimaryAction = 'finish_materials' | 'generate_report';

const hasNoMaterialRequirement = (item: GeneratedInspectionItem) => (item.materialRequirementIds?.length || 0) === 0;

export const buildFocusedCompletionSummary = (
  items: GeneratedInspectionItem[],
  helpers: FocusedCompletionReadinessHelpers
): FocusedCompletionSummary => {
  const goodCount = items.filter((item) => helpers.isGoodFocusedAction(item.focusedAction)).length;
  const repairCount = items.filter((item) => item.focusedAction === 'repair').length;
  const replaceCount = items.filter((item) => item.focusedAction === 'replace').length;
  const handledCount = items.filter((item) => !helpers.itemNeedsFollowThrough(item)).length;
  const issueItemsNeedingMaterialsCount = items.filter(
    (item) => helpers.isIssueFocusedAction(item.focusedAction) && hasNoMaterialRequirement(item)
  ).length;
  const alwaysReplacePendingCount = items.filter(
    (item) =>
      helpers.isAlwaysReplaceChecklistItem(item) &&
      helpers.hasAlwaysReplaceInputCaptured(item) &&
      hasNoMaterialRequirement(item)
  ).length;

  return {
    totalItems: items.length,
    handledCount,
    goodCount,
    repairCount,
    replaceCount,
    issueItemsNeedingMaterialsCount,
    alwaysReplacePendingCount,
    reportReadinessCount: issueItemsNeedingMaterialsCount + alwaysReplacePendingCount,
  };
};

export const buildFocusedDecisionProgress = (
  items: GeneratedInspectionItem[],
  helpers: Pick<FocusedCompletionReadinessHelpers, 'isAlwaysReplaceChecklistItem' | 'isAlwaysReplaceInputComplete'>
): FocusedDecisionProgress => {
  const inspectedCount = items.filter((item) =>
    helpers.isAlwaysReplaceChecklistItem(item) ? helpers.isAlwaysReplaceInputComplete(item) : Boolean(item.focusedAction)
  ).length;
  const totalCount = items.length;

  return {
    inspectedCount,
    totalCount,
    decisionsLeft: Math.max(totalCount - inspectedCount, 0),
    percentComplete: totalCount > 0 ? Math.round((inspectedCount / totalCount) * 100) : 0,
  };
};

export const buildFocusedNeedsMaterialsItems = (
  sections: GeneratedInspectionSection[],
  helpers: Pick<
    FocusedCompletionReadinessHelpers,
    | 'isIssueFocusedAction'
    | 'isAlwaysReplaceChecklistItem'
    | 'hasAlwaysReplaceInputCaptured'
    | 'isAlwaysReplaceInputComplete'
    | 'getRoomKey'
    | 'titleCase'
  >
): FocusedNeedsMaterialsItem[] =>
  sections.flatMap((section) =>
    section.items
      .filter(
        (item) =>
          (helpers.isIssueFocusedAction(item.focusedAction) && hasNoMaterialRequirement(item)) ||
          (helpers.isAlwaysReplaceChecklistItem(item) &&
            helpers.hasAlwaysReplaceInputCaptured(item) &&
            hasNoMaterialRequirement(item) &&
            helpers.isAlwaysReplaceInputComplete(item))
      )
      .map((item) => ({
        roomId: helpers.getRoomKey(section),
        roomLabel: section.roomLabel || helpers.getRoomKey(section),
        item,
        actionLabel: helpers.isAlwaysReplaceChecklistItem(item) ? 'Replace' : helpers.titleCase(item.focusedAction),
        isAlwaysReplace: helpers.isAlwaysReplaceChecklistItem(item),
      }))
  );

export const getFocusedCompletionPrimaryAction = (hasReportReadinessGaps: boolean): FocusedCompletionPrimaryAction =>
  hasReportReadinessGaps ? 'finish_materials' : 'generate_report';

export const getFocusedReadinessDetail = (needsMaterialsCount: number, hasReportReadinessGaps: boolean) =>
  hasReportReadinessGaps
    ? `${needsMaterialsCount} item${needsMaterialsCount === 1 ? '' : 's'} still need materials before the report is ready.`
    : 'Materials are ready. Generate the report when you are ready to hand off this inspection.';
