import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  ClipboardList,
  Home,
  PackageCheck,
  Plus,
  Save,
  Search,
  StickyNote,
  WifiOff,
} from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { useSyncEngine } from '../core/hooks/useSyncEngine';
import { CatalogItem } from '../core/models/types';
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
import { RepairTaskService } from '../core/services/RepairTaskService';
import { ReportService } from '../core/services/ReportService';
import { UnitService } from '../core/services/UnitService';

type FocusedWorkflowIntent = 'inspection' | 'materials';
type FocusedStep = 'select' | 'inspection' | 'summary' | 'materials';
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

const inferTrade = (action: FocusedItemAction, label: string): RepairTask['trade'] => {
  const normalized = normalizeLabel(label);
  if (normalized.includes('paint')) return 'paint';
  if (normalized.includes('faucet') || normalized.includes('sink') || normalized.includes('toilet')) return 'plumbing';
  if (normalized.includes('outlet') || normalized.includes('switch') || normalized.includes('light')) return 'electrical';
  if (normalized.includes('floor')) return 'flooring';
  if (normalized.includes('clean')) return 'cleaning';
  return action === 'replace' ? 'general' : 'general';
};

const buildSelectedMatch = (catalogItem: CatalogItem): SelectedProcurementOption | null => {
  const option = catalogItem.options[0];
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
  const [generatedSections, setGeneratedSections] = useState<GeneratedInspectionSection[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<RepairTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [productSelections, setProductSelections] = useState<Record<string, { catalogItemId: string; quantity: string }>>({});
  const [unitSearch, setUnitSearch] = useState('');
  const [unitDraft, setUnitDraft] = useState<UnitDraft>(EMPTY_UNIT_DRAFT);
  const [duplicateMatches, setDuplicateMatches] = useState<Unit[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingCreateDraft, setPendingCreateDraft] = useState<UnitDraft | null>(null);
  const [saveState, setSaveState] = useState<FocusedSaveState>({ phase: 'idle' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<FocusedSubmissionState | null>(initialSubmissionState || null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [pendingSubmitOverride, setPendingSubmitOverride] = useState(false);
  const [showResumeHint, setShowResumeHint] = useState<boolean>(Boolean(initialInspectionId && initialStep && initialStep !== 'select'));
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loadUnitsAndCatalog = async () => {
    if (!org) return;
    const [loadedUnits, loadedCatalog, loadedLayouts] = await Promise.all([
      UnitService.listUnits(org.id),
      CatalogService.getItems(org.id),
      LayoutTemplateService.listActive(org.id),
    ]);
    setUnits(loadedUnits.filter((unit) => unit.status !== 'archived'));
    setCatalogItems(loadedCatalog);
    setLayouts(loadedLayouts);
  };

  const loadInspectionContext = async (inspectionId: string, nextStep?: FocusedStep, inspectionRecord?: Inspection | null) => {
    if (!org) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const inspections = inspectionRecord ? [] : await InspectionService.listInspections(org.id);
      const loadedInspection = inspectionRecord || inspections.find((entry) => entry.id === inspectionId) || null;
      if (!loadedInspection) {
        throw new Error('The selected inspection could not be found.');
      }
      const [loadedUnit, loadedFindings, loadedTasks, loadedMaterials] = await Promise.all([
        UnitService.getUnit(org.id, loadedInspection.unitId),
        FindingService.listFindings(org.id, { inspectionId }),
        RepairTaskService.listTasks(org.id, { inspectionId }),
        MaterialRequirementService.listRequirements(org.id, { inspectionId }),
      ]);

      setInspection(loadedInspection);
      setSelectedUnit(loadedUnit);
      setGeneratedSections(loadedInspection.generatedSections || []);
      setFindings(loadedFindings);
      setTasks(loadedTasks);
      setMaterials(loadedMaterials);
      const resolvedStep = nextStep || (intent === 'materials' ? 'materials' : 'inspection');
      setStep(resolvedStep);
      const rooms = getRoomList(loadedInspection.generatedSections || []);
      const preferredRoomId = initialRoomId && rooms.some((room) => room.id === initialRoomId) ? initialRoomId : rooms[0]?.id || null;
      setSelectedRoomId(preferredRoomId);
      setFocusedItemId(initialItemId || null);
      setGlobalMessage(null);
      const shouldRestoreSubmissionState =
        resolvedStep === 'materials' && initialInspectionId && loadedInspection.id === initialInspectionId && initialSubmissionState;
      setSubmissionState(shouldRestoreSubmissionState ? initialSubmissionState : null);
      setShowResumeHint(Boolean(shouldRestoreSubmissionState || (initialInspectionId && loadedInspection.id === initialInspectionId && resolvedStep !== 'select')));
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load focused inspection workflow.');
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
          await loadInspectionContext(initialInspectionId, intent === 'materials' ? 'materials' : 'inspection');
          return;
        }
        if (initialUnitId && intent === 'materials') {
          await handleSelectUnit(initialUnitId, 'materials');
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
  const currentRoomSections = useMemo(
    () => generatedSections.filter((section) => getRoomKey(section) === selectedRoomId),
    [generatedSections, selectedRoomId]
  );
  const currentRoomItems = useMemo(() => currentRoomSections.flatMap((section) => section.items), [currentRoomSections]);
  const findingMap = useMemo(() => new Map(findings.map((finding) => [finding.id, finding])), [findings]);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const materialMap = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const estimatedTotal = useMemo(
    () => materials.reduce((sum, requirement) => sum + (requirement.selectedMatch?.price || 0) * requirement.quantity, 0),
    [materials]
  );
  const materialCount = materials.length;
  const issueCount = useMemo(
    () =>
      generatedSections.reduce(
        (sum, section) => sum + section.items.filter((item) => item.focusedAction || (item.findingIds?.length || 0) > 0).length,
        0
      ),
    [generatedSections]
  );
  const incompleteItems = useMemo(
    () =>
      generatedSections.flatMap((section) =>
        section.items
          .filter((item) => (item.focusedAction && (item.materialRequirementIds?.length || 0) === 0) || (((item.notes || '').trim() || item.photoIds.length > 0) && !item.focusedAction))
          .map((item) => ({ sectionId: section.id, roomId: getRoomKey(section), item }))
      ),
    [generatedSections]
  );
  const noIssueRooms = useMemo(
    () =>
      roomGroups.filter((room) =>
        !generatedSections
          .filter((section) => getRoomKey(section) === room.id)
          .some((section) => section.items.some((item) => item.focusedAction || (item.notes || '').trim() || item.photoIds.length > 0))
      ),
    [generatedSections, roomGroups]
  );
  const isInspectionFinalized = Boolean(inspection?.isInspectionFinalized);
  const canContinueAnyway = role === 'developer' || role === 'admin';
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
  const actionableMaterialsCount = useMemo(() => materials.filter((requirement) => requirement.selectedMatch).length, [materials]);
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
          ? materials.find((requirement) => !!requirement.sourceGeneratedItemId)?.sourceGeneratedItemId || null
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
          ? materials.find((requirement) => !!requirement.sourceGeneratedItemId)?.sourceGeneratedItemId || null
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

  const goToStep = (nextStep: FocusedStep, options?: { roomId?: string | null; itemId?: string | null }) => {
    if (typeof options?.roomId !== 'undefined') {
      setSelectedRoomId(options.roomId || null);
    }
    if (typeof options?.itemId !== 'undefined') {
      setFocusedItemId(options.itemId || null);
    }
    setStep(nextStep);
    syncFocusedContext(nextStep, options?.roomId, options?.itemId);
  };

  useEffect(() => {
    if (!onContextChange) return;
    const derived = deriveScopeContextForItem(
      focusedItemId ||
        (step === 'materials'
          ? materials.find((requirement) => !!requirement.sourceGeneratedItemId)?.sourceGeneratedItemId || null
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
    materials,
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

  const ensureInspectionForUnit = async (unit: Unit): Promise<Inspection> => {
    if (!org || !user) {
      throw new Error('A signed-in local session is required.');
    }
    const existingInspections = await InspectionService.listInspections(org.id, unit.id);
    const templateBackedInspection =
      existingInspections.find((entry) => (entry.generatedSections || []).length > 0) || null;
    if (templateBackedInspection) {
      return templateBackedInspection;
    }

    const activeLayouts = await LayoutTemplateService.listActive(org.id);
    const backfilledUnit = await UnitService.backfillLayoutTemplateIfMissing(org.id, unit, activeLayouts);
    const unitForGeneration = backfilledUnit || unit;
    const preferredLayout = UnitService.resolveTemplateForUnit(unitForGeneration, activeLayouts).layout;
    if (!preferredLayout) {
      return InspectionService.createInspection(org.id, unit.id, `${unit.name} Focused Inspection`, user.id);
    }

    const generation = await InspectionTemplateGenerationService.generateFromLayout({
      layoutTemplateId: preferredLayout.id,
      orgId: org.id,
    });

    return InspectionService.createInspection(org.id, unit.id, `${unit.name} Focused Inspection`, user.id, {
      templateSnapshot: generation.snapshot,
      generatedSections: generation.sections,
      generatedItems: generation.items,
    });
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
    try {
      const activeLayouts = await LayoutTemplateService.listActive(org.id);
      const backfilledUnit = await UnitService.backfillLayoutTemplateIfMissing(org.id, unit, activeLayouts);
      const unitForWorkflow = backfilledUnit || unit;
      if (backfilledUnit) {
        setUnits((current) => current.map((entry) => (entry.id === backfilledUnit.id ? backfilledUnit : entry)));
      }
      const nextInspection = await ensureInspectionForUnit(unitForWorkflow);
      await loadInspectionContext(nextInspection.id, nextIntent === 'materials' ? 'materials' : 'inspection', nextInspection);
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

  const refreshAfterChange = async (nextStep?: FocusedStep) => {
    if (!inspection) return;
    await loadInspectionContext(inspection.id, nextStep || step);
  };

  const ensureEditableInspection = (actionLabel: string) => {
    if (!isInspectionFinalized) return true;
    const message = `Report already generated. Unlock the inspection before you ${actionLabel}.`;
    setErrorMessage(message);
    setGlobalMessage(message);
    return false;
  };

  const handleActionChange = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem, action: FocusedItemAction) => {
    if (!ensureEditableInspection('change item decisions')) return;
    if (item.focusedAction === action) return;
    setErrorMessage(null);
    setGlobalMessage(null);
    try {
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
      await refreshAfterChange();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the issue action.');
    }
  };

  const handleNoteSave = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem) => {
    if (!ensureEditableInspection('edit notes')) return;
    if (!org || !user) return;
    const nextNote = noteDrafts[item.id]?.trim() || '';
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
      await refreshAfterChange();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the note.');
    }
  };

  const handlePhotoCapture = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem, file: File) => {
    if (!ensureEditableInspection('add photos')) return;
    if (!org || !user || !inspection) return;
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
      await refreshAfterChange();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the photo.');
    }
  };

  const handleAddMaterial = async (section: GeneratedInspectionSection, item: GeneratedInspectionItem) => {
    if (!ensureEditableInspection('edit materials')) return;
    if (!org || !user || !inspection || !selectedUnit) return;
    const selection = productSelections[item.id];
    const catalogItem = catalogItems.find((entry) => entry.id === selection?.catalogItemId);
    if (!catalogItem) {
      setErrorMessage('Choose a product before adding it to materials.');
      return;
    }
    if (!item.focusedAction) {
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
      await refreshAfterChange();
      setGlobalMessage('Materials list updated automatically and saved on this device.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the material requirement.');
    }
  };

  const submitMaterials = async () => {
    if (!org || !user) return;
    const actionableRequirements = materials.filter((requirement) => requirement.selectedMatch);
    if (actionableRequirements.length === 0) {
      setSubmissionState({
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
      setSubmissionState({
        outcome: 'failed',
        unitName: selectedUnit?.name || 'This unit',
        itemCount: actionableRequirements.length,
        estimatedTotal,
        requirementIds: actionableRequirements.map((requirement) => requirement.id),
        nextStep: 'Retry submission when you are ready. Your inspection and materials are still saved locally.',
        detail: `Submission did not finish. ${message}`,
      });
      syncSubmissionContext({
        outcome: 'failed',
        unitName: selectedUnit?.name || 'This unit',
        itemCount: actionableRequirements.length,
        estimatedTotal,
        requirementIds: actionableRequirements.map((requirement) => requirement.id),
        nextStep: 'Retry submission when you are ready. Your inspection and materials are still saved locally.',
        detail: `Submission did not finish. ${message}`,
      });
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
    setSaveState({ phase: 'saving', message: savingMessage });
    try {
      const nextInspection: Inspection = {
        ...inspection,
        isInspectionFinalized: nextFinalized,
      };
      await InspectionService.updateInspection(org.id, nextInspection, user.id);
      setInspection(nextInspection);
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
    if (incompleteItems.length > 0) {
      const message = 'Finish the inspection and materials before generating the report.';
      setErrorMessage(message);
      setGlobalMessage(message);
      goToStep('summary');
      return;
    }

    setErrorMessage(null);
    setSaveState({ phase: 'saving', message: 'Generating report on this device...' });

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
      setGlobalMessage('Report generation failed. The inspection is still editable and can be retried.');
      return;
    }

    if (!isInspectionFinalized) {
      await persistInspectionFinalization(
        true,
        'Locking inspection after report generation...',
        'Report generated and inspection locked.',
        'Report generated. Editing is now locked until you unlock this inspection.',
        'Report generated, but locking the inspection failed.'
      );
      return;
    }

    setSaveState({ phase: 'saved', message: 'Report generated on this device.' });
    setGlobalMessage('Report generated. Editing is already locked for this inspection.');
  };

  const handleUnlockInspectionForEditing = async () => {
    if (!inspection?.isInspectionFinalized) return;
    await persistInspectionFinalization(
      false,
      'Unlocking inspection for editing on this device...',
      'Inspection unlocked for editing on this device.',
      'Inspection unlocked for editing. Generate the report again when you are ready to hand off the package.',
      'Failed to unlock the inspection for editing.'
    );
  };
  const handleSubmitMaterials = async () => {
    if (!isInspectionFinalized) {
      const message = 'Generate the report before sending materials to procurement.';
      setErrorMessage(message);
      setGlobalMessage(message);
      return;
    }

    if (incompleteItems.length > 0) {
      setGlobalMessage('Review the highlighted missing items before submitting materials.');
      goToStep('summary');
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
    setNoteDrafts({});
    setProductSelections({});
    setUnitSearch('');
    setSubmissionState(null);
    setSaveState({ phase: 'idle' });
    setErrorMessage(null);
    setShowBudgetModal(false);
    setPendingSubmitOverride(false);
    setShowResumeHint(false);
    setGlobalMessage(message || null);
    goToStep('select', { roomId: null, itemId: null });
  };

  const openReviewTarget = (roomId: string, itemId?: string | null) => {
    goToStep('inspection', { roomId, itemId: itemId || null });
  };

  const findReviewTarget = (roomId: string, preferredItemId?: string | null) => {
    const roomItems = generatedSections.filter((section) => getRoomKey(section) === roomId).flatMap((section) => section.items);
    if (preferredItemId) {
      return { roomId, itemId: preferredItemId };
    }
    const preferredItem =
      roomItems.find((item) => item.focusedAction && (item.materialRequirementIds?.length || 0) === 0) ||
      roomItems.find((item) => (((item.notes || '').trim() || item.photoIds.length > 0) && !item.focusedAction)) ||
      roomItems.find((item) => item.focusedAction) ||
      roomItems.find((item) => (item.notes || '').trim() || item.photoIds.length > 0) ||
      roomItems[0];
    return { roomId, itemId: preferredItem?.id || null };
  };

  const skeleton = (
    <div className="space-y-4">
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
        <button type="button" onClick={onExit} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Back
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
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
              filteredUnits.map((unit) => (
                <div
                  key={unit.id}
                  data-testid={`focused-unit-option-${unit.id}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-lowes-blue hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">{unit.name}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {[unit.unitCode, unit.address1, unit.city, unit.state].filter(Boolean).join(' • ') || 'No additional unit details yet'}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`focused-unit-action-${unit.id}`}
                      onClick={() => void handleSelectUnit(unit.id, intent)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                    >
                      Use Unit
                    </button>
                  </div>
                </div>
              ))
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
              onChange={(event) => setUnitDraft((current) => ({ ...current, layoutTemplateId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-lowes-blue"
            >
              <option value="">Select layout template</option>
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs text-slate-500">This determines the rooms that will appear when inspection starts.</span>
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
    <section data-testid="focused-inspection-screen" className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <Home size={14} />
            {selectedUnit?.name || 'Focused inspection'}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{inspection?.title || 'Focused Inspection'}</h2>
          <p className="text-sm text-slate-600">Work room by room, choose Repair or Replace, add photos or notes inline, and build materials automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => goToStep('summary')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Review Summary
          </button>
          <button type="button" onClick={() => goToStep('materials')} className="rounded-2xl bg-lowes-blue px-4 py-2 text-sm font-semibold text-white">
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
      {isInspectionFinalized ? (
        <div data-testid="focused-finalization-lock-banner" className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Report Generated</div>
              <div className="mt-1 text-base font-semibold">Editing is locked for this inspection.</div>
              <div className="mt-1 text-sm text-slate-300">Unlock this inspection before changing decisions, notes, photos, or materials.</div>
            </div>
            <button type="button" onClick={() => void handleUnlockInspectionForEditing()} className="rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
              Edit Inspection
            </button>
          </div>
        </div>
      ) : null}
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

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Rooms</div>
          {roomGroups.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => {
                setSelectedRoomId(room.id);
                setFocusedItemId(null);
              }}
              className={`w-full rounded-2xl px-4 py-3 text-left transition ${selectedRoomId === room.id ? 'bg-blue-50 text-blue-800' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
            >
              <div className="font-semibold">{room.label}</div>
              <div className="mt-1 text-xs text-slate-500">{room.itemCount} checklist items</div>
            </button>
          ))}
        </aside>

        <div className="space-y-4">
          {currentRoomItems.map((item) => {
            const section = currentRoomSections.find((entry) => entry.items.some((listItem) => listItem.id === item.id));
            if (!section) return null;
            const linkedRequirement = (item.materialRequirementIds || []).map((id) => materialMap.get(id)).find(Boolean) || null;
            const currentSelection = productSelections[item.id];
            const recommended = ProductRecommendationService.recommendProducts(catalogItems, {
              sourceType: 'finding',
              label: item.label,
              notes: noteDrafts[item.id] || item.notes,
              roomLabel: item.roomLabel || selectedRoomId || undefined,
              kind: item.focusedAction || undefined,
            });
            const productChoices = recommended.suggestedProducts.length > 0
              ? recommended.suggestedProducts.map((entry) => entry.item)
              : catalogItems.slice(0, 12);
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

            return (
              <div
                key={item.id}
                data-testid={`focused-item-${item.id}`}
                ref={(node) => {
                  itemRefs.current[item.id] = node;
                }}
                className={`rounded-[28px] border p-5 shadow-sm transition ${focusedItemId === item.id ? 'border-lowes-blue bg-blue-50/70' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-slate-900">{item.label}</div>
                      {rowSaveCopy ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{rowSaveCopy}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">{item.photoIds.length} photos</span>
                      {noteDrafts[item.id]?.trim() ? <span className="rounded-full bg-slate-100 px-2.5 py-1">Note saved</span> : null}
                      {linkedRequirement?.selectedMatch ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">{linkedRequirement.selectedMatch.optionName}</span>
                      ) : null}
                      {!isOnline ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">Offline-safe</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['repair', 'replace'] as FocusedItemAction[]).map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void handleActionChange(section, item, action)}
                        className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                          item.focusedAction === action ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {titleCase(action)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
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
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    <StickyNote size={14} />
                    + Note
                  </button>
                </div>

                {expandedNotes[item.id] ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <textarea
                      rows={3}
                      value={noteDrafts[item.id] || ''}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-lowes-blue"
                      placeholder="Add a quick note for this issue"
                    />
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={() => void handleNoteSave(section, item)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                        <Save size={14} />
                        Save Note
                      </button>
                    </div>
                  </div>
                ) : noteDrafts[item.id]?.trim() ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{noteDrafts[item.id]}</div>
                ) : null}

                {item.focusedAction ? (
                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px_auto]">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Product</span>
                        <select
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
                              {typeof product.options[0]?.price === 'number' ? ` • $${product.options[0].price.toFixed(2)}` : ''}
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
                        <button type="button" onClick={() => void handleAddMaterial(section, item)} className="w-full rounded-2xl bg-lowes-blue px-4 py-3 text-sm font-semibold text-white">
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

      <div data-testid="focused-materials-footer" className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-950 px-5 py-4 text-white shadow-xl">
        <div className="space-y-1">
          <div className="text-sm font-semibold">{materialCount} material item{materialCount === 1 ? '' : 's'} • ${estimatedTotal.toFixed(2)}</div>
          <div data-testid="focused-save-heartbeat" className="text-xs text-slate-300">{focusedHeartbeat.label}</div>
          <div className="text-[11px] text-slate-400">{focusedHeartbeat.detail}</div>
        </div>
        <button type="button" onClick={() => goToStep('materials')} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900">
          View Materials
        </button>
      </div>
    </section>
  );

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
          {incompleteItems.length === 0 ? (
            <button type="button" onClick={() => void openInspectionReport()} className="rounded-2xl bg-lowes-blue px-4 py-2 text-sm font-semibold text-white">
              Generate Report
            </button>
          ) : (
            <button type="button" onClick={() => goToStep('materials')} className="rounded-2xl bg-lowes-blue px-4 py-2 text-sm font-semibold text-white">
              View Materials
            </button>
          )}
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
                    <div className="mt-1 text-sm text-slate-500">{roomItems.filter((item) => item.focusedAction).length} issue actions</div>
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
                  {roomItems.filter((item) => item.focusedAction).length === 0 ? (
                    <div className="text-sm text-slate-500">No issue actions captured for this room.</div>
                  ) : (
                    roomItems
                      .filter((item) => item.focusedAction)
                      .map((item) => {
                        const requirement = (item.materialRequirementIds || []).map((id) => materialMap.get(id)).find(Boolean) || null;
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
                            <div>
                              <div className="font-medium text-slate-900">{item.label}</div>
                              <div className="mt-1 text-slate-500">{titleCase(item.focusedAction)} • {requirement?.selectedMatch?.optionName || 'Product still needed'}</div>
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
                      {item.focusedAction ? 'Action selected, but a product is still missing.' : 'Notes or photos exist, but no Repair/Replace action is selected yet.'}
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
          {onOpenProcurement ? (
            <button
              type="button"
              onClick={() =>
                onOpenProcurement({
                  unitId: selectedUnit?.id || null,
                  focus: 'procurement',
                  requirementId:
                    submissionState?.requirementIds[0] ||
                    materials.find((requirement) => !!requirement.sourceGeneratedItemId)?.id ||
                    null,
                  requirementIds:
                    submissionState?.requirementIds ||
                    materials.filter((requirement) => !!requirement.sourceGeneratedItemId).map((requirement) => requirement.id),
                  originLabel:
                    submissionState?.outcome === 'queued'
                      ? `Opened from Focused Mode • Queued ${submissionState.itemCount} material item${submissionState.itemCount === 1 ? '' : 's'} for ${submissionState.unitName}`
                      : submissionState
                        ? `Opened from Focused Mode • Submitted ${submissionState.itemCount} material item${submissionState.itemCount === 1 ? '' : 's'} for ${submissionState.unitName}`
                        : 'Opened from Focused Mode • Materials review',
                  arrivalContext:
                    submissionState && submissionState.outcome !== 'failed'
                      ? {
                          source: 'focused_submission',
                          outcome: submissionState.outcome === 'queued' ? 'queued' : 'submitted',
                          unitName: submissionState.unitName,
                          itemCount: submissionState.itemCount,
                          estimatedTotal: submissionState.estimatedTotal,
                          nextStep: submissionState.nextStep,
                        }
                      : null,
                })
              }
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Open in Procurement
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
      {isInspectionFinalized ? (
        <div data-testid="focused-finalization-lock-banner" className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Report Generated</div>
              <div className="mt-1 text-base font-semibold">Editing is locked for this inspection.</div>
              <div className="mt-1 text-sm text-slate-300">Unlock this inspection before changing decisions, notes, photos, or materials.</div>
            </div>
            <button type="button" onClick={() => void handleUnlockInspectionForEditing()} className="rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
              Edit Inspection
            </button>
          </div>
        </div>
      ) : null}
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
      {submissionState ? (
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
      ) : null}

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          {materials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
              No materials have been built yet. Go back to inspection and choose products inline to create the materials list automatically.
            </div>
          ) : (
            materials.map((requirement) => (
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
          <div className="text-sm font-semibold">{materials.length} items</div>
          <div className="mt-1 text-xs text-slate-300">Total estimated cost: ${estimatedTotal.toFixed(2)}</div>
          <div data-testid="focused-materials-heartbeat" className="mt-1 text-[11px] text-slate-400">{focusedHeartbeat.label}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onExit} className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Save for Later
          </button>
          {!isInspectionFinalized ? (
            <button type="button" onClick={() => void openInspectionReport()} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900">
              <PackageCheck size={16} />
              Generate Report
            </button>
          ) : (
            <button type="button" onClick={() => void handleSubmitMaterials()} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900">
              <PackageCheck size={16} />
              Submit to Procurement
            </button>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <>
      {isLoading ? skeleton : step === 'select' ? renderUnitSelection() : step === 'inspection' ? renderInspectionStep() : step === 'summary' ? renderSummaryStep() : renderMaterialsStep()}
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
