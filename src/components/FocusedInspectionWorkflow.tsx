import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  ClipboardList,
  Hash,
  Home,
  PackageCheck,
  Plus,
  Ruler,
  Save,
  Search,
  StickyNote,
  WifiOff,
} from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { useSyncEngine } from '../core/hooks/useSyncEngine';
import { CatalogItem, Tier } from '../core/models/types';
import { LayoutTemplate } from '../core/models/templates';
import { FocusedItemAction, GeneratedInspectionItem, GeneratedInspectionSection } from '../core/models/templates';
import { Inspection, Unit } from '../core/models/inspections';
import { Finding, MaterialRequirement, RepairTask } from '../core/models/operations';
import { SelectedProcurementOption } from '../core/models/procurement';
import { CatalogService } from '../core/services/CatalogService';
import { FindingService } from '../core/services/FindingService';
import { InspectionService } from '../core/services/InspectionService';
import { InspectionTemplateGenerationService } from '../core/services/InspectionTemplateGenerationService';
import { LayoutTemplateService } from '../core/services/LayoutTemplateService';
import { MaterialMatchingService } from '../core/services/MaterialMatchingService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { MediaService } from '../core/services/MediaService';
import { ProductRecommendationService } from '../core/services/ProductRecommendationService';
import { ProcurementBundleService } from '../core/services/ProcurementBundleService';
import { ProcurementProductResolutionService } from '../core/services/ProcurementProductResolutionService';
import { RepairTaskService } from '../core/services/RepairTaskService';
import { ReportService } from '../core/services/ReportService';
import { UnitService } from '../core/services/UnitService';
import { ChecklistAlwaysReplaceService } from '../core/services/ChecklistAlwaysReplaceService';
import { AuthPolicyService } from '../core/services/AuthPolicyService';
import { FocusedTopControlBar } from './FocusedTopControlBar';
import {
  buildFocusedCompletionSummary,
  buildFocusedDecisionProgress,
  buildFocusedNeedsMaterialsItems,
  getFocusedCompletionPrimaryAction,
  getFocusedReadinessDetail,
} from './focusedInspection/focusedCompletionReadiness';

type FocusedWorkflowIntent = 'inspection' | 'materials';
type FocusedStep = 'select' | 'inspection' | 'summary' | 'materials';
type FocusedTemplateRecoveryState = {
  unitId: string | null;
  unitName: string;
  title: string;
  detail: string;
  suggestion?: string | null;
  canOpenUnitWorkspace: boolean;
  canOpenTemplateSetup: boolean;
};
type FocusedContinuityHint = {
  tone: 'saved' | 'next' | 'warning';
  title: string;
  detail: string;
  primaryAction?: {
    label: string;
    type: 'focus_room' | 'summary' | 'materials' | 'full_inspection';
    roomId?: string | null;
    itemId?: string | null;
  } | null;
  secondaryAction?: {
    label: string;
    type: 'focus_room' | 'summary' | 'materials' | 'full_inspection';
    roomId?: string | null;
    itemId?: string | null;
  } | null;
};
type FocusedInspectionLaunchState =
  | {
      kind: 'start';
      primaryLabel: 'Start Inspection';
      helper: string;
      inspection: null;
      showReviewAction: false;
    }
  | {
      kind: 'resume';
      primaryLabel: 'Resume Inspection';
      helper: string;
      inspection: Inspection;
      showReviewAction: false;
    }
  | {
      kind: 'completed';
      primaryLabel: 'Start New Inspection';
      helper: string;
      inspection: Inspection;
      showReviewAction: true;
    };
type FocusedWorkflowContext = {
  intent: FocusedWorkflowIntent;
  step: FocusedStep;
  unitId?: string | null;
  inspectionId?: string | null;
  roomId?: string | null;
  itemId?: string | null;
  scopeSection?: 'findings' | 'tasks' | 'materials' | null;
  scopeTarget?: {
    entityType: 'finding' | 'task' | 'material';
    entityId: string;
    originLabel?: string | null;
  } | null;
  procurementRequirementId?: string | null;
  submissionState?: FocusedSubmissionState | null;
};

interface FocusedInspectionWorkflowProps {
  intent: FocusedWorkflowIntent;
  initialUnitId?: string | null;
  initialInspectionId?: string | null;
  initialStep?: FocusedStep;
  initialRoomId?: string | null;
  initialItemId?: string | null;
  initialSubmissionState?: FocusedSubmissionState | null;
  onExit: () => void;
  onSwitchFullMode: () => void;
  onOpenUnitWorkspace?: (unitId: string) => void;
  onOpenInspectionReview?: (inspectionId: string, unitId: string) => void;
  onOpenTemplateSetup?: () => void;
  onContextChange?: (context: FocusedWorkflowContext) => void;
  onOpenProcurement?: (options?: {
    unitId?: string | null;
    focus?: 'all' | 'procurement' | 'vendor' | 'receiving' | 'verification';
    requirementId?: string | null;
    requirementIds?: string[] | null;
    originLabel?: string | null;
    arrivalContext?: {
      source: 'focused_submission';
      outcome: 'submitted' | 'queued';
      unitName: string;
      itemCount: number;
      estimatedTotal: number;
      nextStep: string;
    } | null;
  }) => void;
}

type FocusedInspectionOpenOptions = {
  preferredRoomId?: string | null;
  preferredItemId?: string | null;
  openMaterialEditorForItemId?: string | null;
};

interface UnitDraft {
  name: string;
  unitCode: string;
  address1: string;
  city: string;
  state: string;
  budgetThreshold: string;
  layoutTemplateId: string;
}

interface FocusedSaveState {
  phase: 'idle' | 'saving' | 'saved' | 'failed';
  message?: string;
  itemId?: string | null;
}

interface FocusedSubmissionState {
  inspectionId: string;
  outcome: 'submitted' | 'queued' | 'failed';
  unitName: string;
  itemCount: number;
  estimatedTotal: number;
  requirementIds: string[];
  nextStep: string;
  detail: string;
}

const EMPTY_UNIT_DRAFT: UnitDraft = {
  name: '',
  unitCode: '',
  address1: '',
  city: '',
  state: '',
  budgetThreshold: '',
  layoutTemplateId: '',
};

const REPORT_READY_TIMEOUT_MS = 30_000;
const REPORT_READY_POLL_INTERVAL_MS = 500;

const wait = (durationMs: number) => new Promise((resolve) => window.setTimeout(resolve, durationMs));

const normalizeLabel = (value?: string | null) => (value || '').trim().toLowerCase();
const titleCase = (value?: string | null) =>
  (value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
const isIssueFocusedAction = (action?: FocusedItemAction | null): action is Extract<FocusedItemAction, 'repair' | 'replace'> =>
  action === 'repair' || action === 'replace';
const isGoodFocusedAction = (action?: FocusedItemAction | null): action is Extract<FocusedItemAction, 'good'> => action === 'good';
const isAlwaysReplaceChecklistItem = (item: GeneratedInspectionItem) => item.itemType === 'always_replace';
const hasLinkedAlwaysReplaceRecords = (item: GeneratedInspectionItem) =>
  ((item.repairTaskIds?.length || 0) > 0) || ((item.materialRequirementIds?.length || 0) > 0);
const getAlwaysReplaceCountQuantity = (item: GeneratedInspectionItem) =>
  Math.max(1, Math.round(Number(item.inputValue?.quantity ?? item.defaultQuantity ?? 1)) || 1);
const hasAlwaysReplaceInputCaptured = (item: GeneratedInspectionItem) => {
  if (!isAlwaysReplaceChecklistItem(item)) return false;
  if (hasLinkedAlwaysReplaceRecords(item)) return true;
  if (item.inputMode === 'count') {
    return typeof item.inputValue?.quantity === 'number' && item.inputValue.quantity > 0;
  }
  if (item.inputMode === 'dimensions') {
    return Boolean(item.inputValue?.dimensions);
  }
  if (item.inputMode === 'area') {
    return typeof item.inputValue?.area === 'number' && item.inputValue.area > 0;
  }
  return false;
};
const isAlwaysReplaceInputComplete = (item: GeneratedInspectionItem) => {
  if (!isAlwaysReplaceChecklistItem(item)) return false;
  if (hasLinkedAlwaysReplaceRecords(item)) return true;
  if (item.inputMode === 'count') {
    return typeof item.inputValue?.quantity === 'number' && item.inputValue.quantity > 0;
  }
  if (item.inputMode === 'dimensions') {
    return Boolean(item.inputValue?.dimensions && item.inputValue.dimensions.width > 0 && item.inputValue.dimensions.height > 0);
  }
  if (item.inputMode === 'area') {
    return Boolean(item.inputValue?.area && item.inputValue.area > 0);
  }
  return true;
};

const buildChecklistGuidance = (item: GeneratedInspectionItem) => {
  if (item.itemType === 'always_replace') {
    if (item.requiresMeasurements && item.dataFields.length > 0) {
      return `Capture ${item.dataFields.join(', ')} before saving this standard replacement.`;
    }
    if (item.inputMode === 'count') {
      return 'Enter the replacement quantity and save it directly into materials.';
    }
    return 'Save the standard replacement directly into materials.';
  }

  if (item.focusedAction === 'good') {
    return null;
  }
  if (item.focusedAction === 'repair' && item.repairOptions.length > 0) {
    return `Repair options: ${item.repairOptions.join(', ')}.`;
  }
  if (item.focusedAction === 'replace' && item.replaceOptions.length > 0) {
    const presetSuffix = item.preferredReplaceOption ? ` Preset preference: ${item.preferredReplaceOption}.` : '';
    return `Replace options: ${item.replaceOptions.join(', ')}.${presetSuffix}`;
  }
  if (item.requiresMeasurements && item.dataFields.length > 0) {
    return `Measurements may be needed: ${item.dataFields.join(', ')}.`;
  }
  return null;
};

const formatSyncRecency = (timestamp?: number) => {
  if (!timestamp) return null;
  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) return 'synced just now';
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (deltaMinutes < 60) return `synced ${deltaMinutes} minute${deltaMinutes === 1 ? '' : 's'} ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  return `synced ${deltaHours} hour${deltaHours === 1 ? '' : 's'} ago`;
};

const getRoomKey = (section: GeneratedInspectionSection) => section.roomLabel || section.title || 'Unit Overview';

const getRoomList = (sections: GeneratedInspectionSection[]) =>
  Array.from(
    sections.reduce((map, section) => {
      const key = getRoomKey(section);
      if (!map.has(key)) {
        map.set(key, { id: key, label: key, itemCount: 0 });
      }
      const current = map.get(key);
      if (current) {
        current.itemCount += section.items.length;
      }
      return map;
    }, new Map<string, { id: string; label: string; itemCount: number }>())
  ).map(([, room]) => room);

const getRoomItemsFromSections = (sections: GeneratedInspectionSection[], roomId: string | null | undefined) =>
  roomId ? sections.filter((section) => getRoomKey(section) === roomId).flatMap((section) => section.items) : [];

const normalizeFocusedSubmissionState = (
  submissionState: FocusedSubmissionState | null | undefined,
  inspectionRecord: Inspection | null,
  loadedMaterials: MaterialRequirement[],
  loadedUnit: Unit | null
): FocusedSubmissionState | null => {
  if (!submissionState || !inspectionRecord) return null;
  if (submissionState.inspectionId && submissionState.inspectionId !== inspectionRecord.id) {
    return null;
  }
  if (!Array.isArray(submissionState.requirementIds)) {
    return null;
  }
  const matchedRequirements = submissionState.requirementIds.length
    ? loadedMaterials.filter((requirement) => submissionState.requirementIds.includes(requirement.id))
    : [];
  if (submissionState.requirementIds.length > 0 && matchedRequirements.length === 0) {
    return null;
  }
  const normalizedItemCount =
    matchedRequirements.length > 0
      ? matchedRequirements.length
      : submissionState.itemCount;
  const normalizedEstimatedTotal =
    matchedRequirements.length > 0
      ? matchedRequirements.reduce(
          (sum, requirement) => sum + (requirement.selectedMatch?.price || 0) * requirement.quantity,
          0
        )
      : submissionState.estimatedTotal;
  return {
    ...submissionState,
    inspectionId: inspectionRecord.id,
    unitName: loadedUnit?.name || submissionState.unitName,
    itemCount: normalizedItemCount,
    estimatedTotal: normalizedEstimatedTotal,
    requirementIds:
      matchedRequirements.length > 0
        ? matchedRequirements.map((requirement) => requirement.id)
        : submissionState.requirementIds,
  };
};

const itemNeedsFollowThrough = (item: GeneratedInspectionItem) => {
  if (isAlwaysReplaceChecklistItem(item)) {
    return !isAlwaysReplaceInputComplete(item);
  }
  return !item.focusedAction;
};

const inferTrade = (action: FocusedItemAction, label: string): RepairTask['trade'] => {
  const normalized = normalizeLabel(label);
  if (normalized.includes('paint')) return 'paint';
  if (normalized.includes('faucet') || normalized.includes('sink') || normalized.includes('toilet')) return 'plumbing';
  if (normalized.includes('outlet') || normalized.includes('switch') || normalized.includes('light')) return 'electrical';
  if (normalized.includes('floor')) return 'flooring';
  if (normalized.includes('clean')) return 'cleaning';
  return action === 'replace' ? 'general' : 'general';
};

const getSelectableCatalogOption = (catalogItem: CatalogItem) => {
  const directOption = catalogItem.options?.[0];
  if (directOption) {
    return directOption;
  }
  return {
    id: `fallback:${catalogItem.id}`,
    name: catalogItem.name,
    price: catalogItem.defaultPrice ?? catalogItem.actualCost ?? 0,
    sku: catalogItem.itemNumber || catalogItem.id,
    tier: catalogItem.defaultTier || Tier.STANDARD,
    brand: catalogItem.vendor || catalogItem.brand,
    modelNumber: catalogItem.modelNumber,
  };
};

const hasSelectableCatalogOption = (catalogItem: CatalogItem) => Boolean(getSelectableCatalogOption(catalogItem));

const buildSelectedMatch = (catalogItem: CatalogItem): SelectedProcurementOption | null => {
  const option = getSelectableCatalogOption(catalogItem);
  if (!option) return null;
  return {
    catalogItemId: catalogItem.id,
    catalogItemName: catalogItem.name,
    optionId: option.id,
    optionName: option.name,
    category: catalogItem.categoryName || catalogItem.category,
    unit: catalogItem.unit,
    vendor: option.brand,
    sku: option.sku,
    modelNumber: option.modelNumber,
    price: option.price,
    confidenceScore: 100,
    confidenceBand: 'manual',
    rationale: ['Selected in Focused Mode'],
    selectedAt: Date.now(),
  };
};

const getDuplicateCandidates = (units: Unit[], draft: UnitDraft) => {
  const searchTerms = [
    normalizeLabel(draft.name),
    normalizeLabel(draft.unitCode),
    normalizeLabel(draft.address1),
  ].filter(Boolean);
  if (searchTerms.length === 0) return [];

  return units.filter((unit) => {
    const haystack = [unit.name, unit.unitCode, unit.address1, unit.city, unit.state]
      .map((value) => normalizeLabel(value))
      .join(' ');
    const overlap = searchTerms.filter((term) => haystack.includes(term)).length;
    return overlap >= Math.max(1, Math.min(searchTerms.length, 2));
  });
};

export const FocusedInspectionWorkflow: React.FC<FocusedInspectionWorkflowProps> = ({
  intent,
  initialUnitId,
  initialInspectionId,
  initialStep,
  initialRoomId,
  initialItemId,
  initialSubmissionState,
  onExit,
  onSwitchFullMode,
  onOpenUnitWorkspace,
  onOpenInspectionReview,
  onOpenTemplateSetup,
  onContextChange,
  onOpenProcurement,
}) => {
  const { org, user, role } = useAppContext();
  const { isOnline, isSyncing, lastSyncAt, triggerSyncNow } = useSyncEngine();
  const [step, setStep] = useState<FocusedStep>(initialStep || (intent === 'materials' && initialInspectionId ? 'materials' : 'select'));
  const [isLoading, setIsLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [layouts, setLayouts] = useState<LayoutTemplate[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [generatedSections, setGeneratedSections] = useState<GeneratedInspectionSection[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<RepairTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [expandedMaterialEditors, setExpandedMaterialEditors] = useState<Record<string, boolean>>({});
  const [productSelections, setProductSelections] = useState<Record<string, { catalogItemId: string; quantity: string }>>({});
  const [unitSearch, setUnitSearch] = useState('');
  const [unitDraft, setUnitDraft] = useState<UnitDraft>(EMPTY_UNIT_DRAFT);
  const [duplicateMatches, setDuplicateMatches] = useState<Unit[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingCreateDraft, setPendingCreateDraft] = useState<UnitDraft | null>(null);
  const [saveState, setSaveState] = useState<FocusedSaveState>({ phase: 'idle' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);
  const [submitBlockMessage, setSubmitBlockMessage] = useState<string | null>(null);
  const [templateRecoveryState, setTemplateRecoveryState] = useState<FocusedTemplateRecoveryState | null>(null);
  const [continuityHint, setContinuityHint] = useState<FocusedContinuityHint | null>(null);
  const [submissionState, setSubmissionState] = useState<FocusedSubmissionState | null>(initialSubmissionState || null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [pendingSubmitOverride, setPendingSubmitOverride] = useState(false);
  const [showResumeHint, setShowResumeHint] = useState<boolean>(Boolean(initialInspectionId && initialStep && initialStep !== 'select'));
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [exitDialogError, setExitDialogError] = useState<string | null>(null);
  const [isExitSaving, setIsExitSaving] = useState(false);
  const [pendingUnitActionId, setPendingUnitActionId] = useState<string | null>(null);
  const [isMaterialsFooterExpanded, setIsMaterialsFooterExpanded] = useState(false);
  const [isTemplateSelectOpening, setIsTemplateSelectOpening] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loadUnitsAndCatalog = async () => {
    if (!org) return;
    const [loadedUnits, loadedCatalog, loadedLayouts, loadedInspections] = await Promise.all([
      UnitService.listUnits(org.id),
      CatalogService.getItems(org.id),
      LayoutTemplateService.listActive(org.id),
      InspectionService.listInspections(org.id),
    ]);
    setUnits(loadedUnits.filter((unit) => unit.status !== 'archived'));
    setCatalogItems(loadedCatalog);
    setLayouts(loadedLayouts);
    setInspections(loadedInspections);
  };

  const buildTemplateRecoveryState = (unit: Unit): FocusedTemplateRecoveryState => ({
    unitId: unit.id,
    unitName: unit.name,
    title: 'Template required before focused inspection can continue.',
    detail: `${unit.name} does not have a usable active layout template right now, so Focused Mode cannot build the room checklist for this inspection.`,
    suggestion:
      layouts.length === 0
        ? 'Add or reactivate a layout template in Full Mode, then come back to start inspection.'
        : 'Review this unit in Full Mode and confirm the correct layout template assignment before continuing.',
    canOpenUnitWorkspace: Boolean(onOpenUnitWorkspace),
    canOpenTemplateSetup: Boolean(onOpenTemplateSetup),
  });

  const isTemplateRecoveryError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    if (error.message === 'FOCUSED_TEMPLATE_REQUIRED') return true;
    const normalized = error.message.toLowerCase();
    return (
      normalized.includes('layout template') ||
      normalized.includes('checklist template') ||
      normalized.includes('inspection template generation requires')
    );
  };

  const clearFocusedMessages = () => {
    setErrorMessage(null);
    setGlobalMessage(null);
    setContinuityHint(null);
    setSubmitBlockMessage(null);
    setTemplateRecoveryState(null);
  };

  const initializeFocusedInspection = async (unit: Unit, inspectionRecord?: Inspection | null): Promise<Inspection> => {
    if (!org || !user) {
      throw new Error('A signed-in local session is required.');
    }

    if (!inspectionRecord) {
      return createFocusedInspectionForUnit(unit);
    }

    if ((inspectionRecord.generatedSections || []).length > 0) {
      return inspectionRecord;
    }

    const activeLayouts = await LayoutTemplateService.listActive(org.id);
    const backfilledUnit = await UnitService.backfillLayoutTemplateIfMissing(org.id, unit, activeLayouts);
    const unitForGeneration = backfilledUnit || unit;
    const preferredLayout =
      (inspectionRecord.templateSnapshot?.layoutTemplateId
        ? await LayoutTemplateService.getById(inspectionRecord.templateSnapshot.layoutTemplateId, org.id)
        : null) || UnitService.resolveTemplateForUnit(unitForGeneration, activeLayouts).layout;

    if (!preferredLayout) {
      throw new Error('FOCUSED_TEMPLATE_REQUIRED');
    }

    const checklistTemplateId = inspectionRecord.templateSnapshot?.checklistTemplateId;
    const generation = await InspectionTemplateGenerationService.generateFromLayout({
      layoutTemplateId: preferredLayout.id,
      checklistTemplateId,
      orgId: org.id,
      turnoverPresetId: inspectionRecord.templateSnapshot?.turnoverPresetId || null,
      unit: unitForGeneration,
    });

    const initializedInspection: Inspection = {
      ...inspectionRecord,
      templateSnapshot: generation.snapshot,
      generatedSections: generation.sections,
      generatedItems: generation.items,
    };

    await InspectionService.updateInspection(org.id, initializedInspection, user.id);
    return {
      ...initializedInspection,
      updatedAt: Date.now(),
      lastEditedByUserId: user.id,
    };
  };

  const loadInspectionContext = async (
    inspectionId: string,
    nextStep?: FocusedStep,
    inspectionRecord?: Inspection | null,
    options?: FocusedInspectionOpenOptions
  ): Promise<boolean> => {
    if (!org) return false;
    setIsLoading(true);
    setErrorMessage(null);
    setTemplateRecoveryState(null);
    let recoveryUnit: Unit | null = null;
    try {
      const inspections = inspectionRecord ? [] : await InspectionService.listInspections(org.id);
      const requestedInspection = inspectionRecord || inspections.find((entry) => entry.id === inspectionId) || null;
      if (!requestedInspection) {
        throw new Error('The selected inspection could not be found.');
      }
      const loadedUnit = await UnitService.getUnit(org.id, requestedInspection.unitId);
      if (!loadedUnit) {
        throw new Error('The selected unit could not be found.');
      }
      recoveryUnit = loadedUnit;
      const loadedInspection = await initializeFocusedInspection(loadedUnit, requestedInspection);
      const [loadedFindings, loadedTasks, loadedMaterials] = await Promise.all([
        FindingService.listFindings(org.id, { inspectionId: loadedInspection.id }),
        RepairTaskService.listTasks(org.id, { inspectionId: loadedInspection.id }),
        MaterialRequirementService.listRequirements(org.id, { inspectionId: loadedInspection.id }),
      ]);
      if ((loadedInspection.generatedSections || []).length === 0) {
        throw new Error('Focused inspection could not initialize its room checklist.');
      }

      setInspection(loadedInspection);
      setSelectedUnit(loadedUnit);
      setGeneratedSections(loadedInspection.generatedSections || []);
      setFindings(loadedFindings);
      setTasks(loadedTasks);
      setMaterials(loadedMaterials);
      const resolvedStep = nextStep || (intent === 'materials' ? 'materials' : 'inspection');
      setStep(resolvedStep);
      const rooms = getRoomList(loadedInspection.generatedSections || []);
      const preferredRoomId =
        (options?.preferredRoomId && rooms.some((room) => room.id === options.preferredRoomId)
          ? options.preferredRoomId
          : initialRoomId && rooms.some((room) => room.id === initialRoomId)
            ? initialRoomId
            : rooms[0]?.id || null) || null;
      setSelectedRoomId(preferredRoomId);
      const roomItems = getRoomItemsFromSections(loadedInspection.generatedSections || [], preferredRoomId);
      const preferredItemId =
        (options?.preferredItemId && roomItems.some((item) => item.id === options.preferredItemId)
          ? options.preferredItemId
          : initialItemId && roomItems.some((item) => item.id === initialItemId)
            ? initialItemId
            : null) || null;
      setFocusedItemId(preferredItemId);
      if (options?.openMaterialEditorForItemId && preferredItemId === options.openMaterialEditorForItemId) {
        setExpandedMaterialEditors((current) => ({ ...current, [preferredItemId]: true }));
      }
      setGlobalMessage(null);
      const restoredSubmissionState =
        resolvedStep === 'materials'
          ? normalizeFocusedSubmissionState(initialSubmissionState, loadedInspection, loadedMaterials, loadedUnit)
          : null;
      setSubmissionState(restoredSubmissionState);
      setShowResumeHint(Boolean(restoredSubmissionState || (initialInspectionId && loadedInspection.id === initialInspectionId && resolvedStep !== 'select')));
      setSaveState({ phase: 'idle' });
      setNoteDrafts(
        Object.fromEntries(
          (loadedInspection.generatedSections || []).flatMap((section) => section.items.map((item) => [item.id, item.notes || '']))
        )
      );
      setProductSelections(
        Object.fromEntries(
          loadedMaterials.map((requirement) => [
            requirement.sourceGeneratedItemId || requirement.id,
            {
              catalogItemId: requirement.selectedMatch?.catalogItemId || '',
              quantity: String(requirement.quantity),
            },
          ])
        )
      );
      setInspections((current) => {
        const withoutPrevious = current.filter((entry) => entry.id !== loadedInspection.id);
        return [loadedInspection, ...withoutPrevious].sort((left, right) => right.updatedAt - left.updatedAt);
      });
      return true;
    } catch (error) {
      if (isTemplateRecoveryError(error) && recoveryUnit) {
        setStep('select');
        setTemplateRecoveryState(buildTemplateRecoveryState(recoveryUnit));
        setErrorMessage(null);
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load focused inspection workflow.');
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!org) return;
    const load = async () => {
      setIsLoading(true);
      try {
        await loadUnitsAndCatalog();
        if (initialInspectionId) {
          if (await loadInspectionContext(initialInspectionId, intent === 'materials' ? 'materials' : 'inspection')) {
            return;
          }
        }
        if (intent === 'materials' && initialSubmissionState?.inspectionId) {
          if (await loadInspectionContext(initialSubmissionState.inspectionId, 'materials')) {
            return;
          }
        }
        if (intent === 'materials' && initialSubmissionState?.requirementIds?.length) {
          const allRequirements = await MaterialRequirementService.listRequirements(org.id);
          const matchingRequirement = allRequirements.find((requirement) =>
            initialSubmissionState.requirementIds.includes(requirement.id)
          );
          if (matchingRequirement?.inspectionId) {
            if (await loadInspectionContext(matchingRequirement.inspectionId, 'materials')) {
              return;
            }
          }
        }
        if (initialUnitId && intent === 'materials') {
          await handleSelectUnit(initialUnitId, 'materials');
          return;
        }
        if (initialUnitId && intent === 'inspection') {
          await handleSelectUnit(initialUnitId, 'inspection');
          return;
        }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, initialInspectionId, initialUnitId, intent]);

  useEffect(() => {
    if (!focusedItemId) return;
    const timer = window.setTimeout(() => {
      itemRefs.current[focusedItemId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [focusedItemId, step, selectedRoomId]);

  const roomGroups = useMemo(() => getRoomList(generatedSections), [generatedSections]);
  const allGeneratedItems = useMemo(() => generatedSections.flatMap((section) => section.items), [generatedSections]);
  const activeMaterials = useMemo(
    () => materials.filter((requirement) => requirement.status !== 'canceled'),
    [materials]
  );
  const resolvedProcurementBundles = useMemo(
    () =>
      inspection
        ? ProcurementBundleService.resolveForInspection({
            inspection: {
              ...inspection,
              generatedSections,
              generatedItems: generatedSections.flatMap((section) => section.items),
            },
            requirements: activeMaterials,
          })
        : [],
    [inspection, generatedSections, activeMaterials]
  );
  const resolvedBundleProductRecommendations = useMemo(
    () =>
      inspection
        ? ProcurementProductResolutionService.resolveForBundlesFromCatalog({
            catalogItems,
            bundles: resolvedProcurementBundles,
            inspections: [
              {
                ...inspection,
                generatedSections,
                generatedItems: generatedSections.flatMap((section) => section.items),
              },
            ],
          })
        : [],
    [inspection, catalogItems, resolvedProcurementBundles, generatedSections]
  );
  const inspectionsByUnit = useMemo(
    () =>
      inspections.reduce<Record<string, Inspection[]>>((accumulator, entry) => {
        if (!accumulator[entry.unitId]) {
          accumulator[entry.unitId] = [];
        }
        accumulator[entry.unitId].push(entry);
        return accumulator;
      }, {}),
    [inspections]
  );
  const currentRoomSections = useMemo(
    () => generatedSections.filter((section) => getRoomKey(section) === selectedRoomId),
    [generatedSections, selectedRoomId]
  );
  const currentRoomItems = useMemo(() => currentRoomSections.flatMap((section) => section.items), [currentRoomSections]);
  const currentRoomSummary = useMemo(() => {
    const followThroughCount = currentRoomItems.filter((item) => itemNeedsFollowThrough(item)).length;
    const alwaysReplaceCount = currentRoomItems.filter((item) => isAlwaysReplaceChecklistItem(item)).length;
    return {
      followThroughCount,
      alwaysReplaceCount,
    };
  }, [currentRoomItems]);
  const readinessHelpers = useMemo(
    () => ({
      isGoodFocusedAction,
      isIssueFocusedAction,
      isAlwaysReplaceChecklistItem,
      hasAlwaysReplaceInputCaptured,
      isAlwaysReplaceInputComplete,
      itemNeedsFollowThrough,
      getRoomKey,
      titleCase,
    }),
    []
  );
  const inspectionCompletionSummary = useMemo(
    () => buildFocusedCompletionSummary(allGeneratedItems, readinessHelpers),
    [allGeneratedItems, readinessHelpers]
  );
  const decisionProgress = useMemo(
    () => buildFocusedDecisionProgress(allGeneratedItems, readinessHelpers),
    [allGeneratedItems, readinessHelpers]
  );
  const needsMaterialsItems = useMemo(
    () => buildFocusedNeedsMaterialsItems(generatedSections, readinessHelpers),
    [generatedSections, readinessHelpers]
  );
  const currentRoomIndex = useMemo(
    () => roomGroups.findIndex((room) => room.id === selectedRoomId),
    [roomGroups, selectedRoomId]
  );
  const previousRoom = currentRoomIndex > 0 ? roomGroups[currentRoomIndex - 1] : null;
  const nextRoom = currentRoomIndex >= 0 && currentRoomIndex < roomGroups.length - 1 ? roomGroups[currentRoomIndex + 1] : null;
  const isFinalRoomSelected = currentRoomIndex >= 0 && currentRoomIndex === roomGroups.length - 1;
  const isInspectionComplete =
    inspectionCompletionSummary.totalItems > 0 && inspectionCompletionSummary.handledCount === inspectionCompletionSummary.totalItems;
  const showInspectionCompletionCard = step === 'inspection' && isFinalRoomSelected && isInspectionComplete;
  const findingMap = useMemo(() => new Map(findings.map((finding) => [finding.id, finding])), [findings]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const materialMap = useMemo(() => new Map(activeMaterials.map((material) => [material.id, material])), [activeMaterials]);
  const estimatedTotal = useMemo(
    () => activeMaterials.reduce((sum, requirement) => sum + (requirement.selectedMatch?.price || 0) * requirement.quantity, 0),
    [activeMaterials]
  );
  const materialCount = activeMaterials.length;
  const issueCount = useMemo(
    () =>
      generatedSections.reduce(
        (sum, section) =>
          sum +
          section.items.filter(
            (item) =>
              isIssueFocusedAction(item.focusedAction) ||
              (item.findingIds?.length || 0) > 0 ||
              (isAlwaysReplaceChecklistItem(item) &&
                (((item.repairTaskIds?.length || 0) > 0) || ((item.materialRequirementIds?.length || 0) > 0)))
          ).length,
        0
      ),
    [generatedSections]
  );
  const incompleteItems = useMemo(
    () =>
      generatedSections.flatMap((section) =>
        section.items
          .filter(
            (item) =>
              (isAlwaysReplaceChecklistItem(item) &&
                hasAlwaysReplaceInputCaptured(item) &&
                (item.materialRequirementIds?.length || 0) === 0 &&
                isAlwaysReplaceInputComplete(item)) ||
              (isIssueFocusedAction(item.focusedAction) && (item.materialRequirementIds?.length || 0) === 0) ||
              (((item.notes || '').trim() || item.photoIds.length > 0) && !item.focusedAction && !isAlwaysReplaceChecklistItem(item))
          )
          .map((item) => ({ sectionId: section.id, roomId: getRoomKey(section), item }))
      ),
    [generatedSections]
  );
  const noIssueRooms = useMemo(
    () =>
      roomGroups.filter((room) =>
        !generatedSections
          .filter((section) => getRoomKey(section) === room.id)
          .some((section) =>
            section.items.some(
              (item) =>
                isIssueFocusedAction(item.focusedAction) ||
                (isAlwaysReplaceChecklistItem(item) && isAlwaysReplaceInputComplete(item)) ||
                (item.notes || '').trim() ||
                item.photoIds.length > 0
            )
          )
      ),
    [generatedSections, roomGroups]
  );
  const canContinueAnyway = AuthPolicyService.isAdminOrHigher(role);
  const filteredUnits = useMemo(() => {
    const query = normalizeLabel(unitSearch);
    if (!query) return units;
    return units.filter((unit) =>
      [unit.name, unit.unitCode, unit.address1, unit.city, unit.state]
        .filter(Boolean)
        .some((value) => normalizeLabel(value).includes(query))
    );
  }, [unitSearch, units]);
  const syncRecency = useMemo(() => formatSyncRecency(lastSyncAt), [lastSyncAt]);
  const actionableMaterialsCount = useMemo(
    () => activeMaterials.filter((requirement) => requirement.selectedMatch).length,
    [activeMaterials]
  );
  const isInspectionFinalized = Boolean(inspection?.isInspectionFinalized);
  const hasReportReadinessGaps = inspectionCompletionSummary.reportReadinessCount > 0;
  const isInspectionPackageReady = isInspectionComplete && !hasReportReadinessGaps;
  const ensureEditableInspection = (actionLabel: string) => {
    if (!isInspectionFinalized) return true;
    const nextMessage = `Report already generated. Choose Edit Inspection to ${actionLabel}.`;
    setSubmitBlockMessage(nextMessage);
    setGlobalMessage(nextMessage);
    return false;
  };
  const focusedHeartbeat = useMemo(() => {
    if (saveState.phase === 'saving') {
      return {
        tone: 'info' as const,
        label: saveState.message || 'Saving on this device…',
        detail: 'Keep moving. Focused Mode is saving locally right now.',
      };
    }
    if (saveState.phase === 'failed') {
      return {
        tone: 'error' as const,
        label: saveState.message || 'Last change needs retry',
        detail: 'Your earlier work is still safe locally. Retry the last change when ready.',
      };
    }
    if (submissionState?.outcome === 'failed') {
      return {
        tone: 'error' as const,
        label: 'Submission retry needed',
        detail: 'Materials are still saved locally. Retry submit when you are ready.',
      };
    }
    if (submissionState?.outcome === 'queued') {
      return {
        tone: 'offline' as const,
        label: isOnline ? 'Queued work is still waiting on this device' : 'Queued offline for Procurement on this device',
        detail: isOnline
          ? 'Connection is back. Retry submit for a fresh confirmation or open Procurement now.'
          : 'Nothing was lost. You can keep moving and return after reconnecting.',
      };
    }
    if (!isOnline) {
      return {
        tone: 'offline' as const,
        label: 'Offline — work is safe on this device',
        detail:
          step === 'materials' && actionableMaterialsCount > 0
            ? 'You can keep building materials now. Submission will stay local until you reconnect.'
            : 'Keep inspecting normally. Every change is still saved locally.',
      };
    }
    if (isSyncing) {
      return {
        tone: 'info' as const,
        label: 'Syncing saved work…',
        detail: 'Local saves are already safe. UnitFlip is syncing background changes now.',
      };
    }
    if (saveState.phase === 'saved') {
      return {
        tone: 'saved' as const,
        label: saveState.message || 'Saved on this device',
        detail: syncRecency ? `Safe locally and ${syncRecency}.` : 'Safe locally and ready to continue.',
      };
    }
    return {
      tone: 'saved' as const,
      label: syncRecency ? `Saved locally • ${syncRecency}` : 'Saved locally and ready to continue',
      detail:
        step === 'materials' && actionableMaterialsCount > 0
          ? 'Materials are ready for review whenever you want to submit.'
          : 'You can leave and come back to this workflow without losing your place.',
    };
  }, [actionableMaterialsCount, isOnline, isSyncing, saveState.message, saveState.phase, step, submissionState, syncRecency]);
  const resumeBanner = useMemo(() => {
    if (!showResumeHint || step === 'select' || !selectedUnit) return null;
    if (submissionState?.outcome === 'queued') {
      return {
        tone: 'amber' as const,
        title: `Resumed ${selectedUnit.name} with queued procurement work.`,
        detail: isOnline
          ? 'The queued submission is still on this device. Retry submit for a fresh confirmation or continue in Procurement.'
          : 'The queued submission is still safe on this device. Reconnect when you want to send or confirm it again.',
      };
    }
    if (submissionState?.outcome === 'failed') {
      return {
        tone: 'rose' as const,
        title: `Resumed ${selectedUnit.name} with a pending submission retry.`,
        detail: 'Inspection work and materials are still saved locally. Retry submit when you are ready.',
      };
    }
    return {
      tone: 'blue' as const,
      title: `Resumed ${selectedUnit.name}.`,
      detail:
        step === 'materials'
          ? 'Your materials review is already saved locally on this device.'
          : 'Your inspection progress is already saved locally on this device.',
    };
  }, [isOnline, selectedUnit, showResumeHint, step, submissionState]);

  const deriveScopeContextForItem = (itemId?: string | null) => {
    if (!itemId) {
      return { scopeSection: null, scopeTarget: null, procurementRequirementId: null };
    }
    const item = generatedSections.flatMap((section) => section.items).find((entry) => entry.id === itemId) || null;
    if (!item) {
      return { scopeSection: null, scopeTarget: null, procurementRequirementId: null };
    }
    if ((item.materialRequirementIds || []).length > 0) {
      return {
        scopeSection: 'materials' as const,
        scopeTarget: {
          entityType: 'material' as const,
          entityId: item.materialRequirementIds[0],
          originLabel: 'Opened from Focused Mode',
        },
        procurementRequirementId: item.materialRequirementIds[0],
      };
    }
    if ((item.repairTaskIds || []).length > 0) {
      return {
        scopeSection: 'tasks' as const,
        scopeTarget: {
          entityType: 'task' as const,
          entityId: item.repairTaskIds[0],
          originLabel: 'Opened from Focused Mode',
        },
        procurementRequirementId: null,
      };
    }
    if ((item.findingIds || []).length > 0) {
      return {
        scopeSection: 'findings' as const,
        scopeTarget: {
          entityType: 'finding' as const,
          entityId: item.findingIds[0],
          originLabel: 'Opened from Focused Mode',
        },
        procurementRequirementId: null,
      };
    }
    return { scopeSection: null, scopeTarget: null, procurementRequirementId: null };
  };

  const syncFocusedContext = (nextStep: FocusedStep, nextRoomId?: string | null, nextItemId?: string | null) => {
    if (!onContextChange) return;
    const derived = deriveScopeContextForItem(
      nextItemId ||
        (nextStep === 'materials'
          ? activeMaterials.find((requirement) => !!requirement.sourceGeneratedItemId)?.sourceGeneratedItemId || null
          : null)
    );
    onContextChange({
      intent,
      step: nextStep,
      unitId: selectedUnit?.id || null,
      inspectionId: inspection?.id || null,
      roomId: nextRoomId ?? selectedRoomId ?? null,
      itemId: nextItemId ?? focusedItemId ?? null,
      scopeSection: derived.scopeSection,
      scopeTarget: derived.scopeTarget,
      procurementRequirementId: derived.procurementRequirementId,
      submissionState,
    });
  };

  const syncSubmissionContext = (nextSubmissionState: FocusedSubmissionState | null) => {
    if (!onContextChange) return;
    const derived = deriveScopeContextForItem(
      focusedItemId ||
        (step === 'materials'
          ? activeMaterials.find((requirement) => !!requirement.sourceGeneratedItemId)?.sourceGeneratedItemId || null
          : null)
    );
    onContextChange({
      intent,
      step,
      unitId: selectedUnit?.id || null,
      inspectionId: inspection?.id || null,
      roomId: selectedRoomId || null,
      itemId: focusedItemId || null,
      scopeSection: derived.scopeSection,
      scopeTarget: derived.scopeTarget,
      procurementRequirementId: derived.procurementRequirementId,
      submissionState: nextSubmissionState,
    });
  };

  const goToStep = (
    nextStep: FocusedStep,
    options?: { roomId?: string | null; itemId?: string | null; openMaterialEditor?: boolean }
  ) => {
    if (typeof options?.roomId !== 'undefined') {
      setSelectedRoomId(options.roomId || null);
    }
    if (typeof options?.itemId !== 'undefined') {
      setFocusedItemId(options.itemId || null);
    }
    if (options?.openMaterialEditor && options?.itemId) {
      setExpandedMaterialEditors((current) => ({ ...current, [options.itemId as string]: true }));
    }
    setStep(nextStep);
    syncFocusedContext(nextStep, options?.roomId, options?.itemId);
  };

  useEffect(() => {
    if (!onContextChange) return;
    const derived = deriveScopeContextForItem(
      focusedItemId ||
        (step === 'materials'
          ? activeMaterials.find((requirement) => !!requirement.sourceGeneratedItemId)?.sourceGeneratedItemId || null
          : null)
    );
    onContextChange({
      intent,
      step,
      unitId: selectedUnit?.id || null,
      inspectionId: inspection?.id || null,
      roomId: selectedRoomId || null,
      itemId: focusedItemId || null,
      scopeSection: derived.scopeSection,
      scopeTarget: derived.scopeTarget,
      procurementRequirementId: derived.procurementRequirementId,
      submissionState,
    });
  }, [
    focusedItemId,
    inspection?.id,
    intent,
    activeMaterials,
    submissionState,
    onContextChange,
    selectedRoomId,
    selectedUnit?.id,
    step,
    generatedSections,
  ]);

  const persistInspectionSections = async (nextSections: GeneratedInspectionSection[], message: string, itemId?: string | null) => {
    if (!org || !user || !inspection) return;
    setSaveState({ phase: 'saving', message: 'Saving on this device…', itemId: itemId || null });
    try {
      const updatedInspection: Inspection = {
        ...inspection,
        generatedSections: nextSections,
        generatedItems: nextSections.flatMap((section) => section.items),
      };
      await InspectionService.updateInspection(org.id, updatedInspection, user.id);
      setInspection(updatedInspection);
      setGeneratedSections(nextSections);
      setSaveState({ phase: 'saved', message, itemId: itemId || null });
      window.setTimeout(() => setSaveState((current) => (current.phase === 'saved' ? { phase: 'idle' } : current)), 1400);
    } catch (error) {
      setSaveState({
        phase: 'failed',
        message: error instanceof Error ? error.message : 'Save failed.',
        itemId: itemId || null,
      });
      throw error;
    }
  };

  const updateGeneratedItem = async (
    sectionId: string,
    itemId: string,
    updater: (item: GeneratedInspectionItem) => GeneratedInspectionItem,
    successMessage: string
  ) => {
    const nextSections = generatedSections.map((section) =>
      section.id !== sectionId
        ? section
        : {
            ...section,
            items: section.items.map((item) => (item.id !== itemId ? item : updater(item))),
          }
    );
    await persistInspectionSections(nextSections, successMessage, itemId);
  };

  const allFocusedItems = generatedSections.flatMap((section) => section.items.map((item) => ({ section, item })));
  const dirtyNoteEntries = allFocusedItems.filter(({ item }) => (noteDrafts[item.id] || '').trim() !== (item.notes || '').trim());
  const dirtyProductEntries = allFocusedItems.filter(({ item }) => {
    const selection = productSelections[item.id];
    if (!selection) return false;
    const existingRequirement =
      (item.materialRequirementIds || []).map((id) => materialMap.get(id)).find(Boolean) ||
      activeMaterials.find((requirement) => requirement.sourceGeneratedItemId === item.id) ||
      null;
    const existingCatalogItemId = existingRequirement?.selectedMatch?.catalogItemId || '';
    const existingQuantity = existingRequirement ? String(existingRequirement.quantity) : '';
    return (selection.catalogItemId || '') !== existingCatalogItemId || (selection.quantity || '') !== existingQuantity;
  });
  const hasUnitDraftChanges = (Object.values(unitDraft) as string[]).some((value) => value.trim().length > 0);
  const hasUnsavedFocusedChanges =
    saveState.phase === 'saving' ||
    saveState.phase === 'failed' ||
    dirtyNoteEntries.length > 0 ||
    dirtyProductEntries.length > 0 ||
    hasUnitDraftChanges ||
    Boolean(pendingCreateDraft);

  const handleExitRequest = () => {
    if (!hasUnsavedFocusedChanges) {
      onExit();
      return;
    }
    setExitDialogError(null);
    setShowExitDialog(true);
  };

  const handleFullModeRequest = () => {
    const hasInspectionInProgress = Boolean(inspection?.id || selectedUnit?.id || step !== 'select');
    if (
      (hasUnsavedFocusedChanges || hasInspectionInProgress) &&
      !window.confirm('Switch to Full Mode? Your focused inspection context will open in the full workspace.')
    ) {
      return;
    }
    onSwitchFullMode();
  };

  const resetTransientFocusedDrafts = () => {
    setUnitDraft(EMPTY_UNIT_DRAFT);
    setPendingCreateDraft(null);
    setDuplicateMatches([]);
    setShowDuplicateModal(false);
    setExpandedNotes({});
    setExpandedMaterialEditors({});
    setNoteDrafts(Object.fromEntries(allFocusedItems.map(({ item }) => [item.id, item.notes || ''])));
    setProductSelections(
      Object.fromEntries(
        activeMaterials.map((requirement) => [
          requirement.sourceGeneratedItemId || requirement.id,
          {
            catalogItemId: requirement.selectedMatch?.catalogItemId || '',
            quantity: String(requirement.quantity),
          },
        ])
      )
    );
    setSaveState({ phase: 'idle' });
    setErrorMessage(null);
    setSubmitBlockMessage(null);
  };

  const handleDiscardAndExit = () => {
    if (saveState.phase === 'saving') {
      setExitDialogError('A save is still running. Wait for it to finish, then choose Back again.');
      return;
    }
    resetTransientFocusedDrafts();
    setShowExitDialog(false);
    setExitDialogError(null);
    onExit();
  };

  const handleSaveAndExit = async () => {
    if (isExitSaving) return;
    setExitDialogError(null);
    setIsExitSaving(true);
    try {
      if (saveState.phase === 'saving') {
        throw new Error('A save is still running. Wait for it to finish, then choose Back again.');
      }
      if (saveState.phase === 'failed') {
        throw new Error(saveState.message || 'The last save failed. Retry the item save before leaving.');
      }
      if (pendingCreateDraft) {
        await handleCreateUnit(pendingCreateDraft);
      } else if (hasUnitDraftChanges) {
        if (!unitDraft.name.trim() || !unitDraft.layoutTemplateId) {
          throw new Error('Enter a unit name and layout template before saving this draft, or choose Discard & Exit.');
        }
        await handleCreateUnit(unitDraft);
      }
      for (const { section, item } of dirtyNoteEntries) {
        await handleNoteSave(section, item);
      }
      for (const { section, item } of dirtyProductEntries) {
        const selection = productSelections[item.id];
        if (!selection?.catalogItemId) {
          throw new Error(`Choose a product for ${item.label}, or choose Discard & Exit.`);
        }
        if (!isIssueFocusedAction(item.focusedAction) && !isAlwaysReplaceChecklistItem(item)) {
          throw new Error(`Choose Repair or Replace for ${item.label}, or choose Discard & Exit.`);
        }
        await handleAddMaterial(section, item);
      }
      setShowExitDialog(false);
      onExit();
    } catch (error) {
      setExitDialogError(error instanceof Error ? error.message : 'Failed to save before exit.');
    } finally {
      setIsExitSaving(false);
    }
  };

  const resolveInspectionLaunchState = (unit: Unit): FocusedInspectionLaunchState => {
    const inspectionsForUnit = [...(inspectionsByUnit[unit.id] || [])].sort((left, right) => right.updatedAt - left.updatedAt);
    const resumableInspection =
      inspectionsForUnit.find((entry) => entry.status !== 'completed' && (entry.generatedSections || []).length > 0) || null;
    if (resumableInspection) {
      return {
        kind: 'resume',
        primaryLabel: 'Resume Inspection',
        helper: 'Pick up the saved focused inspection for this unit.',
        inspection: resumableInspection,
        showReviewAction: false,
      };
    }

    const completedInspection =
      inspectionsForUnit.find((entry) => entry.status === 'completed' && (entry.generatedSections || []).length > 0) || null;
    if (completedInspection) {
      return {
        kind: 'completed',
        primaryLabel: 'Start New Inspection',
        helper: 'The last focused inspection is complete. Start a fresh inspection and keep the prior record intact.',
        inspection: completedInspection,
        showReviewAction: true,
      };
    }

    return {
      kind: 'start',
      primaryLabel: 'Start Inspection',
      helper:
        inspectionsForUnit.length > 0
          ? 'Start a fresh focused inspection from the unit layout.'
          : 'No inspection exists yet for this unit.',
      inspection: null,
      showReviewAction: false,
    };
  };

  const createFocusedInspectionForUnit = async (unit: Unit): Promise<Inspection> => {
    if (!org || !user) {
      throw new Error('A signed-in local session is required.');
    }

    const activeLayouts = await LayoutTemplateService.listActive(org.id);
    const backfilledUnit = await UnitService.backfillLayoutTemplateIfMissing(org.id, unit, activeLayouts);
    const unitForGeneration = backfilledUnit || unit;
    const preferredLayout = UnitService.resolveTemplateForUnit(unitForGeneration, activeLayouts).layout;
    if (!preferredLayout) {
      throw new Error('FOCUSED_TEMPLATE_REQUIRED');
    }

    const generation = await InspectionTemplateGenerationService.generateFromLayout({
      layoutTemplateId: preferredLayout.id,
      orgId: org.id,
      unit: unitForGeneration,
    });

    return InspectionService.createInspection(org.id, unit.id, `${unit.name} Focused Inspection`, user.id, {
      templateSnapshot: generation.snapshot,
      generatedSections: generation.sections,
      generatedItems: generation.items,
    });
  };

  const ensureInspectionForUnit = async (unit: Unit): Promise<Inspection> => {
    const inspectionsForUnit = inspectionsByUnit[unit.id] || [];
    const templateBackedInspection =
      inspectionsForUnit.find((entry) => (entry.generatedSections || []).length > 0) || null;
    if (templateBackedInspection) {
      return templateBackedInspection;
    }
    return createFocusedInspectionForUnit(unit);
  };

  const launchInspectionForUnit = async (unit: Unit, launchState?: FocusedInspectionLaunchState) => {
    clearFocusedMessages();
    setIsLoading(true);
    try {
      const resolvedLaunchState = launchState || resolveInspectionLaunchState(unit);
      const targetInspection =
        resolvedLaunchState.kind === 'resume'
          ? resolvedLaunchState.inspection
          : await createFocusedInspectionForUnit(unit);
      setInspections((current) => {
        const withoutPrevious = current.filter((entry) => entry.id !== targetInspection.id);
        return [targetInspection, ...withoutPrevious].sort((left, right) => right.updatedAt - left.updatedAt);
      });
      await loadInspectionContext(targetInspection.id, 'inspection', targetInspection);
    } catch (error) {
      if (isTemplateRecoveryError(error)) {
        setStep('select');
        setTemplateRecoveryState(buildTemplateRecoveryState(unit));
        setErrorMessage(null);
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to open the focused workflow for this unit.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectUnit = async (unitId: string, nextIntent: FocusedWorkflowIntent = intent) => {
    if (!org) return;
    const unit = units.find((entry) => entry.id === unitId) || (await UnitService.getUnit(org.id, unitId));
    if (!unit) {
      setErrorMessage('The selected unit could not be found.');
      return;
    }

    setIsLoading(true);
    setShowResumeHint(false);
    clearFocusedMessages();
    try {
      const activeLayouts = await LayoutTemplateService.listActive(org.id);
      const backfilledUnit = await UnitService.backfillLayoutTemplateIfMissing(org.id, unit, activeLayouts);
      const unitForWorkflow = backfilledUnit || unit;
      if (backfilledUnit) {
        setUnits((current) => current.map((entry) => (entry.id === backfilledUnit.id ? backfilledUnit : entry)));
      }
      if (nextIntent === 'inspection') {
        await launchInspectionForUnit(unitForWorkflow);
        return;
      }
      const nextInspection = await ensureInspectionForUnit(unitForWorkflow);
      setInspections((current) => {
        const withoutPrevious = current.filter((entry) => entry.id !== nextInspection.id);
        return [nextInspection, ...withoutPrevious].sort((left, right) => right.updatedAt - left.updatedAt);
      });
      await loadInspectionContext(nextInspection.id, 'materials', nextInspection);
    } catch (error) {
      if (isTemplateRecoveryError(error)) {
        setStep('select');
        setTemplateRecoveryState(buildTemplateRecoveryState(unit));
        setErrorMessage(null);
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to open the focused workflow for this unit.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const createOrUpdateIssueRecords = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem, action: FocusedItemAction) => {
    if (!org || !user || !inspection || !selectedUnit) {
      throw new Error('The focused inspection context is unavailable.');
    }

    const existingFinding = (item.findingIds || []).map((id) => findingMap.get(id)).find(Boolean) || null;
    const existingTask = (item.repairTaskIds || []).map((id) => taskMap.get(id)).find(Boolean) || null;

    const finding = existingFinding
      ? await FindingService.updateFinding(
          org.id,
          {
            ...existingFinding,
            area: item.roomLabel || section.title,
            description: item.label,
            notes: noteDrafts[item.id]?.trim() || undefined,
            photoIds: item.photoIds,
            recommendedTrade: inferTrade(action, item.label),
            metadata: {
              ...(existingFinding.metadata || {}),
              focusedAction: action,
              sourceGeneratedSectionId: section.id,
              sourceGeneratedItemId: item.id,
            },
          },
          user.id
        )
      : await FindingService.createFinding(
          org.id,
          {
            orgId: org.id,
            inspectionId: inspection.id,
            unitId: selectedUnit.id,
            area: item.roomLabel || section.title,
            category: 'general',
            severity: action === 'replace' ? 'major' : 'moderate',
            priority: action === 'replace' ? 'high' : 'medium',
            status: 'open',
            description: item.label,
            notes: noteDrafts[item.id]?.trim() || undefined,
            recommendedTrade: inferTrade(action, item.label),
            photoIds: item.photoIds,
            metadata: {
              source: 'focused_mode',
              focusedAction: action,
              checklistOrigin: true,
              checklistSectionId: section.id,
              checklistSectionLabel: section.title,
              checklistItemId: item.id,
              checklistItemLabel: item.label,
              sourceGeneratedSectionId: section.id,
              sourceGeneratedItemId: item.id,
              roomLabel: item.roomLabel || section.title,
            },
          },
          user.id
        );

    const taskTitle = `${titleCase(action)} ${item.label}`.trim();
    const task = existingTask
      ? await RepairTaskService.updateTask(
          org.id,
          {
            ...existingTask,
            title: taskTitle,
            trade: inferTrade(action, item.label),
            findingIds: Array.from(new Set([...(existingTask.findingIds || []), finding.id])),
            notes: noteDrafts[item.id]?.trim() || undefined,
            metadata: {
              ...(existingTask.metadata || {}),
              focusedAction: action,
              checklistOrigin: true,
              checklistSectionId: section.id,
              checklistSectionLabel: section.title,
              checklistItemId: item.id,
              checklistItemLabel: item.label,
              roomLabel: item.roomLabel || section.title,
            },
          },
          user.id
        )
      : await RepairTaskService.createTask(
          org.id,
          {
            orgId: org.id,
            inspectionId: inspection.id,
            unitId: selectedUnit.id,
            findingIds: [finding.id],
            title: taskTitle,
            trade: inferTrade(action, item.label),
            priority: action === 'replace' ? 'high' : 'medium',
            status: 'ready',
            notes: noteDrafts[item.id]?.trim() || undefined,
            metadata: {
              source: 'focused_mode',
              focusedAction: action,
              checklistOrigin: true,
              checklistSectionId: section.id,
              checklistSectionLabel: section.title,
              checklistItemId: item.id,
              checklistItemLabel: item.label,
              roomLabel: item.roomLabel || section.title,
            },
          },
          user.id
        );

    return { finding, task };
  };

  const clearIssueRecordsForGood = async (item: GeneratedInspectionItem) => {
    if (!org || !user) {
      throw new Error('The focused inspection context is unavailable.');
    }

    const linkedRequirements = [
      ...(item.materialRequirementIds || []).map((id) => materials.find((requirement) => requirement.id === id)).filter(Boolean),
      ...materials.filter((requirement) => requirement.sourceGeneratedItemId === item.id),
    ].filter((requirement, index, list) => list.findIndex((entry) => entry!.id === requirement!.id) === index) as MaterialRequirement[];

    for (const requirement of linkedRequirements) {
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          status: 'canceled',
          procurementState: 'scoped_only',
          vendorActionState: 'unassigned',
          verificationStatus: 'pending',
          closeoutIssueState: 'none',
          correctionRoute: undefined,
          selectedMatch: undefined,
          assignedVendorUserId: undefined,
          assignedVendorDisplayName: undefined,
          procurementAssignedAt: undefined,
          procurementAssignedByUserId: undefined,
          vendorActionUpdatedAt: undefined,
          vendorActionUpdatedByUserId: undefined,
          vendorCompletedAt: undefined,
          vendorCompletedByUserId: undefined,
          vendorCompletionNote: undefined,
          vendorCompletionDetails: undefined,
          receivedAt: undefined,
          receivedByUserId: undefined,
          verifiedAt: undefined,
          verifiedByUserId: undefined,
          closeoutIssueNotes: undefined,
          closeoutIssueAt: undefined,
          closeoutIssueByUserId: undefined,
        },
        user.id
      );
    }

    for (const taskId of item.repairTaskIds || []) {
      await RepairTaskService.deleteTask(org.id, taskId, user.id);
    }
    for (const findingId of item.findingIds || []) {
      await FindingService.deleteFinding(org.id, findingId, user.id);
    }
  };

  const createOrUpdateAlwaysReplaceRecords = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem) => {
    if (!org || !user || !inspection || !selectedUnit) {
      throw new Error('The focused inspection context is unavailable.');
    }

    const existingTask =
      (item.repairTaskIds || []).map((id) => taskMap.get(id)).find(Boolean) ||
      tasks.find((task) => task.metadata?.sourceGeneratedItemId === item.id) ||
      null;
    const existingRequirement =
      (item.materialRequirementIds || []).map((id) => materialMap.get(id)).find(Boolean) ||
      activeMaterials.find((requirement) => requirement.sourceGeneratedItemId === item.id) ||
      null;

    return ChecklistAlwaysReplaceService.commitItem({
      orgId: org.id,
      userId: user.id,
      inspectionId: inspection.id,
      unitId: selectedUnit.id,
      section,
      item,
      existingTask,
      existingRequirement,
    });
  };

  const persistAlwaysReplaceQuantity = async (
    section: GeneratedInspectionSection,
    item: GeneratedInspectionItem,
    quantity: number
  ) => {
    if (!ensureEditableInspection('edit standard quantities')) return;
    if (!isAlwaysReplaceChecklistItem(item) || item.inputMode !== 'count') return;
    if (saveState.phase === 'saving' && saveState.itemId === item.id) return;

    const nextQuantity = Math.max(1, Math.round(Number(quantity) || 1));
    const itemWithQuantity: GeneratedInspectionItem = {
      ...item,
      status: 'completed',
      inputValue: {
        ...(item.inputValue || {}),
        quantity: nextQuantity,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };

    setFocusedItemId(item.id);
    setErrorMessage(null);
    setGlobalMessage(null);
    setContinuityHint(null);
    setSubmitBlockMessage(null);
    setSaveState({ phase: 'saving', message: 'Saving quantity…', itemId: item.id });

    try {
      const { task, requirement } = await createOrUpdateAlwaysReplaceRecords(section, itemWithQuantity);
      const nextSections = generatedSections.map((entry) =>
        entry.id !== section.id
          ? entry
          : {
              ...entry,
              items: entry.items.map((listItem) =>
                listItem.id !== item.id
                  ? listItem
                  : {
                      ...listItem,
                      ...itemWithQuantity,
                      repairTaskIds: Array.from(new Set([...(listItem.repairTaskIds || []), task.id])),
                      materialRequirementIds: Array.from(new Set([...(listItem.materialRequirementIds || []), requirement.id])),
                    }
              ),
            }
      );
      await persistInspectionSections(nextSections, `Quantity ${nextQuantity} saved.`, item.id);
      await refreshAfterChange(undefined, { roomId: getRoomKey(section), itemId: item.id });
      setGlobalMessage(`${item.label} quantity saved to materials.`);
    } catch (error) {
      setSaveState({
        phase: 'failed',
        message: error instanceof Error ? error.message : 'Failed to save quantity.',
        itemId: item.id,
      });
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save quantity.');
    }
  };

  const refreshAfterChange = async (
    nextStep?: FocusedStep,
    options?: {
      roomId?: string | null;
      itemId?: string | null;
      openMaterialEditorForItemId?: string | null;
    }
  ) => {
    if (!inspection) return;
    await loadInspectionContext(inspection.id, nextStep || step, undefined, {
      preferredRoomId: options?.roomId ?? selectedRoomId,
      preferredItemId: options?.itemId ?? focusedItemId,
      openMaterialEditorForItemId: options?.openMaterialEditorForItemId || null,
    });
  };

  const handleActionChange = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem, action: FocusedItemAction) => {
    setFocusedItemId(item.id);
    if (item.focusedAction === action) return;
    if (!ensureEditableInspection('make changes')) return;
    setErrorMessage(null);
    setGlobalMessage(null);
    setContinuityHint(null);
    try {
      if (action === 'good') {
        await clearIssueRecordsForGood(item);
        const nextSections = generatedSections.map((entry) =>
          entry.id !== section.id
            ? entry
            : {
                ...entry,
                items: entry.items.map((listItem) =>
                  listItem.id !== item.id
                    ? listItem
                    : {
                        ...listItem,
                        focusedAction: 'good',
                        status: 'completed',
                        findingIds: [],
                        repairTaskIds: [],
                        materialRequirementIds: [],
                      }
                ),
              }
        );
        setProductSelections((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
        await persistInspectionSections(nextSections, 'Good saved on this device.', item.id);
        const followUp = buildPostSaveContinuityHint(nextSections, {
          roomId: getRoomKey(section),
          currentItemLabel: item.label,
          saveKind: 'issue',
        });
        await refreshAfterChange(undefined, { roomId: getRoomKey(section), itemId: followUp.itemId });
        setContinuityHint(followUp.hint);
        return;
      }

      const { finding, task } = await createOrUpdateIssueRecords(section, item, action);
      const nextSections = generatedSections.map((entry) =>
        entry.id !== section.id
          ? entry
          : {
              ...entry,
              items: entry.items.map((listItem) =>
                listItem.id !== item.id
                  ? listItem
                  : {
                      ...listItem,
                      focusedAction: action,
                      status: 'blocked',
                      findingIds: Array.from(new Set([...(listItem.findingIds || []), finding.id])),
                      repairTaskIds: Array.from(new Set([...(listItem.repairTaskIds || []), task.id])),
                    }
              ),
            }
      );
      await persistInspectionSections(nextSections, `${titleCase(action)} saved on this device.`, item.id);
      const followUp = buildPostSaveContinuityHint(nextSections, {
        roomId: getRoomKey(section),
        currentItemLabel: item.label,
        saveKind: 'issue',
      });
      await refreshAfterChange(undefined, { roomId: getRoomKey(section), itemId: followUp.itemId });
      setContinuityHint(followUp.hint);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the issue action.');
    }
  };

  const handleNoteSave = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem) => {
    if (!org || !user) return;
    if (!ensureEditableInspection('save notes')) return;
    const nextNote = noteDrafts[item.id]?.trim() || '';
    setContinuityHint(null);
    try {
      if ((item.findingIds || []).length > 0) {
        const finding = findingMap.get(item.findingIds?.[0] || '');
        if (finding) {
          await FindingService.updateFinding(org.id, { ...finding, notes: nextNote || undefined }, user.id);
        }
      }
      if ((item.repairTaskIds || []).length > 0) {
        const task = taskMap.get(item.repairTaskIds?.[0] || '');
        if (task) {
          await RepairTaskService.updateTask(org.id, { ...task, notes: nextNote || undefined }, user.id);
        }
      }
      if ((item.materialRequirementIds || []).length > 0) {
        const requirement = materialMap.get(item.materialRequirementIds?.[0] || '');
        if (requirement) {
          await MaterialRequirementService.updateRequirement(org.id, { ...requirement, notes: nextNote || undefined }, user.id);
        }
      }
      await updateGeneratedItem(section.id, item.id, (entry) => ({ ...entry, notes: nextNote || undefined, updatedAt: Date.now() }), 'Note saved on this device.');
      const nextSections = generatedSections.map((entry) =>
        entry.id !== section.id
          ? entry
          : {
              ...entry,
              items: entry.items.map((listItem) =>
                listItem.id !== item.id ? listItem : { ...listItem, notes: nextNote || undefined, updatedAt: Date.now() }
              ),
            }
      );
      await refreshAfterChange(undefined, { roomId: getRoomKey(section), itemId: item.id });
      setContinuityHint({
        tone: 'saved',
        title: 'Note saved.',
        detail: `Keep moving in ${getRoomKey(section)} or continue with ${item.label}.`,
        primaryAction: { label: 'Stay on this item', type: 'focus_room', roomId: getRoomKey(section), itemId: item.id },
        secondaryAction: buildPostSaveContinuityHint(nextSections, {
          roomId: getRoomKey(section),
          currentItemLabel: item.label,
          saveKind: 'note',
        }).hint?.secondaryAction || null,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the note.');
    }
  };

  const handlePhotoCapture = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem, file: File) => {
    if (!org || !user || !inspection) return;
    if (!ensureEditableInspection('add photos')) return;
    setContinuityHint(null);
    setSaveState({ phase: 'saving', message: 'Saving photo on this device…', itemId: item.id });
    try {
      const asset = await MediaService.savePhotoFromFile({
        orgId: org.id,
        file,
        source: 'camera',
      });
      await InspectionService.addPhoto(org.id, inspection.id, asset.id, user.id);
      const nextSections = generatedSections.map((entry) =>
        entry.id !== section.id
          ? entry
          : {
              ...entry,
              items: entry.items.map((listItem) =>
                listItem.id !== item.id
                  ? listItem
                  : {
                      ...listItem,
                      photoIds: Array.from(new Set([...(listItem.photoIds || []), asset.id])),
                      updatedAt: Date.now(),
                    }
              ),
            }
      );

      if ((item.findingIds || []).length > 0) {
        const finding = findingMap.get(item.findingIds?.[0] || '');
        if (finding) {
          await FindingService.updateFinding(
            org.id,
            {
              ...finding,
              photoIds: Array.from(new Set([...(finding.photoIds || []), asset.id])),
            },
            user.id
          );
        }
      }

      await persistInspectionSections(nextSections, 'Photo saved on this device.', item.id);
      await refreshAfterChange(undefined, { roomId: getRoomKey(section), itemId: item.id });
      setContinuityHint({
        tone: 'saved',
        title: 'Photo saved.',
        detail: `Continue with ${item.label} or move on when you are ready.`,
        primaryAction: { label: 'Stay on this item', type: 'focus_room', roomId: getRoomKey(section), itemId: item.id },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the photo.');
    }
  };

  const handleAddMaterial = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem) => {
    if (!org || !user || !inspection || !selectedUnit) return;
    if (!ensureEditableInspection('edit materials')) return;
    setContinuityHint(null);
    setSubmitBlockMessage(null);
    if (isAlwaysReplaceChecklistItem(item)) {
      try {
        const { task, requirement } = await createOrUpdateAlwaysReplaceRecords(section, item);
        const nextSections = generatedSections.map((entry) =>
          entry.id !== section.id
            ? entry
            : {
                ...entry,
                items: entry.items.map((listItem) =>
                  listItem.id !== item.id
                    ? listItem
                    : {
                        ...listItem,
                        status: 'completed',
                        repairTaskIds: Array.from(new Set([...(listItem.repairTaskIds || []), task.id])),
                        materialRequirementIds: Array.from(new Set([...(listItem.materialRequirementIds || []), requirement.id])),
                      }
                ),
              }
        );
        await persistInspectionSections(nextSections, 'Turnover standard saved on this device.', item.id);
        const followUp = buildPostSaveContinuityHint(nextSections, {
          roomId: getRoomKey(section),
          currentItemLabel: item.label,
          saveKind: 'always_replace',
        });
        await refreshAfterChange(undefined, { roomId: getRoomKey(section), itemId: followUp.itemId });
        setGlobalMessage('Always-replace standard saved directly into tasks and materials.');
        setContinuityHint(followUp.hint);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save the always-replace standard.');
      }
      return;
    }

    const selection = productSelections[item.id];
    const catalogItem = catalogItems.find((entry) => entry.id === selection?.catalogItemId);
    if (!catalogItem) {
      setErrorMessage('Choose a product before adding it to materials.');
      return;
    }
    if (!isIssueFocusedAction(item.focusedAction)) {
      setErrorMessage('Choose Repair or Replace before adding materials.');
      return;
    }

    const quantity = Number(selection?.quantity || catalogItem.defaultQty || 1);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage('Enter a valid quantity before saving materials.');
      return;
    }

    try {
      const { finding, task } = await createOrUpdateIssueRecords(section, item, item.focusedAction);
      const selectedMatch = buildSelectedMatch(catalogItem);
      if (!selectedMatch) {
        throw new Error('The chosen catalog product has no selectable option.');
      }

      const existingRequirement =
        (item.materialRequirementIds || []).map((id) => materialMap.get(id)).find(Boolean) ||
        materials.find((requirement) => requirement.repairTaskId === task.id) ||
        null;

      const savedRequirement = existingRequirement
        ? await MaterialRequirementService.updateRequirement(
            org.id,
            {
              ...existingRequirement,
              category: catalogItem.categoryName || catalogItem.category || 'general',
              itemDescription: item.label,
              quantity,
              unit: catalogItem.unit,
              confidence: 'high',
              source: 'manual',
              status: 'reviewed',
              selectedMatch,
              procurementReadyAt: existingRequirement.procurementReadyAt || Date.now(),
              notes: noteDrafts[item.id]?.trim() || undefined,
              roomLabel: item.roomLabel || section.title,
              sourceFindingId: finding.id,
              sourceGeneratedSectionId: section.id,
              sourceGeneratedItemId: item.id,
            },
            user.id
          )
        : await MaterialRequirementService.createRequirement(
            org.id,
            {
              orgId: org.id,
              inspectionId: inspection.id,
              repairTaskId: task.id,
              category: catalogItem.categoryName || catalogItem.category || 'general',
              itemDescription: item.label,
              quantity,
              unit: catalogItem.unit,
              confidence: 'high',
              source: 'manual',
              status: 'reviewed',
              selectedMatch,
              procurementReadyAt: Date.now(),
              notes: noteDrafts[item.id]?.trim() || undefined,
              roomLabel: item.roomLabel || section.title,
              sourceFindingId: finding.id,
              sourceGeneratedSectionId: section.id,
              sourceGeneratedItemId: item.id,
              metadata: {
                source: 'focused_mode',
                focusedAction: item.focusedAction,
              },
            },
            user.id
          );

      await MaterialMatchingService.rememberSelection(org.id, savedRequirement, selectedMatch);

      const nextSections = generatedSections.map((entry) =>
        entry.id !== section.id
          ? entry
          : {
              ...entry,
              items: entry.items.map((listItem) =>
                listItem.id !== item.id
                  ? listItem
                  : {
                      ...listItem,
                      focusedAction: item.focusedAction,
                      status: 'blocked',
                      findingIds: Array.from(new Set([...(listItem.findingIds || []), finding.id])),
                      repairTaskIds: Array.from(new Set([...(listItem.repairTaskIds || []), task.id])),
                      materialRequirementIds: Array.from(new Set([...(listItem.materialRequirementIds || []), savedRequirement.id])),
                    }
              ),
            }
      );
      await persistInspectionSections(nextSections, 'Materials saved on this device.', item.id);
      const followUp = buildPostSaveContinuityHint(nextSections, {
        roomId: getRoomKey(section),
        currentItemLabel: item.label,
        saveKind: 'material',
      });
      await refreshAfterChange(undefined, { roomId: getRoomKey(section), itemId: followUp.itemId });
      setGlobalMessage('Materials list updated automatically and saved on this device.');
      setContinuityHint(followUp.hint);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the material requirement.');
    }
  };

  const submitMaterials = async () => {
    if (!org || !user) return;
    setSubmitBlockMessage(null);
    const actionableRequirements = activeMaterials.filter((requirement) => requirement.selectedMatch);
    const actionableRequirementIds = actionableRequirements.map((requirement) => requirement.id).sort();
    const isSameSubmittedSet =
      Boolean(submissionState?.inspectionId === inspection?.id) &&
      submissionState?.outcome === 'submitted' &&
      submissionState.requirementIds.length === actionableRequirementIds.length &&
      submissionState.requirementIds.slice().sort().every((id, index) => id === actionableRequirementIds[index]);
    if (isSameSubmittedSet && inspection) {
      const nextSubmissionState = normalizeFocusedSubmissionState(
        submissionState,
        inspection,
        materials,
        selectedUnit
      );
      setSubmissionState(nextSubmissionState);
      syncSubmissionContext(nextSubmissionState);
      setGlobalMessage('These materials are already in Procurement. Continue there or start the next unit when ready.');
      return;
    }
    if (actionableRequirements.length === 0) {
      setSubmissionState({
        inspectionId: inspection?.id || initialInspectionId || '',
        outcome: 'failed',
        unitName: selectedUnit?.name || 'This unit',
        itemCount: 0,
        estimatedTotal,
        requirementIds: [],
        nextStep: 'Choose at least one product before submitting materials.',
        detail: 'No material requirements with selected products are ready to move into procurement yet.',
      });
      setGlobalMessage('Choose products for at least one material item before submitting.');
      return;
    }
    try {
      setGlobalMessage(isOnline ? 'Submitting materials into Procurement…' : 'Queueing materials locally for Procurement on this device…');
      if (typeof window !== 'undefined') {
        const flags = (window as typeof window & { __unitflipTestFlags?: { forceFocusedSubmitFailureOnce?: boolean } }).__unitflipTestFlags;
        if (flags?.forceFocusedSubmitFailureOnce) {
          flags.forceFocusedSubmitFailureOnce = false;
          throw new Error('Focused submit test failure.');
        }
      }
      for (const requirement of actionableRequirements) {
        if (!['ready_for_procurement', 'activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '')) {
          await MaterialRequirementService.updateRequirement(
            org.id,
            {
              ...requirement,
              status: 'reviewed',
              procurementReadyAt: requirement.procurementReadyAt || Date.now(),
            },
            user.id
          );
        }
      }
      await refreshAfterChange('materials');
      setPendingSubmitOverride(false);
      const outcome: FocusedSubmissionState['outcome'] = isOnline ? 'submitted' : 'queued';
      const nextSubmissionState: FocusedSubmissionState = {
        inspectionId: inspection?.id || initialInspectionId || '',
        outcome,
        unitName: selectedUnit?.name || 'This unit',
        itemCount: actionableRequirements.length,
        estimatedTotal,
        requirementIds: actionableRequirements.map((requirement) => requirement.id),
        nextStep: isOnline
          ? 'Review the procurement queue and assign vendors or continue internal review.'
          : 'The work is queued on this device now. Reconnect and retry submit for a fresh confirmation, or open Procurement here any time.',
        detail: isOnline
          ? 'Materials are now in Procurement and ready for review or vendor assignment.'
          : 'Submission was queued offline. Nothing was lost, and the same material records are already available locally in Procurement on this device.',
      };
      setSubmissionState(nextSubmissionState);
      syncSubmissionContext(nextSubmissionState);
      setGlobalMessage(
        isOnline
          ? `Submitted ${actionableRequirements.length} material${actionableRequirements.length === 1 ? '' : 's'} into Procurement.`
          : `Queued ${actionableRequirements.length} material${actionableRequirements.length === 1 ? '' : 's'} locally for Procurement on this device.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit materials.';
      const failedSubmissionState: FocusedSubmissionState = {
        inspectionId: inspection?.id || initialInspectionId || '',
        outcome: 'failed',
        unitName: selectedUnit?.name || 'This unit',
        itemCount: actionableRequirements.length,
        estimatedTotal,
        requirementIds: actionableRequirements.map((requirement) => requirement.id),
        nextStep: 'Retry submission when you are ready. Your inspection and materials are still saved locally.',
        detail: `Submission did not finish. ${message}`,
      };
      setSubmissionState(failedSubmissionState);
      syncSubmissionContext(failedSubmissionState);
      setErrorMessage(message);
      setGlobalMessage('Submission needs retry. Your materials are still safe locally on this device.');
    }
  };

  const persistInspectionFinalization = async (
    nextFinalized: boolean,
    savingMessage: string,
    savedMessage: string,
    globalNotice: string,
    failureMessage: string
  ) => {
    if (!org || !user || !inspection) return false;
    setErrorMessage(null);
    setSubmitBlockMessage(null);
    setSaveState({ phase: 'saving', message: savingMessage });
    try {
      const nextInspection: Inspection = {
        ...inspection,
        isInspectionFinalized: nextFinalized,
      };
      await InspectionService.updateInspection(org.id, nextInspection, user.id);
      setInspection(nextInspection);
      setInspections((current) =>
        current
          .map((entry) =>
            entry.id === nextInspection.id ? { ...entry, isInspectionFinalized: nextFinalized } : entry
          )
          .sort((left, right) => right.updatedAt - left.updatedAt)
      );
      setSaveState({ phase: 'saved', message: savedMessage });
      setGlobalMessage(globalNotice);
      return true;
    } catch (error) {
      setSaveState({ phase: 'failed', message: failureMessage });
      setErrorMessage(error instanceof Error ? error.message : failureMessage);
      return false;
    }
  };

  const openInspectionReport = async () => {
    if (!org || !user || !inspection) return;
    if (!isInspectionComplete) {
      const nextMessage = 'Finish the inspection before generating the report.';
      setSubmitBlockMessage(nextMessage);
      setGlobalMessage(nextMessage);
      return;
    }
    if (hasReportReadinessGaps) {
      const nextMessage = 'Finish materials before generating the report.';
      setSubmitBlockMessage(nextMessage);
      setGlobalMessage(nextMessage);
      return;
    }

    setErrorMessage(null);
    setSubmitBlockMessage(null);
    setSaveState({ phase: 'saving', message: 'Generating report on this device…' });

    try {
      const requestedReport = await ReportService.createReportRequest({
        orgId: org.id,
        inspectionId: inspection.id,
        userId: user.id,
        options: { includePhotos: true },
      });

      let readyReport = requestedReport;
      if (requestedReport.status === 'queued' || requestedReport.status === 'generating') {
        await triggerSyncNow();
        const deadline = Date.now() + REPORT_READY_TIMEOUT_MS;
        while (Date.now() < deadline) {
          readyReport = (await ReportService.getLatestReport(org.id, inspection.id)) || requestedReport;
          if (readyReport.status === 'ready' || readyReport.status === 'failed') {
            break;
          }
          await wait(REPORT_READY_POLL_INTERVAL_MS);
        }
      }

      if (readyReport.status !== 'ready' || !readyReport.pdf?.url) {
        throw new Error(
          readyReport.errorMessage ||
            'Report generation did not complete. The inspection remains editable so you can retry.'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report generation failed.';
      setSaveState({ phase: 'failed', message: 'Report generation failed.' });
      setErrorMessage(message);
      setSubmitBlockMessage(message);
      setGlobalMessage('Report generation failed. The inspection is still editable and can be retried.');
      return;
    }

    if (!isInspectionFinalized) {
      const finalized = await persistInspectionFinalization(
        true,
        'Locking inspection after report generation…',
        'Report generated and inspection locked.',
        'Report generated. Editing is now locked until you choose Edit Inspection.',
        'Report generated, but locking the inspection failed.'
      );
      if (!finalized) return;
    } else {
      setSaveState({ phase: 'saved', message: 'Report generated on this device.' });
      setGlobalMessage('Report generated. Editing is already locked for this inspection.');
    }
    if (inspection?.id && selectedUnit?.id && onOpenInspectionReview) {
      onOpenInspectionReview(inspection.id, selectedUnit.id);
      return;
    }
    onSwitchFullMode();
  };

  const handleUnlockInspectionForEditing = async () => {
    if (!org || !user || !inspection || !inspection.isInspectionFinalized) return;
    await persistInspectionFinalization(
      false,
      'Unlocking inspection for editing on this device…',
      'Inspection unlocked for editing on this device.',
      'Inspection unlocked for editing. Generate the report again when you are ready to hand off the package.',
      'Failed to unlock the inspection for editing.'
    );
  };

  const handleSubmitMaterials = async () => {
    if (incompleteItems.length > 0) {
      const nextBlockMessage = `${incompleteItems.length} item${incompleteItems.length === 1 ? '' : 's'} still need attention before materials can be submitted. Review the missing items and finish the required action or material save first.`;
      setSubmitBlockMessage(nextBlockMessage);
      setGlobalMessage(nextBlockMessage);
      return;
    }

    if (!isInspectionFinalized) {
      const nextBlockMessage = 'Generate the report before sending materials to procurement.';
      setSubmitBlockMessage(nextBlockMessage);
      setGlobalMessage(nextBlockMessage);
      return;
    }

    if (selectedUnit?.budgetThreshold && estimatedTotal > selectedUnit.budgetThreshold && !pendingSubmitOverride) {
      setShowBudgetModal(true);
      return;
    }

    await submitMaterials();
  };

  const handleCreateUnit = async (draft: UnitDraft) => {
    if (!org) return;
    const nextUnit = await UnitService.createUnit(org.id, {
      name: draft.name.trim(),
      unitCode: draft.unitCode.trim() || undefined,
      address1: draft.address1.trim() || undefined,
      city: draft.city.trim() || undefined,
      state: draft.state.trim() || undefined,
      budgetThreshold: draft.budgetThreshold ? Number(draft.budgetThreshold) : undefined,
      assignedLayoutTemplateId: draft.layoutTemplateId,
    });
    await loadUnitsAndCatalog();
    setUnitDraft(EMPTY_UNIT_DRAFT);
    await handleSelectUnit(nextUnit.id, 'inspection');
  };

  const handleAttemptCreateUnit = async () => {
    if (!unitDraft.name.trim()) {
      setErrorMessage('Enter a unit name before continuing.');
      return;
    }
    if (!unitDraft.layoutTemplateId) {
      setErrorMessage('Choose the layout template that matches this unit before creating it.');
      return;
    }
    const matches = getDuplicateCandidates(units, unitDraft);
    if (matches.length > 0) {
      setDuplicateMatches(matches);
      setPendingCreateDraft(unitDraft);
      setShowDuplicateModal(true);
      return;
    }
    await handleCreateUnit(unitDraft);
  };

  const resetToUnitSelection = (message?: string) => {
    setSelectedUnit(null);
    setInspection(null);
    setGeneratedSections([]);
    setFindings([]);
    setTasks([]);
    setMaterials([]);
    setSelectedRoomId(null);
    setFocusedItemId(null);
    setExpandedNotes({});
    setExpandedMaterialEditors({});
    setNoteDrafts({});
    setProductSelections({});
    setUnitSearch('');
    setSubmissionState(null);
    setSubmitBlockMessage(null);
    setSaveState({ phase: 'idle' });
    setErrorMessage(null);
    setShowBudgetModal(false);
    setPendingSubmitOverride(false);
    setShowResumeHint(false);
    setGlobalMessage(message || null);
    setStep('select');
    if (onContextChange) {
      onContextChange({
        intent,
        step: 'select',
        unitId: null,
        inspectionId: null,
        roomId: null,
        itemId: null,
        scopeSection: null,
        scopeTarget: null,
        procurementRequirementId: null,
        submissionState: null,
      });
    }
  };

  const openReviewTarget = (roomId: string, itemId?: string | null) => {
    goToStep('inspection', { roomId, itemId: itemId || null });
  };

  const openMaterialsResolutionTarget = (roomId: string, itemId?: string | null) => {
    if (!itemId) {
      openReviewTarget(roomId, itemId);
      return;
    }
    setContinuityHint(null);
    goToStep('inspection', { roomId, itemId, openMaterialEditor: true });
  };

  const navigateRoom = (targetRoomId?: string | null) => {
    if (!targetRoomId || targetRoomId === selectedRoomId) return;
    setContinuityHint(null);
    goToStep('inspection', { roomId: targetRoomId, itemId: null });
  };

  const findReviewTarget = (roomId: string, preferredItemId?: string | null) => {
    const roomItems = generatedSections.filter((section) => getRoomKey(section) === roomId).flatMap((section) => section.items);
    if (preferredItemId) {
      return { roomId, itemId: preferredItemId };
    }
    const preferredItem =
      roomItems.find((item) => itemNeedsFollowThrough(item)) ||
      roomItems.find((item) => (item.notes || '').trim() || item.photoIds.length > 0) ||
      roomItems.find((item) => item.focusedAction) ||
      roomItems[0];
    return { roomId, itemId: preferredItem?.id || null };
  };

  const handleContinuityAction = (action?: FocusedContinuityHint['primaryAction'] | null) => {
    if (!action) return;
    setContinuityHint(null);
    if (action.type === 'focus_room') {
      openReviewTarget(action.roomId || selectedRoomId || roomGroups[0]?.id || '', action.itemId || null);
      return;
    }
    if (action.type === 'summary') {
      goToStep('summary');
      return;
    }
    if (action.type === 'full_inspection') {
      if (inspection?.id && selectedUnit?.id) {
        onOpenInspectionReview?.(inspection.id, selectedUnit.id);
        return;
      }
      onSwitchFullMode();
      return;
    }
    goToStep('materials');
  };

  const renderNeedsMaterialsList = (options?: {
    tone?: 'amber' | 'slate';
    title?: string;
    emptyMessage?: string;
    dataTestId?: string;
  }) => {
    const tone = options?.tone || 'amber';
    const shellClass =
      tone === 'amber'
        ? 'rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm'
        : 'rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm';
    const titleClass = tone === 'amber' ? 'text-amber-900' : 'text-slate-900';
    const bodyClass = tone === 'amber' ? 'text-amber-900/80' : 'text-slate-600';
    const cardClass =
      tone === 'amber'
        ? 'rounded-2xl bg-white/80 px-4 py-3'
        : 'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3';

    return (
      <div data-testid={options?.dataTestId} className={shellClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className={`text-lg font-semibold ${titleClass}`}>{options?.title || 'Needs Materials'}</h3>
            <div className={`mt-1 text-sm ${bodyClass}`}>
              {needsMaterialsItems.length === 0
                ? 'All materials assigned.'
                : `${needsMaterialsItems.length} item${needsMaterialsItems.length === 1 ? '' : 's'} still need materials.`}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {needsMaterialsItems.length === 0 ? (
            <div className={`text-sm ${bodyClass}`}>{options?.emptyMessage || 'All materials assigned.'}</div>
          ) : (
            needsMaterialsItems.map(({ roomId, roomLabel, item, actionLabel, isAlwaysReplace }) => (
              <div key={item.id} className={`${cardClass} flex items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>
                    {roomLabel}
                  </div>
                  <div className={`mt-1 font-medium ${tone === 'amber' ? 'text-amber-950' : 'text-slate-900'}`}>{item.label}</div>
                  <div className={`mt-1 text-sm ${bodyClass}`}>
                    {actionLabel}
                    {isAlwaysReplace ? ' standard' : ''} needs materials.
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openMaterialsResolutionTarget(roomId, item.id)}
                    className="rounded-2xl bg-lowes-blue px-3 py-2 text-sm font-semibold text-white"
                  >
                    Assign Materials
                  </button>
                  <button
                    type="button"
                    onClick={() => openReviewTarget(roomId, item.id)}
                    className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
                      tone === 'amber'
                        ? 'border-amber-300 bg-white text-amber-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Review Item
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderFinalizationLockBanner = () =>
    isInspectionFinalized ? (
      <div
        data-testid="focused-finalization-lock-banner"
        className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-white shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Report Generated</div>
            <div className="mt-1 text-base font-semibold">Editing is locked for this inspection.</div>
            <div className="mt-1 text-sm text-slate-300">
              Review the report, or choose Edit Inspection to unlock this inspection and make changes.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleUnlockInspectionForEditing()}
            className="rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
          >
            Edit Inspection
          </button>
        </div>
      </div>
    ) : null;

  const renderInspectionCompletionCard = () => {
    if (!showInspectionCompletionCard) return null;

    const primaryActionType = getFocusedCompletionPrimaryAction(hasReportReadinessGaps);
    const primaryAction = primaryActionType === 'finish_materials'
      ? {
          label: 'Finish Materials',
          onClick: () => goToStep('materials'),
          className: 'rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white md:rounded-2xl',
        }
        : {
          label: 'Generate Report',
          onClick: () => void openInspectionReport(),
          className: 'rounded-xl bg-lowes-blue px-4 py-2.5 text-sm font-semibold text-white md:rounded-2xl',
        };
    const readinessDetail = getFocusedReadinessDetail(needsMaterialsItems.length, hasReportReadinessGaps);

    return (
      <div
        data-testid="focused-inspection-complete"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950 shadow-sm md:rounded-[28px] md:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 md:text-xs md:tracking-[0.22em]">
              Inspection Complete
            </div>
            <div className="text-lg font-semibold text-emerald-950 md:text-xl">
              All checklist items have been captured.
            </div>
            <div className="max-w-3xl text-sm text-emerald-900">
              {hasReportReadinessGaps
                ? 'Finish the remaining materials before generating the report.'
                : 'Everything has a decision. Generate the report when you are ready, or review the inspection one more time.'}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <button
              type="button"
              onClick={primaryAction.onClick}
              className={primaryAction.className}
            >
              {primaryAction.label}
            </button>
            <button
              type="button"
              onClick={() => goToStep('summary')}
              className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-950 md:rounded-2xl"
            >
              Review Inspection
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ['Good', inspectionCompletionSummary.goodCount, 'bg-emerald-100 text-emerald-800'],
            ['Repair', inspectionCompletionSummary.repairCount, 'bg-blue-100 text-blue-800'],
            ['Replace', inspectionCompletionSummary.replaceCount, 'bg-amber-100 text-amber-900'],
            ['Total', inspectionCompletionSummary.totalItems, 'bg-white text-slate-800'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
              <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${tone}`}>{value}</div>
            </div>
          ))}
        </div>

        <div
          data-testid="focused-report-readiness"
          className={`mt-4 rounded-2xl border px-4 py-3 ${
            inspectionCompletionSummary.reportReadinessCount > 0
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-white text-emerald-900'
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em]">Next step</div>
          <div className="mt-1">{readinessDetail}</div>
          {inspectionCompletionSummary.issueItemsNeedingMaterialsCount > 0 ? (
            <div className="mt-2 text-sm">
              {inspectionCompletionSummary.issueItemsNeedingMaterialsCount} issue item
              {inspectionCompletionSummary.issueItemsNeedingMaterialsCount === 1 ? '' : 's'} still need materials.
            </div>
          ) : null}
          {inspectionCompletionSummary.alwaysReplacePendingCount > 0 ? (
            <div className="mt-1 text-sm">
              {inspectionCompletionSummary.alwaysReplacePendingCount} standard replacement
              {inspectionCompletionSummary.alwaysReplacePendingCount === 1 ? '' : 's'} still need to be saved into materials.
            </div>
          ) : null}
          {hasReportReadinessGaps ? (
            <div className="mt-2 rounded-2xl border border-amber-300 bg-white/80 px-3 py-2 text-sm font-medium text-amber-950">
              Finish materials, then generate the report.
            </div>
          ) : (
            <div className="mt-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-900">
              Generate the report when you are ready.
            </div>
          )}
        </div>

        {renderNeedsMaterialsList({
          tone: 'amber',
          title: 'Needs Materials',
          emptyMessage: 'All materials assigned. Generate the report when you are ready.',
          dataTestId: 'focused-needs-materials-complete',
        })}
      </div>
    );
  };

  const buildPostSaveContinuityHint = (
    nextSections: GeneratedInspectionSection[],
    options: {
      roomId: string | null;
      currentItemLabel: string;
      saveKind: 'issue' | 'material' | 'always_replace' | 'note' | 'photo';
    }
  ): { roomId: string | null; itemId: string | null; hint: FocusedContinuityHint | null } => {
    const activeRoomId = options.roomId || getRoomList(nextSections)[0]?.id || null;
    if (!activeRoomId) {
      return { roomId: null, itemId: null, hint: null };
    }

    const currentRoomItems = getRoomItemsFromSections(nextSections, activeRoomId);
    const nextItemInRoom = currentRoomItems.find((entry) => itemNeedsFollowThrough(entry)) || null;
    if (nextItemInRoom) {
      return {
        roomId: activeRoomId,
        itemId: nextItemInRoom.id,
        hint: {
          tone: 'next',
          title: `${options.currentItemLabel} saved. Next item is ready.`,
          detail: `Continue in ${activeRoomId} with ${nextItemInRoom.label}.`,
          primaryAction: {
            label: 'Go to next item',
            type: 'focus_room',
            roomId: activeRoomId,
            itemId: nextItemInRoom.id,
          },
          secondaryAction: actionableMaterialsCount > 0 ? { label: 'View Materials', type: 'materials' } : null,
        },
      };
    }

    const roomList = getRoomList(nextSections);
    const currentRoomIndex = roomList.findIndex((room) => room.id === activeRoomId);
    const nextRoom =
      currentRoomIndex >= 0 && currentRoomIndex < roomList.length - 1
        ? roomList[currentRoomIndex + 1]
        : null;
    if (nextRoom) {
      return {
        roomId: activeRoomId,
        itemId: null,
        hint: {
          tone: 'next',
          title: `${activeRoomId} is complete.`,
          detail: `Continue in the next room with Next Room when you are ready: ${nextRoom.label}.`,
          primaryAction: actionableMaterialsCount > 0 ? { label: 'View Materials', type: 'materials' } : { label: 'Review Summary', type: 'summary' },
          secondaryAction: null,
        },
      };
    }

    return {
      roomId: activeRoomId,
      itemId: null,
      hint: {
        tone: 'saved',
        title: `${activeRoomId} is complete.`,
        detail:
          actionableMaterialsCount > 0
            ? 'There is no next room. Review materials or summary, or use Previous Room to revisit an earlier room when needed.'
            : 'There is no next room. Review summary, or use Previous Room to revisit an earlier room when needed.',
        primaryAction: actionableMaterialsCount > 0 ? { label: 'View Materials', type: 'materials' } : { label: 'Review Summary', type: 'summary' },
        secondaryAction: actionableMaterialsCount > 0 ? { label: 'Review Summary', type: 'summary' } : null,
      },
    };
  };

  const skeleton = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Preparing inspection. Focused Mode is loading the unit, rooms, and checklist now.
      </div>
      <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-44 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-44 animate-pulse rounded-3xl bg-slate-200" />
      </div>
      <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
    </div>
  );

  const renderUnitSelection = () => (
    <section data-testid="focused-unit-select-screen" className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Focused Inspection</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {intent === 'materials' ? 'Choose a unit to review materials.' : 'Choose a unit to start inspection.'}
          </h2>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          {templateRecoveryState ? (
            <div data-testid="focused-template-recovery" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
              <div className="font-semibold">{templateRecoveryState.title}</div>
              <div className="mt-2">{templateRecoveryState.detail}</div>
              {templateRecoveryState.suggestion ? <div className="mt-2 text-amber-900/90">{templateRecoveryState.suggestion}</div> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {templateRecoveryState.canOpenUnitWorkspace && templateRecoveryState.unitId ? (
                  <button
                    data-testid="focused-template-recovery-unit-details"
                    type="button"
                    onClick={() => onOpenUnitWorkspace?.(templateRecoveryState.unitId as string)}
                    className="rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900"
                  >
                    Open Unit Details
                  </button>
                ) : null}
                {templateRecoveryState.canOpenTemplateSetup ? (
                  <button
                    data-testid="focused-template-recovery-template-setup"
                    type="button"
                    onClick={() => onOpenTemplateSetup?.()}
                    className="rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900"
                  >
                    Open Template Setup
                  </button>
                ) : null}
                <button
                  data-testid="focused-template-recovery-choose-another"
                  type="button"
                  onClick={() => {
                    setTemplateRecoveryState(null);
                    setErrorMessage(null);
                  }}
                  className="rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900"
                >
                  Choose Another Unit
                </button>
              </div>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</div>
          ) : null}
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Search units</span>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                data-testid="focused-unit-search"
                value={unitSearch}
                onChange={(event) => setUnitSearch(event.target.value)}
                placeholder="Search by unit, code, or address"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-lowes-blue"
              />
            </div>
          </label>

          <div className="space-y-3">
            {filteredUnits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                No units matched the current search. Add a new unit on the right to continue.
              </div>
            ) : (
              filteredUnits.map((unit) => {
                const launchState = intent === 'inspection' ? resolveInspectionLaunchState(unit) : null;
                const isContextUnit = initialUnitId === unit.id;
                return (
                  <div
                    key={unit.id}
                    data-testid={`focused-unit-option-${unit.id}`}
                    className={`rounded-2xl border px-4 py-4 transition ${
                      isContextUnit
                        ? 'border-lowes-blue bg-blue-50/40'
                        : 'border-slate-200 bg-slate-50 hover:border-lowes-blue hover:bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">{unit.name}</div>
                          {isContextUnit ? (
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-900">
                              Current unit
                            </span>
                          ) : null}
                          {launchState ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                launchState.kind === 'resume'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : launchState.kind === 'completed'
                                    ? 'bg-slate-200 text-slate-700'
                                    : 'bg-blue-100 text-blue-900'
                              }`}
                            >
                              {launchState.kind === 'resume'
                                ? 'Resume ready'
                                : launchState.kind === 'completed'
                                  ? 'Completed'
                                  : 'Ready to start'}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-sm text-slate-500">
                          {[unit.unitCode, unit.address1, unit.city, unit.state].filter(Boolean).join(' • ') || 'No additional unit details yet'}
                        </div>
                        {launchState ? <div className="text-sm text-slate-600">{launchState.helper}</div> : null}
                        {pendingUnitActionId === unit.id ? (
                          <div className="text-sm font-medium text-lowes-blue">Opening templates...</div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {launchState?.showReviewAction ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (pendingUnitActionId) return;
                              setPendingUnitActionId(unit.id);
                              void loadInspectionContext(launchState.inspection.id, 'inspection', launchState.inspection).finally(() => {
                                setPendingUnitActionId(null);
                              });
                            }}
                            disabled={pendingUnitActionId === unit.id}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                          >
                            {pendingUnitActionId === unit.id ? 'Opening...' : 'Review Last Inspection'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          data-testid={`focused-unit-action-${unit.id}`}
                          onClick={() => {
                            if (pendingUnitActionId) return;
                            setPendingUnitActionId(unit.id);
                            void (intent === 'inspection'
                              ? launchInspectionForUnit(unit, launchState || undefined)
                              : handleSelectUnit(unit.id, intent)
                            ).finally(() => {
                              setPendingUnitActionId(null);
                            });
                          }}
                          disabled={pendingUnitActionId === unit.id}
                          className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-80"
                        >
                          {pendingUnitActionId === unit.id ? 'Opening...' : launchState?.primaryLabel || 'Use Unit'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Add new unit</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Create and continue</h3>
            <p className="mt-2 text-sm text-slate-600">Create a unit inline if it is not already in the portfolio. Duplicate checks run before anything is saved.</p>
          </div>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unit name</span>
            <input aria-label="Unit name" value={unitDraft.name} onChange={(event) => setUnitDraft((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue" placeholder="Unit 2B" />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unit code</span>
            <input aria-label="Unit code" value={unitDraft.unitCode} onChange={(event) => setUnitDraft((current) => ({ ...current, unitCode: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue" placeholder="2B" />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</span>
            <input aria-label="Address" value={unitDraft.address1} onChange={(event) => setUnitDraft((current) => ({ ...current, address1: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue" placeholder="100 Main St" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">City</span>
              <input aria-label="City" value={unitDraft.city} onChange={(event) => setUnitDraft((current) => ({ ...current, city: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue" />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">State</span>
              <input aria-label="State" value={unitDraft.state} onChange={(event) => setUnitDraft((current) => ({ ...current, state: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue" />
            </label>
          </div>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Budget threshold</span>
            <input aria-label="Budget threshold" type="number" min="0" value={unitDraft.budgetThreshold} onChange={(event) => setUnitDraft((current) => ({ ...current, budgetThreshold: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue" placeholder="Optional" />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Layout template</span>
            <select
              aria-label="Layout template"
              data-testid="focused-layout-template-select"
              value={unitDraft.layoutTemplateId}
              onPointerDown={() => setIsTemplateSelectOpening(true)}
              onFocus={() => setIsTemplateSelectOpening(true)}
              onBlur={() => setIsTemplateSelectOpening(false)}
              onChange={(event) => {
                setUnitDraft((current) => ({ ...current, layoutTemplateId: event.target.value }));
                setIsTemplateSelectOpening(false);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue"
            >
              <option value="">Select layout template</option>
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs text-slate-500">
              {isTemplateSelectOpening ? 'Opening templates...' : 'This determines the rooms that will appear when inspection starts.'}
            </span>
          </label>

          {layouts.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No active layout templates are available yet. Add or reactivate a layout template in Full Mode before creating a new focused unit.
            </div>
          ) : null}

          <button
            data-testid="focused-create-unit"
            type="button"
            onClick={() => void handleAttemptCreateUnit()}
            disabled={layouts.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={16} />
            Add New Unit
          </button>
        </div>
      </div>
    </section>
  );

  const renderInspectionStep = () => (
    <section data-testid="focused-inspection-screen" className="mx-auto max-w-7xl space-y-4 md:space-y-5">
      <div className="hidden flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm md:flex">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <Home size={14} />
            {selectedUnit?.name || 'Focused inspection'}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{inspection?.title || 'Focused Inspection'}</h2>
          <div className="flex flex-wrap gap-2">
            {inspection?.templateSnapshot?.turnoverPresetLabel ? (
              <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Preset: {inspection.templateSnapshot.turnoverPresetLabel}
              </div>
            ) : null}
            {inspection?.templateSnapshot?.appliedScopedOverrideIds?.length ? (
              <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                Overrides: {inspection.templateSnapshot.appliedScopedOverrideIds.length}
              </div>
            ) : null}
            <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              {roomGroups.length} room{roomGroups.length === 1 ? '' : 's'}
            </div>
          </div>
          <p className="max-w-3xl text-sm text-slate-600">Work room by room, mark items Good, Repair, or Replace, and add details only when an issue needs follow-through.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="focused-review-summary" type="button" onClick={() => goToStep('summary')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Review Summary
          </button>
          <button data-testid="focused-view-materials-primary" type="button" onClick={() => goToStep('materials')} className="rounded-2xl bg-lowes-blue px-4 py-2 text-sm font-semibold text-white">
            View Materials
          </button>
        </div>
      </div>

      {!isOnline ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <WifiOff size={16} />
          Offline — saved locally
        </div>
      ) : null}

      {resumeBanner ? (
        <div
          data-testid="focused-resume-banner"
          className={`hidden rounded-2xl px-4 py-3 text-sm md:block ${
            resumeBanner.tone === 'amber'
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : resumeBanner.tone === 'rose'
                ? 'border border-rose-200 bg-rose-50 text-rose-900'
                : 'border border-blue-200 bg-blue-50 text-blue-900'
          }`}
        >
          <div className="font-semibold">{resumeBanner.title}</div>
          <div className="mt-1">{resumeBanner.detail}</div>
        </div>
      ) : null}
      {globalMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{globalMessage}</div> : null}
      {continuityHint ? (
        <div
          data-testid="focused-continuity-hint"
          className={`hidden rounded-2xl px-4 py-3 text-sm md:block ${
            continuityHint.tone === 'next'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : continuityHint.tone === 'warning'
                ? 'border border-amber-200 bg-amber-50 text-amber-900'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{continuityHint.title}</div>
              <div className="mt-1">{continuityHint.detail}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {continuityHint.secondaryAction ? (
                <button
                  type="button"
                  onClick={() => handleContinuityAction(continuityHint.secondaryAction)}
                  className="rounded-xl border border-current/20 bg-white px-3 py-1.5 text-xs font-medium text-slate-900"
                >
                  {continuityHint.secondaryAction.label}
                </button>
              ) : null}
              {continuityHint.primaryAction ? (
                <button
                  type="button"
                  onClick={() => handleContinuityAction(continuityHint.primaryAction)}
                  className="rounded-xl border border-current/20 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
                >
                  {continuityHint.primaryAction.label}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {renderInspectionCompletionCard()}
      {renderFinalizationLockBanner()}
      {step === 'inspection' ? renderSubmissionStatusCard() : null}
      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div>{errorMessage}</div>
            <button type="button" onClick={() => inspection && void loadInspectionContext(inspection.id, 'inspection')} className="mt-2 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700">
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden space-y-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm lg:block">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Rooms</div>
          </div>
          {roomGroups.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => {
                setContinuityHint(null);
                setSelectedRoomId(room.id);
                setFocusedItemId(null);
              }}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                selectedRoomId === room.id
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{room.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{room.itemCount} checklist items</div>
                </div>
                {selectedRoomId === room.id ? (
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Current</span>
                ) : null}
              </div>
            </button>
          ))}
        </aside>

        <div className="space-y-3 md:space-y-4">
          <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm md:block md:rounded-[28px] md:px-5 md:py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:text-xs md:tracking-[0.22em]">Current room</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 md:text-xl">
                  {roomGroups.find((room) => room.id === selectedRoomId)?.label || 'Unit overview'}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold md:gap-2 md:text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  {currentRoomItems.length} item{currentRoomItems.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                  {currentRoomSummary.followThroughCount} decision{currentRoomSummary.followThroughCount === 1 ? '' : 's'} left
                </span>
                {currentRoomSummary.alwaysReplaceCount > 0 ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
                    {currentRoomSummary.alwaysReplaceCount} always replace
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {currentRoomItems.map((item) => {
            const section = currentRoomSections.find((entry) => entry.items.some((listItem) => listItem.id === item.id));
            if (!section) return null;
            const isAlwaysReplace = isAlwaysReplaceChecklistItem(item);
            const isAlwaysReplaceCount = isAlwaysReplace && item.inputMode === 'count';
            const alwaysReplaceQuantity = getAlwaysReplaceCountQuantity(item);
            const isGood = isGoodFocusedAction(item.focusedAction);
            const isIssueAction = isIssueFocusedAction(item.focusedAction);
            const linkedRequirement = (item.materialRequirementIds || []).map((id) => materialMap.get(id)).find(Boolean) || null;
            const currentSelection = productSelections[item.id];
            const recommended = ProductRecommendationService.recommendProducts(catalogItems, {
              sourceType: 'finding',
              label: item.label,
              notes: noteDrafts[item.id] || item.notes,
              roomLabel: item.roomLabel || selectedRoomId || undefined,
              kind: isIssueAction ? item.focusedAction : undefined,
            });
            const productChoices = recommended.suggestedProducts.length > 0
              ? recommended.suggestedProducts.map((entry) => entry.item).filter(hasSelectableCatalogOption)
              : catalogItems.filter(hasSelectableCatalogOption).slice(0, 12);
            const rowSaveCopy =
              saveState.itemId === item.id
                ? saveState.phase === 'saving'
                  ? saveState.message || 'Saving…'
                  : saveState.phase === 'saved'
                    ? saveState.message || 'Saved locally'
                    : saveState.phase === 'failed'
                      ? saveState.message || 'Retry'
                      : null
                : null;
            const checklistGuidance = buildChecklistGuidance(item);
            const isRowActive = focusedItemId === item.id;
            const isMaterialEditorOpen = Boolean(expandedMaterialEditors[item.id]);
            const isRowHandled = isAlwaysReplace ? hasAlwaysReplaceInputCaptured(item) : Boolean(item.focusedAction);
            const isRowComplete = isAlwaysReplace
              ? hasLinkedAlwaysReplaceRecords(item)
              : isGood || Boolean(isIssueAction && (item.materialRequirementIds?.length || 0) > 0);
            const isRowEngaged =
              isIssueAction || Boolean(expandedNotes[item.id]) || (isAlwaysReplace && hasAlwaysReplaceInputCaptured(item));
            const hasSecondaryRowState =
              item.photoIds.length > 0 ||
              Boolean(noteDrafts[item.id]?.trim()) ||
              Boolean(linkedRequirement?.selectedMatch) ||
              isAlwaysReplace ||
              !isOnline;
            const editingLocked = isInspectionFinalized;
            const rowFrameClass = isRowActive
              ? 'border-lowes-blue bg-blue-50/70'
              : isRowComplete
                ? 'border-emerald-200 bg-emerald-50/40'
                : isRowHandled
                  ? 'border-blue-200 bg-white'
                  : 'border-slate-200 bg-white';
            const rowStateLabel = isAlwaysReplace
              ? isRowComplete
                ? 'Replace saved'
                : hasAlwaysReplaceInputCaptured(item)
                  ? 'Replace ready'
                  : 'Replace standard'
              : isGood
                ? 'Good'
                : item.focusedAction
                  ? `${titleCase(item.focusedAction)} selected`
                : null;
            const rowStateClass = isRowComplete
              ? 'bg-emerald-100 text-emerald-800'
              : isAlwaysReplace
                ? 'bg-violet-100 text-violet-800'
                : isGood
                  ? 'bg-emerald-100 text-emerald-800'
                : item.focusedAction === 'repair'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-900';

            return (
              <div
                key={item.id}
                data-testid={`focused-item-${item.id}`}
                ref={(node) => {
                  itemRefs.current[item.id] = node;
                }}
                className={`rounded-2xl border p-3 shadow-sm transition md:rounded-[28px] md:p-5 ${rowFrameClass}`}
              >
                <div className="flex items-center justify-between gap-2 md:items-start md:gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5 md:space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 text-base font-semibold leading-snug text-slate-900 md:text-lg">{item.label}</div>
                      {rowStateLabel ? (
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rowStateClass}`}>
                          {rowStateLabel}
                        </span>
                      ) : null}
                      {rowSaveCopy ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{rowSaveCopy}</span>
                      ) : null}
                    </div>
                    {isRowEngaged && hasSecondaryRowState ? (
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        {item.photoIds.length > 0 ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{item.photoIds.length} photo{item.photoIds.length === 1 ? '' : 's'}</span> : null}
                        {noteDrafts[item.id]?.trim() ? <span className="rounded-full bg-slate-100 px-2.5 py-1">Note saved</span> : null}
                        {linkedRequirement?.selectedMatch ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">{linkedRequirement.selectedMatch.optionName}</span>
                        ) : null}
                        {isAlwaysReplace ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">
                            {isAlwaysReplaceCount
                              ? `${alwaysReplaceQuantity} ${item.materialReference?.unit || 'ea'}`
                              : ChecklistAlwaysReplaceService.describeInput(item)}
                          </span>
                        ) : null}
                        {!isOnline ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">Offline-safe</span> : null}
                      </div>
                    ) : null}
                    {isRowEngaged && checklistGuidance ? <div className="hidden text-sm text-slate-600 md:block">{checklistGuidance}</div> : null}
                  </div>

                  {!isAlwaysReplace ? (
                    <div className="flex shrink-0 gap-1.5 md:flex-wrap md:gap-2">
                      {(['good', 'repair', 'replace'] as FocusedItemAction[]).map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => void handleActionChange(section, item, action)}
                          disabled={editingLocked}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold transition md:rounded-2xl md:px-4 ${
                            item.focusedAction === action
                              ? action === 'good'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : action === 'repair'
                                ? 'bg-blue-700 text-white shadow-sm'
                                : 'bg-amber-600 text-white shadow-sm'
                              : item.focusedAction
                                ? 'border border-slate-200 bg-white/70 text-slate-500'
                                : 'border border-slate-200 bg-white text-slate-700'
                          } ${editingLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          {action === 'good' ? 'Good' : titleCase(action)}
                        </button>
                      ))}
                    </div>
                  ) : isAlwaysReplaceCount ? (
                    <div
                      className={`flex shrink-0 items-center rounded-2xl border border-violet-200 bg-white text-slate-900 shadow-sm ${
                        editingLocked ? 'opacity-60' : ''
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`Decrease ${item.label} quantity`}
                        onClick={() => void persistAlwaysReplaceQuantity(section, item, alwaysReplaceQuantity - 1)}
                        disabled={editingLocked || alwaysReplaceQuantity <= 1 || saveState.itemId === item.id}
                        className="flex h-11 w-11 items-center justify-center rounded-l-2xl text-lg font-bold text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        -
                      </button>
                      <input
                        aria-label={`${item.label} quantity`}
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={alwaysReplaceQuantity}
                        disabled={editingLocked || saveState.itemId === item.id}
                        onFocus={() => setFocusedItemId(item.id)}
                        onChange={(event) => {
                          const nextQuantity = Math.max(1, Math.round(Number(event.target.value || 1)) || 1);
                          setGeneratedSections((current) =>
                            current.map((entry) =>
                              entry.id !== section.id
                                ? entry
                                : {
                                    ...entry,
                                    items: entry.items.map((listItem) =>
                                      listItem.id !== item.id
                                        ? listItem
                                        : {
                                            ...listItem,
                                            status: 'completed',
                                            inputValue: {
                                              ...(listItem.inputValue || {}),
                                              quantity: nextQuantity,
                                              updatedAt: Date.now(),
                                            },
                                          }
                                    ),
                                  }
                            )
                          );
                        }}
                        onBlur={(event) => void persistAlwaysReplaceQuantity(section, item, Number(event.target.value || 1))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        className="h-11 w-16 border-x border-violet-100 bg-white text-center text-base font-bold outline-none focus:bg-violet-50"
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${item.label} quantity`}
                        onClick={() => void persistAlwaysReplaceQuantity(section, item, alwaysReplaceQuantity + 1)}
                        disabled={editingLocked || saveState.itemId === item.id}
                        className="flex h-11 w-11 items-center justify-center rounded-r-2xl text-lg font-bold text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFocusedItemId((current) => (current === item.id ? null : item.id));
                        setExpandedMaterialEditors((current) => ({ ...current, [item.id]: !current[item.id] }));
                      }}
                      disabled={editingLocked}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition md:rounded-2xl md:px-4 ${
                        isRowActive ? 'bg-violet-700 text-white shadow-sm' : 'border border-violet-200 bg-violet-50 text-violet-800'
                      } ${editingLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      Details
                    </button>
                  )}
                </div>

                {(isIssueAction || (isAlwaysReplace && isRowEngaged)) && !editingLocked ? (
                  <div className="mt-3 flex flex-wrap gap-2 md:mt-4 md:gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 md:rounded-2xl">
                      <Camera size={14} />
                      + Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void handlePhotoCapture(section, item, file);
                          }
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setExpandedNotes((current) => ({ ...current, [item.id]: !current[item.id] }))}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 md:rounded-2xl"
                    >
                      <StickyNote size={14} />
                      + Note
                    </button>
                    {((isAlwaysReplace && !isAlwaysReplaceCount) || isIssueAction) && !isRowComplete ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFocusedItemId(item.id);
                          setExpandedMaterialEditors((current) => ({ ...current, [item.id]: !current[item.id] }));
                        }}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium md:rounded-2xl ${
                          isMaterialEditorOpen
                            ? 'border-lowes-blue bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {isAlwaysReplace ? 'Details' : 'Materials'}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {expandedNotes[item.id] ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <textarea
                      rows={3}
                      value={noteDrafts[item.id] || ''}
                      disabled={editingLocked}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-lowes-blue"
                      placeholder="Add a quick note for this issue"
                    />
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={() => void handleNoteSave(section, item)} disabled={editingLocked} className={`inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white ${editingLocked ? 'cursor-not-allowed opacity-50' : ''}`}>
                        <Save size={14} />
                        Save Note
                      </button>
                    </div>
                  </div>
                ) : noteDrafts[item.id]?.trim() ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{noteDrafts[item.id]}</div>
                ) : null}

                {isAlwaysReplace && !isAlwaysReplaceCount && isRowActive && isMaterialEditorOpen && !editingLocked ? (
                  <div className="mt-4 rounded-[24px] border border-violet-200 bg-violet-50 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      {item.inputMode === 'count' ? (
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</span>
                          <div className="relative">
                            <Hash size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="number"
                              min="1"
                              value={item.inputValue?.quantity ?? item.defaultQuantity ?? 1}
                              onChange={(event) =>
                                setGeneratedSections((current) =>
                                  current.map((entry) =>
                                    entry.id !== section.id
                                      ? entry
                                      : {
                                          ...entry,
                                          items: entry.items.map((listItem) =>
                                            listItem.id !== item.id
                                              ? listItem
                                              : {
                                                  ...listItem,
                                                  inputValue: {
                                                    ...(listItem.inputValue || {}),
                                                    quantity: Math.max(1, Number(event.target.value || 0)) || undefined,
                                                    updatedAt: Date.now(),
                                                  },
                                                }
                                          ),
                                        }
                                  )
                                )
                              }
                              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-lowes-blue"
                            />
                          </div>
                        </label>
                      ) : item.inputMode === 'dimensions' ? (
                        <>
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Width</span>
                            <div className="relative">
                              <Ruler size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={item.inputValue?.dimensions?.width ?? ''}
                                onChange={(event) =>
                                  setGeneratedSections((current) =>
                                    current.map((entry) =>
                                      entry.id !== section.id
                                        ? entry
                                        : {
                                            ...entry,
                                            items: entry.items.map((listItem) =>
                                              listItem.id !== item.id
                                                ? listItem
                                                : {
                                                    ...listItem,
                                                    inputValue: {
                                                      ...(listItem.inputValue || {}),
                                                      dimensions: {
                                                        width: Number(event.target.value || 0),
                                                        height: listItem.inputValue?.dimensions?.height || 0,
                                                        unit: listItem.inputValue?.dimensions?.unit || 'in',
                                                      },
                                                      updatedAt: Date.now(),
                                                    },
                                                  }
                                            ),
                                          }
                                    )
                                  )
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-lowes-blue"
                              />
                            </div>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Height</span>
                            <div className="relative">
                              <Ruler size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={item.inputValue?.dimensions?.height ?? ''}
                                onChange={(event) =>
                                  setGeneratedSections((current) =>
                                    current.map((entry) =>
                                      entry.id !== section.id
                                        ? entry
                                        : {
                                            ...entry,
                                            items: entry.items.map((listItem) =>
                                              listItem.id !== item.id
                                                ? listItem
                                                : {
                                                    ...listItem,
                                                    inputValue: {
                                                      ...(listItem.inputValue || {}),
                                                      dimensions: {
                                                        width: listItem.inputValue?.dimensions?.width || 0,
                                                        height: Number(event.target.value || 0),
                                                        unit: listItem.inputValue?.dimensions?.unit || 'in',
                                                      },
                                                      updatedAt: Date.now(),
                                                    },
                                                  }
                                            ),
                                          }
                                    )
                                  )
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-lowes-blue"
                              />
                            </div>
                          </label>
                        </>
                      ) : (
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Area</span>
                          <div className="relative">
                            <Ruler size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={item.inputValue?.area ?? ''}
                              onChange={(event) =>
                                setGeneratedSections((current) =>
                                  current.map((entry) =>
                                    entry.id !== section.id
                                      ? entry
                                      : {
                                          ...entry,
                                          items: entry.items.map((listItem) =>
                                            listItem.id !== item.id
                                              ? listItem
                                              : {
                                                  ...listItem,
                                                  inputValue: {
                                                    ...(listItem.inputValue || {}),
                                                    area: Number(event.target.value || 0) || undefined,
                                                    updatedAt: Date.now(),
                                                  },
                                                }
                                          ),
                                        }
                                  )
                                )
                              }
                              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-lowes-blue"
                            />
                          </div>
                        </label>
                      )}

                      <div className="flex items-end">
                        <button type="button" onClick={() => void handleAddMaterial(section, item)} className="w-full rounded-2xl bg-lowes-blue px-4 py-3 text-sm font-semibold text-white">
                          {linkedRequirement ? 'Update Standard' : 'Save Standard'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-slate-600">
                      {(item.materialRequirementIds?.length || 0) > 0
                        ? 'This turnover standard now has a linked repair task and material requirement.'
                        : 'Save this standard to create the downstream repair task and material requirement without creating a finding.'}
                    </div>
                  </div>
                ) : isIssueAction && isRowActive && isMaterialEditorOpen && !editingLocked ? (
                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px_auto]">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Product</span>
                        <select
                          data-testid={`focused-product-select-${item.id}`}
                          value={currentSelection?.catalogItemId || ''}
                          onChange={(event) =>
                            setProductSelections((current) => ({
                              ...current,
                              [item.id]: {
                                catalogItemId: event.target.value,
                                quantity: current[item.id]?.quantity || String(linkedRequirement?.quantity || 1),
                              },
                            }))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-lowes-blue"
                        >
                          <option value="">Select product</option>
                          {productChoices.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                              {typeof getSelectableCatalogOption(product)?.price === 'number'
                                ? ` • $${getSelectableCatalogOption(product)!.price.toFixed(2)}`
                                : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Qty</span>
                        <input
                          type="number"
                          min="1"
                          value={currentSelection?.quantity || linkedRequirement?.quantity || 1}
                          onChange={(event) =>
                            setProductSelections((current) => ({
                              ...current,
                              [item.id]: {
                                catalogItemId: current[item.id]?.catalogItemId || linkedRequirement?.selectedMatch?.catalogItemId || '',
                                quantity: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-lowes-blue"
                        />
                      </label>

                      <div className="flex items-end">
                        <button data-testid={`focused-add-material-${item.id}`} type="button" onClick={() => void handleAddMaterial(section, item)} className="w-full rounded-2xl bg-lowes-blue px-4 py-3 text-sm font-semibold text-white">
                          {linkedRequirement ? 'Update Materials' : 'Add to Materials'}
                        </button>
                      </div>
                    </div>

                    {linkedRequirement?.selectedMatch ? (
                      <div className="mt-3 text-sm text-slate-600">
                        Materials list now includes <span className="font-semibold text-slate-900">{linkedRequirement.selectedMatch.optionName}</span> for this issue.
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-slate-500">Choose a product to create or update the matching material requirement automatically.</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-1 z-10 space-y-2 md:bottom-4 md:space-y-3">
        <div
          data-testid="focused-room-navigation"
          className="rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur md:rounded-[24px] md:p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => navigateRoom(previousRoom?.id || null)}
              disabled={!previousRoom}
              className="inline-flex min-h-10 min-w-[124px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 md:rounded-2xl"
            >
              Previous Room
            </button>
            <div className="min-w-0 px-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:text-[11px]">
                Room Navigation
              </div>
              <div className="truncate text-sm font-semibold text-slate-900 md:text-base">
                {roomGroups.find((room) => room.id === selectedRoomId)?.label || 'Inspection'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateRoom(nextRoom?.id || null)}
              disabled={!nextRoom}
              className="inline-flex min-h-10 min-w-[124px] items-center justify-center rounded-xl border border-slate-200 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 md:rounded-2xl"
            >
              Next Room
            </button>
          </div>
        </div>

        <div data-testid="focused-materials-footer" className="rounded-xl border border-slate-200 bg-slate-950 text-white shadow-xl md:rounded-[24px]">
          <button
            type="button"
            onClick={() => setIsMaterialsFooterExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left md:hidden"
            aria-expanded={isMaterialsFooterExpanded}
          >
            <span className="truncate text-xs font-semibold">{materialCount} item{materialCount === 1 ? '' : 's'} • ${estimatedTotal.toFixed(2)}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              {isMaterialsFooterExpanded ? 'Less' : 'More'}
            </span>
          </button>
          <div className={`${isMaterialsFooterExpanded ? 'flex' : 'hidden'} flex-wrap items-center justify-between gap-2 px-3 pb-3 md:flex md:gap-3 md:px-5 md:py-4`}>
            <div className="space-y-1">
              <div className="hidden text-sm font-semibold md:block">{materialCount} material item{materialCount === 1 ? '' : 's'} • ${estimatedTotal.toFixed(2)}</div>
              <div data-testid="focused-save-heartbeat" className="text-xs text-slate-300">{focusedHeartbeat.label}</div>
              <div className="text-[11px] text-slate-400">{focusedHeartbeat.detail}</div>
            </div>
            <button data-testid="focused-view-materials-footer" type="button" onClick={() => goToStep('materials')} className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 md:rounded-2xl md:px-4 md:py-2 md:text-sm">
              View Materials
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  const renderSubmissionStatusCard = () =>
    submissionState ? (
      <div
        data-testid="focused-submission-status"
        className={`rounded-[28px] border px-5 py-4 shadow-sm ${
          submissionState.outcome === 'submitted'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : submissionState.outcome === 'queued'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] opacity-80">
              {submissionState.outcome === 'submitted'
                ? 'Submitted successfully'
                : submissionState.outcome === 'queued'
                  ? 'Queued offline'
                  : 'Retry needed'}
            </div>
            <div className="mt-2 text-lg font-semibold">
              {submissionState.unitName} • {submissionState.itemCount} item{submissionState.itemCount === 1 ? '' : 's'} • $
              {submissionState.estimatedTotal.toFixed(2)}
            </div>
            <div className="mt-2 text-sm">{submissionState.detail}</div>
            <div className="mt-1 text-sm opacity-90">{submissionState.nextStep}</div>
            <div className="mt-3 text-sm font-medium">
              {submissionState.outcome === 'failed'
                ? 'Your work is still saved locally. Retry now or leave and return later.'
                : 'You are done here unless you want to act in Procurement immediately or start the next unit.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {submissionState.outcome === 'failed' ? (
              <button
                data-testid="focused-post-submit-retry"
                type="button"
                onClick={() => void handleSubmitMaterials()}
                className="rounded-2xl border border-current/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Retry Submit
              </button>
            ) : null}
            {submissionState.outcome === 'queued' && isOnline ? (
              <button
                data-testid="focused-post-submit-retry-queued"
                type="button"
                onClick={() => void handleSubmitMaterials()}
                className="rounded-2xl border border-current/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Retry Submit Now
              </button>
            ) : null}
            {submissionState.outcome === 'queued' && isOnline ? (
              <button
                data-testid="focused-post-submit-sync-now"
                type="button"
                onClick={() => void triggerSyncNow()}
                className="rounded-2xl border border-current/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Sync Now
              </button>
            ) : null}
            {submissionState.outcome !== 'failed' && onOpenProcurement ? (
              <button
                data-testid="focused-post-submit-procurement"
                type="button"
                onClick={() =>
                  onOpenProcurement({
                    unitId: selectedUnit?.id || null,
                    focus: 'procurement',
                    requirementId: submissionState.requirementIds[0] || null,
                    requirementIds: submissionState.requirementIds,
                    originLabel:
                      submissionState.outcome === 'queued'
                        ? `Opened from Focused Mode • Queued ${submissionState.itemCount} material item${submissionState.itemCount === 1 ? '' : 's'} for ${submissionState.unitName}`
                        : `Opened from Focused Mode • Submitted ${submissionState.itemCount} material item${submissionState.itemCount === 1 ? '' : 's'} for ${submissionState.unitName}`,
                    arrivalContext: {
                      source: 'focused_submission',
                      outcome: submissionState.outcome === 'queued' ? 'queued' : 'submitted',
                      unitName: submissionState.unitName,
                      itemCount: submissionState.itemCount,
                      estimatedTotal: submissionState.estimatedTotal,
                      nextStep: submissionState.nextStep,
                    },
                  })
                }
                className="rounded-2xl border border-current/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Continue in Procurement
              </button>
            ) : null}
            <button
              data-testid="focused-post-submit-start-another"
              type="button"
              onClick={() => resetToUnitSelection('Start the next inspection when you are ready.')}
              className="rounded-2xl border border-current/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Start Another Inspection
            </button>
            <button
              data-testid="focused-post-submit-unit-list"
              type="button"
              onClick={() => resetToUnitSelection('Choose another unit, or leave Focused Mode when you are done for now.')}
              className="rounded-2xl border border-current/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Return to Unit List
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const renderSummaryStep = () => (
    <section data-testid="focused-summary-screen" className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Inspection Summary</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{selectedUnit?.name || 'Unit summary'}</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => goToStep('inspection')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Back to Inspection
          </button>
          <button type="button" onClick={() => goToStep('materials')} className="rounded-2xl bg-lowes-blue px-4 py-2 text-sm font-semibold text-white">
            View Materials
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Issues', String(issueCount)],
          ['Materials', String(materialCount)],
          ['Estimated total', `$${estimatedTotal.toFixed(2)}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-slate-500" />
          <h3 className="text-lg font-semibold text-slate-900">Room summaries</h3>
        </div>
        <div className="mt-4 space-y-4">
          {roomGroups.map((room) => {
            const roomItems = generatedSections.filter((section) => getRoomKey(section) === room.id).flatMap((section) => section.items);
            return (
              <div key={room.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">{room.label}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {
                          roomItems.filter(
                            (item) =>
                              isIssueFocusedAction(item.focusedAction) ||
                              (isAlwaysReplaceChecklistItem(item) &&
                                (((item.repairTaskIds?.length || 0) > 0) || ((item.materialRequirementIds?.length || 0) > 0)))
                          ).length
                        } issue actions
                      </div>
                    </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = findReviewTarget(room.id);
                      openReviewTarget(target.roomId, target.itemId);
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    Review Room
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {roomItems.filter((item) => isIssueFocusedAction(item.focusedAction) || isAlwaysReplaceChecklistItem(item)).length === 0 ? (
                    <div className="text-sm text-slate-500">No issue actions captured for this room.</div>
                  ) : (
                    roomItems
                      .filter(
                        (item) =>
                          isIssueFocusedAction(item.focusedAction) ||
                          (isAlwaysReplaceChecklistItem(item) &&
                            (((item.repairTaskIds?.length || 0) > 0) || ((item.materialRequirementIds?.length || 0) > 0)))
                      )
                      .map((item) => {
                        const requirement = (item.materialRequirementIds || []).map((id) => materialMap.get(id)).find(Boolean) || null;
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
                            <div>
                              <div className="font-medium text-slate-900">{item.label}</div>
                              <div className="mt-1 text-slate-500">
                                {isAlwaysReplaceChecklistItem(item)
                                  ? `${ChecklistAlwaysReplaceService.describeInput(item)} • ${requirement?.itemDescription || 'Standard saved'}`
                                  : `${titleCase(item.focusedAction)} • ${requirement?.selectedMatch?.optionName || 'Product still needed'}`}
                              </div>
                            </div>
                            <button type="button" onClick={() => openReviewTarget(room.id, item.id)} className="text-sm font-medium text-lowes-blue">
                              Review
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">No-issue rooms</h3>
          <div className="mt-4 space-y-3">
            {noIssueRooms.length === 0 ? (
              <div className="text-sm text-slate-500">Every room has at least one issue action, note, or photo.</div>
            ) : (
              noIssueRooms.map((room) => (
                <div key={room.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="font-medium text-slate-800">{room.label}</div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = findReviewTarget(room.id);
                      openReviewTarget(target.roomId, target.itemId);
                    }}
                    className="text-sm font-medium text-lowes-blue"
                  >
                    Revisit
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-amber-900">Missing or incomplete</h3>
          <div className="mt-4 space-y-3">
            {incompleteItems.length === 0 ? (
              <div className="text-sm text-amber-900/80">Nothing is missing. This inspection is ready for materials review.</div>
            ) : (
              incompleteItems.map(({ roomId, item }) => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                  <div>
                    <div className="font-medium text-amber-950">{item.label}</div>
                    <div className="mt-1 text-sm text-amber-900/80">
                      {isAlwaysReplaceChecklistItem(item)
                        ? isAlwaysReplaceInputComplete(item)
                          ? 'Standard input is captured, but the downstream task and material still need to be saved.'
                          : 'This always-replace standard still needs its required quantity or measurement.'
                        : item.focusedAction
                          ? 'Action selected, but a product is still missing.'
                          : 'Notes or photos exist, but no Good, Repair, or Replace decision is selected yet.'}
                    </div>
                  </div>
                  <button type="button" onClick={() => openReviewTarget(roomId, item.id)} className="text-sm font-medium text-amber-900">
                    Fix
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const renderMaterialsStep = () => (
    <section data-testid="focused-materials-screen" className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Materials Review</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{selectedUnit?.name || 'Materials list'}</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => goToStep('summary')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Back to Summary
          </button>
          {!hasReportReadinessGaps ? (
            <button
              type="button"
              onClick={() => void openInspectionReport()}
              className="rounded-2xl bg-lowes-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Generate Report
            </button>
          ) : null}
        </div>
      </div>

      {resumeBanner ? (
        <div
          data-testid="focused-resume-banner"
          className={`rounded-2xl px-4 py-3 text-sm ${
            resumeBanner.tone === 'amber'
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : resumeBanner.tone === 'rose'
                ? 'border border-rose-200 bg-rose-50 text-rose-900'
                : 'border border-blue-200 bg-blue-50 text-blue-900'
          }`}
        >
          <div className="font-semibold">{resumeBanner.title}</div>
          <div className="mt-1">{resumeBanner.detail}</div>
        </div>
      ) : null}
      {globalMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{globalMessage}</div> : null}
      <div
        data-testid="focused-sync-status"
        className={`rounded-2xl border px-4 py-3 text-sm ${
          focusedHeartbeat.tone === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : focusedHeartbeat.tone === 'offline'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : focusedHeartbeat.tone === 'info'
                ? 'border-blue-200 bg-blue-50 text-blue-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        <div className="font-semibold">{focusedHeartbeat.label}</div>
        <div className="mt-1">{focusedHeartbeat.detail}</div>
      </div>
      {renderSubmissionStatusCard()}
      {submitBlockMessage ? (
        <div
          data-testid="focused-submit-block-message"
          className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm"
        >
          <div className="text-sm font-semibold">Materials are not ready to submit yet.</div>
          <div className="mt-1 text-sm">{submitBlockMessage}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goToStep('summary')}
              className="rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
            >
              Review Missing Items
            </button>
            <button
              type="button"
              onClick={() => goToStep('inspection')}
              className="rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
            >
              Back to Inspection
            </button>
          </div>
        </div>
      ) : null}

      <div
        data-testid="focused-materials-readiness"
        className={`rounded-2xl border px-4 py-3 text-sm ${
          needsMaterialsItems.length > 0
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        <div className="font-semibold">
          {needsMaterialsItems.length > 0
            ? `${needsMaterialsItems.length} item${needsMaterialsItems.length === 1 ? '' : 's'} still need materials`
            : 'All materials assigned'}
        </div>
        <div className="mt-1">
          {needsMaterialsItems.length > 0
            ? 'Resolve the missing items below or jump back into the inspection on the exact row that still needs product selection.'
            : 'Every captured issue that needs materials now has a linked material entry. Generate the report when you are ready.'}
        </div>
      </div>

      {!hasReportReadinessGaps ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Next step</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">Generate Report</div>
              <div className="mt-1 text-sm text-slate-600">
                Materials are ready. Generate the report when you are ready to close out this inspection.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void openInspectionReport()}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Generate Report
            </button>
          </div>
        </div>
      ) : null}

      {renderNeedsMaterialsList({
        tone: 'slate',
        title: 'Needs Materials',
        emptyMessage: 'Nothing is waiting on materials. Generate the report when you are ready.',
        dataTestId: 'focused-needs-materials-list',
      })}

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          {activeMaterials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
              No materials have been built yet. Go back to inspection and choose products inline to create the materials list automatically.
            </div>
          ) : (
            activeMaterials.map((requirement) => (
              <div key={requirement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <div className="font-semibold text-slate-900">{requirement.itemDescription}</div>
                  <div className="mt-1 text-sm text-slate-500">{requirement.roomLabel || 'Unit Overview'} • {requirement.selectedMatch?.optionName || 'No product selected'}</div>
                  {requirement.notes ? <div className="mt-2 text-sm text-slate-500">{requirement.notes}</div> : null}
                </div>
                <div className="text-right text-sm text-slate-600">
                  <div>{requirement.quantity} {requirement.unit}</div>
                  <div className="mt-1 font-semibold text-slate-900">${((requirement.selectedMatch?.price || 0) * requirement.quantity).toFixed(2)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-slate-200 bg-slate-950 px-6 py-5 text-white shadow-sm">
        <div>
          <div className="text-sm font-semibold">{activeMaterials.length} items</div>
          <div className="mt-1 text-xs text-slate-300">Total estimated cost: ${estimatedTotal.toFixed(2)}</div>
          <div className="mt-1 text-xs text-slate-300">
            {hasReportReadinessGaps
              ? `${needsMaterialsItems.length} item${needsMaterialsItems.length === 1 ? '' : 's'} still need materials before the report is ready.`
              : 'Materials are ready. Generate the report when you are ready.'}
          </div>
          <div data-testid="focused-materials-heartbeat" className="mt-1 text-[11px] text-slate-400">{focusedHeartbeat.label}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasReportReadinessGaps ? (
            <button
              type="button"
              onClick={() => void openInspectionReport()}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              <PackageCheck size={16} />
              Generate Report
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );

  const focusedMobileTitle =
    step === 'inspection'
      ? roomGroups.find((room) => room.id === selectedRoomId)?.label || inspection?.title || 'Inspection'
      : step === 'summary'
        ? 'Summary'
        : step === 'materials'
          ? 'Materials'
          : 'Focused Inspection';
  const showDecisionProgress = step !== 'select' && decisionProgress.totalCount > 0;
  const contentTopSpacingClass = showDecisionProgress
    ? 'pt-[calc(6rem+env(safe-area-inset-top))]'
    : 'pt-[calc(4rem+env(safe-area-inset-top))]';

  return (
    <>
      <FocusedTopControlBar
        title={focusedMobileTitle}
        onSwitchFullMode={handleFullModeRequest}
        leftControl={
          <button
            type="button"
            onClick={handleExitRequest}
            className="inline-flex h-10 min-w-[72px] touch-manipulation select-none items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold leading-none text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
            aria-label="Exit Focused Mode"
          >
            <ArrowLeft size={16} className="pointer-events-none" />
            <span className="pointer-events-none">Back</span>
          </button>
        }
        secondaryMenuContent={(closeMenu) => (
          <>
            {step !== 'inspection' ? (
              <button
                type="button"
                onClick={() => {
                  goToStep('inspection');
                  closeMenu();
                }}
                className="w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-slate-50"
              >
                Back to Inspection
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                goToStep('summary');
                closeMenu();
              }}
              className="w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-slate-50"
            >
              Review Summary
            </button>
            <button
              type="button"
              onClick={() => {
                goToStep('materials');
                closeMenu();
              }}
              className="w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-slate-50"
            >
              View Materials
            </button>
            {step === 'inspection' && roomGroups.length > 0 ? (
              <>
                <div className="my-1 border-t border-slate-100" />
                {roomGroups.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      setContinuityHint(null);
                      setSelectedRoomId(room.id);
                      setFocusedItemId(null);
                      closeMenu();
                    }}
                    className={`w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50 ${
                      selectedRoomId === room.id ? 'font-semibold text-lowes-blue' : ''
                    }`}
                  >
                    {room.label}
                  </button>
                ))}
              </>
            ) : null}
          </>
        )}
      />
      {showDecisionProgress ? (
        <div className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-[70] border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
            <div className="text-[11px] font-semibold text-slate-600 sm:text-xs">
              {decisionProgress.inspectedCount} / {decisionProgress.totalCount} complete • {decisionProgress.decisionsLeft} left
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                data-testid="focused-decision-progress-bar"
                className="h-full rounded-full bg-lowes-blue transition-[width] duration-200 ease-out"
                style={{ width: `${decisionProgress.percentComplete}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <div className={`px-4 pb-6 sm:px-6 ${contentTopSpacingClass}`}>
        {isLoading ? skeleton : step === 'select' ? renderUnitSelection() : step === 'inspection' ? renderInspectionStep() : step === 'summary' ? renderSummaryStep() : renderMaterialsStep()}
      </div>
      {showExitDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-2xl font-semibold text-slate-900">Leave inspection?</h3>
            <p className="mt-2 text-sm text-slate-600">You have unsaved changes.</p>
            {exitDialogError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {exitDialogError}
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isExitSaving) return;
                  setShowExitDialog(false);
                  setExitDialogError(null);
                }}
                disabled={isExitSaving}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardAndExit}
                disabled={isExitSaving}
                className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Discard & Exit
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAndExit()}
                disabled={isExitSaving}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExitSaving ? 'Saving...' : 'Save & Exit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showDuplicateModal && pendingCreateDraft ? (
        <div data-testid="focused-duplicate-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Possible duplicates</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-900">This unit looks familiar.</h3>
              <p className="mt-2 text-sm text-slate-600">Choose an existing unit or continue with the new one without losing what you already entered.</p>
            </div>
            <div className="mt-5 space-y-3">
              {duplicateMatches.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div>
                    <div className="font-semibold text-slate-900">{unit.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{[unit.unitCode, unit.address1, unit.city, unit.state].filter(Boolean).join(' • ') || 'No additional details'}</div>
                  </div>
                  <button type="button" onClick={() => { setShowDuplicateModal(false); void handleSelectUnit(unit.id, 'inspection'); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                    Use Existing
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowDuplicateModal(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={() => { setShowDuplicateModal(false); if (pendingCreateDraft) { void handleCreateUnit(pendingCreateDraft); } }} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Continue New
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showBudgetModal && selectedUnit ? (
        <div data-testid="focused-budget-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Budget threshold</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">Estimated total exceeds the unit threshold.</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated total</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">${estimatedTotal.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Threshold</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">${Number(selectedUnit.budgetThreshold || 0).toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setShowBudgetModal(false); setGlobalMessage('Approval requested locally. Review materials or continue later before sending this unit forward.'); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Request Approval
              </button>
              <button type="button" onClick={() => setShowBudgetModal(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Review Materials
              </button>
              {canContinueAnyway ? (
                <button type="button" onClick={() => { setPendingSubmitOverride(true); setShowBudgetModal(false); void handleSubmitMaterials(); }} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  Continue Anyway
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
