import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Home,
  Search,
} from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { Inspection, Unit } from '../core/models/inspections';
import { Finding, MaterialRequirement, RepairTask } from '../core/models/operations';
import { InspectionAttentionService, InspectionScopeTarget } from '../core/services/InspectionAttentionService';
import { FindingService } from '../core/services/FindingService';
import { InspectionService } from '../core/services/InspectionService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { RepairTaskService } from '../core/services/RepairTaskService';
import { UnitService } from '../core/services/UnitService';
import { UnitLifecycleService, UnitLifecycleSignals, UnitLifecycleStageStatus } from '../core/services/UnitLifecycleService';

interface UnitWorkspaceProps {
  initialUnitId?: string | null;
  initialAttentionContext?: {
    unitId: string;
    preferredTab?: LifecycleTab | null;
    inspectionId?: string | null;
    scopeSection?: 'findings' | 'tasks' | 'materials' | null;
    scopeTarget?: InspectionScopeTarget | null;
    reasonLabel?: string | null;
    reasonDetail?: string | null;
    token: number;
  } | null;
  recentWork?: Array<{
    id: string;
    surface: 'inspection' | 'unit_workspace' | 'procurement';
    unitId: string;
    label: string;
    detail?: string | null;
  }>;
  onOpenRecentWork?: (id: string) => void;
  onOpenPortfolio: () => void;
  onOpenInspectionQueue: (unitId: string) => void;
  onOpenInspection: (
    inspectionId: string,
    scopeSection?: 'findings' | 'tasks' | 'materials',
    originContextLabel?: string,
    scopeTarget?: InspectionScopeTarget | null
  ) => void;
  onOpenProcurement: (options?: {
    unitId?: string | null;
    focus?: 'all' | 'procurement' | 'vendor' | 'receiving' | 'verification';
    requirementId?: string | null;
    originLabel?: string | null;
  }) => void;
}

type LifecycleTab = 'overview' | 'inspection' | 'scope' | 'procurement' | 'vendor' | 'verification';

interface LifecycleTabDefinition {
  key: LifecycleTab;
  label: string;
  description: string;
}

const WORKSPACE_TABS: LifecycleTabDefinition[] = [
  { key: 'overview', label: 'Overview', description: 'Current status and next action' },
  { key: 'inspection', label: 'Inspection', description: 'Inspection status and history' },
  { key: 'scope', label: 'Scope', description: 'Findings, tasks, and materials' },
  { key: 'procurement', label: 'Procurement', description: 'Selection and activation state' },
  { key: 'vendor', label: 'Vendor', description: 'Assignment and execution progress' },
  { key: 'verification', label: 'Verification', description: 'Receiving and closeout' },
];

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const formatTimestamp = (timestamp?: number) => (timestamp ? new Date(timestamp).toLocaleString() : 'Not available');
const correctionRouteTone = {
  vendor: 'bg-violet-100 text-violet-700',
  procurement: 'bg-blue-100 text-blue-700',
  scope: 'bg-amber-100 text-amber-800',
} as const;

const inferFacilityName = (unit: Unit) => unit.facilityName || unit.address1?.split(',')[0]?.trim() || unit.city || 'Independent units';
const inferBuildingName = (unit: Unit) => unit.buildingName || unit.address2 || unit.unitCode || 'General units';

const matchesSearch = (unit: Unit, searchTerm: string) => {
  if (!searchTerm.trim()) return true;
  const haystack = [
    unit.name,
    unit.unitCode,
    unit.facilityName,
    unit.buildingName,
    unit.address1,
    unit.address2,
    unit.city,
    unit.state,
    unit.zip,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(searchTerm.toLowerCase());
};

const getSuggestedTab = (signals: UnitLifecycleSignals | null): LifecycleTab => {
  if (!signals || signals.latestInspectionStatus === 'none') return 'inspection';
  if (signals.pendingVerificationCount > 0 || signals.pendingReceivingCount > 0) return 'verification';
  if (signals.vendorAssignedCount > 0 || signals.vendorAcknowledgedCount > 0 || signals.vendorInProgressCount > 0) return 'vendor';
  if (signals.procurementReadyCount > 0 || signals.activatedCount > 0 || signals.orderedCount > 0) return 'procurement';
  if (signals.unresolvedFindingsCount > 0 || signals.blockedTasksCount > 0 || signals.activeTasksCount > 0 || signals.pendingMaterialsCount > 0) return 'scope';
  return 'overview';
};

const stageStatusCopy: Record<UnitLifecycleStageStatus, { label: string; classes: string }> = {
  not_started: { label: 'Not started', classes: 'bg-slate-100 text-slate-600' },
  active: { label: 'Active', classes: 'bg-blue-100 text-blue-700' },
  attention: { label: 'Attention', classes: 'bg-amber-100 text-amber-800' },
  complete: { label: 'Complete', classes: 'bg-emerald-100 text-emerald-700' },
};

const getTabStageStatus = (tab: LifecycleTab, signals: UnitLifecycleSignals): UnitLifecycleStageStatus => {
  if (tab === 'overview') {
    if (signals.isComplete) return 'complete';
    if (signals.needsAttention) return 'attention';
    if (signals.healthLabel === 'active_work') return 'active';
    return 'not_started';
  }

  return signals.stageStatus[tab];
};

const getHealthCopy = (signals: UnitLifecycleSignals | null) => {
  if (!signals) {
    return {
      label: 'No active scope',
      classes: 'bg-slate-100 text-slate-600',
      summary: 'Select a unit to review its lifecycle status.',
    };
  }

  if (signals.isComplete) {
    return {
      label: 'Unit complete',
      classes: 'bg-emerald-100 text-emerald-700',
      summary: 'Inspection, scope, procurement, vendor work, and verification are fully closed for this unit.',
    };
  }

  if (signals.healthLabel === 'needs_attention') {
    return {
      label: 'Needs attention',
      classes: 'bg-amber-100 text-amber-800',
      summary:
        signals.failedVerificationCount > 0
          ? `${signals.failedVerificationCount} requirement${signals.failedVerificationCount === 1 ? '' : 's'} failed verification and need corrective action.`
          : signals.reworkRequiredCount > 0
            ? `${signals.reworkRequiredCount} requirement${signals.reworkRequiredCount === 1 ? '' : 's'} are reopened for rework.`
          : signals.pendingVerificationCount > 0
          ? `${signals.pendingVerificationCount} item${signals.pendingVerificationCount === 1 ? '' : 's'} still need verification.`
          : signals.pendingReceivingCount > 0
            ? `${signals.pendingReceivingCount} item${signals.pendingReceivingCount === 1 ? '' : 's'} still need receiving.`
            : signals.blockedTasksCount > 0
              ? `${signals.blockedTasksCount} blocked task${signals.blockedTasksCount === 1 ? '' : 's'} need review.`
              : `${signals.unresolvedFindingsCount} unresolved finding${signals.unresolvedFindingsCount === 1 ? '' : 's'} still need follow-up.`,
    };
  }

  if (signals.healthLabel === 'active_work') {
    return {
      label: 'Active work',
      classes: 'bg-blue-100 text-blue-700',
      summary: 'Inspection, procurement, or vendor execution is actively moving this unit forward.',
    };
  }

  return {
    label: 'Clear for next step',
    classes: 'bg-slate-100 text-slate-600',
    summary: 'No urgent blockers are open, but this unit is not yet fully complete.',
  };
};

const buildTabStorageKey = (orgId: string, unitId: string) => `unitflip:unit-workspace:tab:${orgId}:${unitId}`;

export const UnitWorkspace: React.FC<UnitWorkspaceProps> = ({
  initialUnitId,
  initialAttentionContext = null,
  recentWork = [],
  onOpenRecentWork,
  onOpenPortfolio,
  onOpenInspectionQueue,
  onOpenInspection,
  onOpenProcurement,
}) => {
  const { org } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<RepairTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialUnitId || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<LifecycleTab>('overview');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!org) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [loadedUnits, loadedInspections, loadedFindings, loadedTasks, loadedMaterials] = await Promise.all([
          UnitService.listUnits(org.id),
          InspectionService.listInspections(org.id),
          FindingService.listFindings(org.id),
          RepairTaskService.listTasks(org.id),
          MaterialRequirementService.listRequirements(org.id),
        ]);

        setUnits(loadedUnits.filter((unit) => unit.status !== 'archived'));
        setInspections(loadedInspections);
        setFindings(loadedFindings);
        setTasks(loadedTasks);
        setMaterials(loadedMaterials);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [org]);

  useEffect(() => {
    if (initialUnitId) {
      setSelectedUnitId(initialUnitId);
    }
  }, [initialUnitId]);

  const inspectionById = useMemo(
    () => new Map(inspections.map((inspection) => [inspection.id, inspection])),
    [inspections]
  );

  const inspectionsByUnitId = useMemo(() => {
    const next = new Map<string, Inspection[]>();
    inspections.forEach((inspection) => {
      const current = next.get(inspection.unitId) || [];
      current.push(inspection);
      next.set(inspection.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [inspections]);

  const findingsByUnitId = useMemo(() => {
    const next = new Map<string, Finding[]>();
    findings.forEach((finding) => {
      const current = next.get(finding.unitId) || [];
      current.push(finding);
      next.set(finding.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [findings]);

  const tasksByUnitId = useMemo(() => {
    const next = new Map<string, RepairTask[]>();
    tasks.forEach((task) => {
      const current = next.get(task.unitId) || [];
      current.push(task);
      next.set(task.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [tasks]);

  const materialsByUnitId = useMemo(() => {
    const next = new Map<string, MaterialRequirement[]>();
    materials.forEach((requirement) => {
      const inspection = inspectionById.get(requirement.inspectionId);
      if (!inspection) return;
      const current = next.get(inspection.unitId) || [];
      current.push(requirement);
      next.set(inspection.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [inspectionById, materials]);

  const filteredUnits = useMemo(
    () => units.filter((unit) => matchesSearch(unit, searchTerm)).sort((a, b) => a.name.localeCompare(b.name)),
    [searchTerm, units]
  );

  useEffect(() => {
    if (selectedUnitId && units.some((unit) => unit.id === selectedUnitId)) return;
    setSelectedUnitId(filteredUnits[0]?.id || units[0]?.id || null);
  }, [filteredUnits, selectedUnitId, units]);

  const selectedUnit = useMemo(
    () => filteredUnits.find((unit) => unit.id === selectedUnitId) || units.find((unit) => unit.id === selectedUnitId) || null,
    [filteredUnits, selectedUnitId, units]
  );

  const selectedSignals = useMemo<UnitLifecycleSignals | null>(() => {
    if (!selectedUnit) return null;
    const unitInspections = inspectionsByUnitId.get(selectedUnit.id) || [];
    const unitFindings = findingsByUnitId.get(selectedUnit.id) || [];
    const unitTasks = tasksByUnitId.get(selectedUnit.id) || [];
    const unitMaterials = materialsByUnitId.get(selectedUnit.id) || [];
    return UnitLifecycleService.deriveSignals(selectedUnit, unitInspections, unitFindings, unitTasks, unitMaterials);
  }, [findingsByUnitId, inspectionsByUnitId, materialsByUnitId, selectedUnit, tasksByUnitId]);

  const selectedUnitFindings = selectedUnit ? findingsByUnitId.get(selectedUnit.id) || [] : [];
  const selectedUnitTasks = selectedUnit ? tasksByUnitId.get(selectedUnit.id) || [] : [];
  const selectedUnitMaterials = selectedUnit ? materialsByUnitId.get(selectedUnit.id) || [] : [];
  const selectedUnitInspections = selectedUnit ? inspectionsByUnitId.get(selectedUnit.id) || [] : [];

  const derivedInspectionPriority = useMemo(
    () => InspectionAttentionService.derivePriorityContext(selectedUnitFindings, selectedUnitTasks, selectedUnitMaterials),
    [selectedUnitFindings, selectedUnitTasks, selectedUnitMaterials]
  );

  const attentionContext = useMemo(() => {
    if (!selectedUnit) return null;
    if (initialAttentionContext?.unitId === selectedUnit.id) {
      return initialAttentionContext;
    }
    if (!derivedInspectionPriority || !selectedSignals?.latestInspection) return null;
    return {
      unitId: selectedUnit.id,
      preferredTab: derivedInspectionPriority.unitTab,
      inspectionId: selectedSignals.latestInspection.id,
      scopeSection: derivedInspectionPriority.scopeSection,
      scopeTarget: derivedInspectionPriority.scopeTarget,
      reasonLabel: derivedInspectionPriority.reasonLabel,
      reasonDetail: derivedInspectionPriority.reasonDetail,
      token: selectedSignals.latestInspection.updatedAt,
    };
  }, [derivedInspectionPriority, initialAttentionContext, selectedSignals, selectedUnit]);

  const openInspectionWithAttention = (
    fallbackSection?: 'findings' | 'tasks' | 'materials',
    fallbackOriginLabel?: string
  ) => {
    if (!selectedSignals?.latestInspection) return;

    const scopeSection = attentionContext?.scopeSection || fallbackSection;
    const originContextLabel =
      attentionContext?.reasonLabel
        ? `Opened from Unit Workspace • ${attentionContext.reasonLabel}`
        : fallbackOriginLabel || 'Opened from Unit Workspace';
    const scopeTarget =
      attentionContext?.scopeSection === scopeSection || !fallbackSection
        ? attentionContext?.scopeTarget || null
        : null;

    onOpenInspection(
      attentionContext?.inspectionId || selectedSignals.latestInspection.id,
      scopeSection,
      originContextLabel,
      scopeTarget
    );
  };

  const handleOpenScope = (section: 'findings' | 'tasks' | 'materials') => {
    openInspectionWithAttention(section, `Opened from Unit Workspace • ${titleCase(section)}`);
  };

  const handleOpenCorrectionRoute = () => {
    if (!selectedSignals?.primaryCorrectiveGuidance) return;
    if (selectedSignals.primaryCorrectiveGuidance.route === 'scope') {
      handleOpenScope('materials');
      return;
    }
    onOpenProcurement({
      unitId: selectedUnit?.id || null,
      focus: selectedSignals.primaryCorrectiveGuidance.route === 'vendor' ? 'vendor' : 'procurement',
      requirementId: attentionContext?.scopeTarget?.entityType === 'material' ? attentionContext.scopeTarget.entityId : null,
      originLabel: attentionContext?.reasonLabel ? `Opened from Unit Workspace • ${attentionContext.reasonLabel}` : 'Opened from Unit Workspace • Corrective route',
    });
  };

  const openProcurementWithAttention = (focus: 'procurement' | 'vendor' | 'receiving' | 'verification', fallbackOriginLabel: string) => {
    onOpenProcurement({
      unitId: selectedUnit?.id || null,
      focus,
      requirementId: attentionContext?.scopeTarget?.entityType === 'material' ? attentionContext.scopeTarget.entityId : null,
      originLabel: attentionContext?.reasonLabel ? `Opened from Unit Workspace • ${attentionContext.reasonLabel}` : fallbackOriginLabel,
    });
  };

  useEffect(() => {
    if (!org || !selectedUnit) return;

    if (attentionContext?.unitId === selectedUnit.id && attentionContext.preferredTab) {
      setActiveTab(attentionContext.preferredTab);
      return;
    }

    const suggestedTab = getSuggestedTab(selectedSignals);

    try {
      const storedTab = window.localStorage.getItem(buildTabStorageKey(org.id, selectedUnit.id)) as LifecycleTab | null;
      if (storedTab && WORKSPACE_TABS.some((tab) => tab.key === storedTab)) {
        setActiveTab(storedTab);
        return;
      }
    } catch {
      // Ignore local UI persistence failures.
    }

    setActiveTab(suggestedTab);
  }, [attentionContext, org, selectedSignals, selectedUnit]);

  useEffect(() => {
    if (!org || !selectedUnit) return;
    try {
      window.localStorage.setItem(buildTabStorageKey(org.id, selectedUnit.id), activeTab);
    } catch {
      // Ignore local UI persistence failures.
    }
  }, [activeTab, org, selectedUnit]);

  const nextAction = useMemo(() => {
    if (!selectedSignals || !selectedUnit) {
      return {
        title: 'Select a unit',
        description: 'Choose a unit to review its lifecycle and route into the next operational step.',
        tab: 'overview' as LifecycleTab,
        actionLabel: 'Browse Portfolio',
        action: onOpenPortfolio,
      };
    }

    if (!selectedSignals.latestInspection) {
      return {
        title: 'Start inspection',
        description: 'This unit has no inspection history yet. Create the first operational record here.',
        tab: 'inspection' as LifecycleTab,
        actionLabel: 'Start Inspection',
        action: () => onOpenInspectionQueue(selectedUnit.id),
      };
    }

    if (
      selectedSignals.primaryCorrectiveGuidance &&
      (selectedSignals.failedVerificationCount > 0 || selectedSignals.reworkRequiredCount > 0 || selectedSignals.reopenedCount > 0)
    ) {
      if (selectedSignals.primaryCorrectiveGuidance.route === 'scope') {
        return {
          title: 'Correct structured scope',
          description: selectedSignals.primaryCorrectiveGuidance.detail,
          tab: 'scope' as LifecycleTab,
          actionLabel: selectedSignals.primaryCorrectiveGuidance.actionLabel,
          action: () => handleOpenScope('materials'),
        };
      }

      return {
        title:
          selectedSignals.failedVerificationCount > 0
            ? 'Resolve closeout exception'
            : 'Route reopened work back into execution',
        description: selectedSignals.primaryCorrectiveGuidance.detail,
        tab: selectedSignals.primaryCorrectiveGuidance.route === 'vendor' ? ('vendor' as LifecycleTab) : ('procurement' as LifecycleTab),
        actionLabel: selectedSignals.primaryCorrectiveGuidance.actionLabel,
        action: handleOpenCorrectionRoute,
      };
    }

    if (selectedSignals.pendingVerificationCount > 0) {
      return {
        title: 'Verify completed work',
        description: 'Received items are waiting on internal verification before they can be fulfilled.',
        tab: 'verification' as LifecycleTab,
        actionLabel: 'Open Verification Queue',
        action: () => openProcurementWithAttention('verification', 'Opened from Unit Workspace • Verification'),
      };
    }

    if (selectedSignals.pendingReceivingCount > 0) {
      return {
        title: 'Receive vendor-completed work',
        description: 'Vendor-completed items still need internal receiving before verification can happen.',
        tab: 'verification' as LifecycleTab,
        actionLabel: 'Open Receiving Queue',
        action: () => openProcurementWithAttention('receiving', 'Opened from Unit Workspace • Receiving'),
      };
    }

    if (selectedSignals.vendorAssignedCount > 0 || selectedSignals.vendorAcknowledgedCount > 0 || selectedSignals.vendorInProgressCount > 0) {
      return {
        title: 'Review vendor progress',
        description: 'Vendor-assigned work is active. Check execution state and completion timestamps.',
        tab: 'vendor' as LifecycleTab,
        actionLabel: 'Open Procurement',
        action: () => openProcurementWithAttention('vendor', 'Opened from Unit Workspace • Vendor'),
      };
    }

    if (selectedSignals.procurementReadyCount > 0 || selectedSignals.activatedCount > 0 || selectedSignals.orderedCount > 0) {
      return {
        title: 'Advance procurement',
        description: 'Material requirements are ready for procurement selection, activation, or order follow-through.',
        tab: 'procurement' as LifecycleTab,
        actionLabel: 'Open Procurement',
        action: () => openProcurementWithAttention('procurement', 'Opened from Unit Workspace • Procurement'),
      };
    }

    if (selectedSignals.unresolvedFindingsCount > 0 || selectedSignals.blockedTasksCount > 0 || selectedSignals.activeTasksCount > 0) {
      return {
        title: 'Review scope',
        description: attentionContext?.reasonDetail || 'Findings or tasks still need attention before this unit can move cleanly forward.',
        tab: 'scope' as LifecycleTab,
        actionLabel: attentionContext?.reasonLabel ? `Open ${attentionContext.reasonLabel}` : 'Open Findings',
        action: () => openInspectionWithAttention('findings', 'Opened from Unit Workspace • Findings'),
      };
    }

    if (selectedSignals.resumableInspection) {
      return {
        title: 'Resume inspection',
        description: 'Inspection work is already in progress or drafted for this unit.',
        tab: 'inspection' as LifecycleTab,
        actionLabel: 'Resume Inspection',
        action: () => openInspectionWithAttention(undefined, 'Opened from Unit Workspace'),
      };
    }

    if (selectedSignals.isComplete) {
      return {
        title: 'Unit complete',
        description: 'This unit is fully inspected, scoped, procured, executed, received, and verified.',
        tab: 'overview' as LifecycleTab,
        actionLabel: 'Review Overview',
        action: () => setActiveTab('overview'),
      };
    }

    return {
      title: 'Review overview',
      description: 'This unit has a clear operational history and no urgent blockers right now.',
      tab: 'overview' as LifecycleTab,
      actionLabel: 'Open Portfolio',
      action: onOpenPortfolio,
    };
  }, [attentionContext, handleOpenCorrectionRoute, onOpenInspectionQueue, onOpenPortfolio, openInspectionWithAttention, openProcurementWithAttention, selectedSignals, selectedUnit]);

  const recentActivity = useMemo(() => {
    if (!selectedUnit || !selectedSignals) return [];

    const items = [
      selectedSignals.latestInspection
        ? {
            key: `inspection-${selectedSignals.latestInspection.id}`,
            label: 'Inspection update',
            detail: `${selectedSignals.latestInspection.title} is ${titleCase(selectedSignals.latestInspection.status)}.`,
            timestamp: selectedSignals.latestInspection.updatedAt,
          }
        : null,
      selectedUnitFindings[0]
        ? {
            key: `finding-${selectedUnitFindings[0].id}`,
            label: 'Latest finding',
            detail: selectedUnitFindings[0].description,
            timestamp: selectedUnitFindings[0].updatedAt,
          }
        : null,
      selectedUnitTasks[0]
        ? {
            key: `task-${selectedUnitTasks[0].id}`,
            label: 'Latest task',
            detail: `${selectedUnitTasks[0].title} is ${titleCase(selectedUnitTasks[0].status)}.`,
            timestamp: selectedUnitTasks[0].updatedAt,
          }
        : null,
      selectedUnitMaterials[0]
        ? {
            key: `material-${selectedUnitMaterials[0].id}`,
            label: 'Latest material',
            detail: `${selectedUnitMaterials[0].itemDescription} is ${titleCase(selectedUnitMaterials[0].procurementState || 'scoped_only')}.`,
            timestamp: selectedUnitMaterials[0].updatedAt,
          }
        : null,
    ].filter(Boolean) as Array<{ key: string; label: string; detail: string; timestamp: number }>;

    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedSignals, selectedUnit, selectedUnitFindings, selectedUnitMaterials, selectedUnitTasks]);

  const recentWorkForUnit = useMemo(
    () =>
      selectedUnit
        ? recentWork.filter((item) => item.unitId === selectedUnit.id).slice(0, 3)
        : [],
    [recentWork, selectedUnit]
  );

  const isSectionOpen = (sectionKey: string, defaultOpen: boolean) =>
    expandedSections[sectionKey] ?? defaultOpen;

  const toggleSection = (sectionKey: string, defaultOpen: boolean) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? defaultOpen),
    }));
  };

  const renderCollapsibleSection = (
    sectionKey: string,
    title: string,
    summary: string,
    content: React.ReactNode,
    defaultOpen = true
  ) => {
    const isOpen = isSectionOpen(sectionKey, defaultOpen);

    return (
      <section
        key={sectionKey}
        data-testid={`workspace-section-${sectionKey}`}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <button
          type="button"
          onClick={() => toggleSection(sectionKey, defaultOpen)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-sm text-slate-500">{summary}</div>
          </div>
          {isOpen ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
        </button>
        {isOpen ? (
          <div
            data-testid={`workspace-section-content-${sectionKey}`}
            className="border-t border-slate-200 px-5 py-4"
          >
            {content}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Unit Workspace</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Follow one unit through inspection, scope, procurement, vendor work, and verification.</h1>
            <p className="mt-3 text-sm text-slate-600">
              This workspace is intentionally unit-focused. Use Dashboard for cross-portfolio action queues, Portfolio for hierarchy browsing,
              and Procurement for multi-unit coordination.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white/85 p-4 shadow-sm xl:max-w-md">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Next action</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{nextAction.title}</div>
            <p className="mt-2 text-sm text-slate-600">{nextAction.description}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Focus {WORKSPACE_TABS.find((tab) => tab.key === nextAction.tab)?.label}
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab(nextAction.tab);
                  nextAction.action();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 transition hover:border-emerald-300"
              >
                {nextAction.actionLabel}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Select unit</h2>
            <p className="mt-1 text-sm text-slate-500">Pick one unit and keep the rest of the app focused on that operational story.</p>
          </div>
          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search size={16} className="text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search units, buildings, facilities"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                Loading unit workspace...
              </div>
            ) : filteredUnits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                No units match the current search.
              </div>
            ) : (
              filteredUnits.map((unit) => (
                <button
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    unit.id === selectedUnit?.id
                      ? 'border-lowes-blue bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="font-semibold text-slate-900">{unit.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {inferFacilityName(unit)} • {inferBuildingName(unit)}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="space-y-6">
          {!selectedUnit || !selectedSignals ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
              <Home size={36} className="mx-auto text-slate-300" />
              <h2 className="mt-4 text-xl font-semibold text-slate-900">No unit selected</h2>
              <p className="mt-2 text-sm text-slate-500">Choose a unit from the left rail to review its inspection, scope, procurement, vendor, and verification lifecycle.</p>
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                      <Building2 size={14} />
                      {inferFacilityName(selectedUnit)}
                    </div>
                    <h2 className="mt-3 text-3xl font-bold text-slate-900">{selectedUnit.name}</h2>
                    <div className="mt-2 text-sm text-slate-500">
                      {inferBuildingName(selectedUnit)} • {selectedUnit.unitCode || 'No unit code'} • Last activity {formatTimestamp(selectedSignals.lastActivityAt)}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getHealthCopy(selectedSignals).classes}`}>
                        {getHealthCopy(selectedSignals).label}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${selectedSignals.isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {selectedSignals.isComplete ? 'Unit Complete' : 'Unit In Progress'}
                      </span>
                    </div>
                    <p className="mt-3 max-w-3xl text-sm text-slate-600">{getHealthCopy(selectedSignals).summary}</p>
                    {attentionContext ? (
                      <div
                        data-testid="unit-workspace-priority-summary"
                        className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                            Priority now
                          </span>
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                            {attentionContext.reasonLabel || 'Open item'}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                            {WORKSPACE_TABS.find((tab) => tab.key === attentionContext.preferredTab)?.label || 'Scope'}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-700">
                          {attentionContext.reasonDetail || 'Open the top-priority inspection context for this unit.'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:w-[420px]">
                    <button
                      onClick={() => onOpenInspectionQueue(selectedUnit.id)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-lowes-blue hover:bg-white"
                    >
                      <div className="text-sm font-semibold text-slate-900">Start inspection</div>
                      <div className="mt-1 text-xs text-slate-500">Open the inspection queue for this unit.</div>
                    </button>
                    <button
                      onClick={() =>
                        selectedSignals.resumableInspection
                          ? openInspectionWithAttention(undefined, 'Opened from Unit Workspace')
                          : onOpenInspectionQueue(selectedUnit.id)
                      }
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-lowes-blue hover:bg-white"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {selectedSignals.resumableInspection ? 'Resume inspection' : 'Open inspection history'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {selectedSignals.resumableInspection
                          ? 'Continue the drafted or in-progress inspection.'
                          : 'This unit has no resumable inspection.'}
                      </div>
                    </button>
                    <button
                      onClick={onOpenPortfolio}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-lowes-blue hover:bg-white"
                    >
                      <div className="text-sm font-semibold text-slate-900">Return to Portfolio</div>
                      <div className="mt-1 text-xs text-slate-500">Browse the wider hierarchy and unit ordering.</div>
                    </button>
                    <button
                      onClick={() => openProcurementWithAttention('procurement', 'Opened from Unit Workspace • Procurement')}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-lowes-blue hover:bg-white"
                    >
                      <div className="text-sm font-semibold text-slate-900">Open Procurement</div>
                      <div className="mt-1 text-xs text-slate-500">Review this unit’s procurement, vendor, receiving, and verification items first.</div>
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Inspection</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {selectedSignals.latestInspectionStatus === 'none' ? 'No history' : titleCase(selectedSignals.latestInspectionStatus)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{selectedUnitInspections.length} inspection records</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Scope</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedSignals.unresolvedFindingsCount}</div>
                    <div className="mt-1 text-xs text-slate-500">open findings • {selectedSignals.activeTasksCount} active tasks</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Procurement</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedSignals.pendingMaterialsCount}</div>
                    <div className="mt-1 text-xs text-slate-500">materials • {selectedSignals.procurementReadyCount} ready</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Vendor</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {selectedSignals.vendorAssignedCount + selectedSignals.vendorAcknowledgedCount}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{selectedSignals.vendorInProgressCount} in progress</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Completion</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedSignals.isComplete ? 'Complete' : 'Open'}</div>
                    <div className="mt-1 text-xs text-slate-500">{selectedSignals.fulfilledCount} fulfilled • {selectedSignals.pendingVerificationCount} pending verification</div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="unit-workspace-tabs">
                <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {WORKSPACE_TABS.map((tab) => {
                    const isActive = activeTab === tab.key;
                    const isSuggested = nextAction.tab === tab.key;
                    const stageStatus = getTabStageStatus(tab.key, selectedSignals);
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        data-testid={`unit-workspace-tab-${tab.key}`}
                        onClick={() => setActiveTab(tab.key)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          isActive
                            ? 'border-lowes-blue bg-blue-50 text-slate-900'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">{tab.label}</div>
                          {isSuggested ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Next
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{tab.description}</div>
                        <div className="mt-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stageStatusCopy[stageStatus].classes}`}>
                            {stageStatusCopy[stageStatus].label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-slate-600">
                    Suggested stage {WORKSPACE_TABS.find((tab) => tab.key === nextAction.tab)?.label}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${getHealthCopy(selectedSignals).classes}`}>
                    {getHealthCopy(selectedSignals).label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-slate-600">
                    Latest inspection {selectedSignals.latestInspectionStatus === 'none' ? 'None' : titleCase(selectedSignals.latestInspectionStatus)}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${selectedSignals.isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {selectedSignals.isComplete ? 'Complete' : 'Open lifecycle'}
                  </span>
                </div>
              </section>

              {activeTab === 'overview' ? (
                <div className="space-y-4" role="tabpanel" data-testid="unit-workspace-panel-overview">
                  {renderCollapsibleSection(
                    'overview-summary',
                    'Unit summary',
                    'Identity, health state, and lifecycle counts.',
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Health</div>
                        <div className="mt-2 text-xl font-bold text-slate-900">{getHealthCopy(selectedSignals).label}</div>
                        <div className="mt-1 text-xs text-slate-500">{getHealthCopy(selectedSignals).summary}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Inspection</div>
                        <div className="mt-2 text-xl font-bold text-slate-900">
                          {selectedSignals.latestInspectionStatus === 'none' ? 'No history' : titleCase(selectedSignals.latestInspectionStatus)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{selectedUnitInspections.length} records</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Procurement</div>
                        <div className="mt-2 text-xl font-bold text-slate-900">{selectedSignals.pendingMaterialsCount}</div>
                        <div className="mt-1 text-xs text-slate-500">materials • {selectedSignals.procurementReadyCount} ready</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Completion</div>
                        <div className="mt-2 text-xl font-bold text-slate-900">{selectedSignals.isComplete ? 'Complete' : 'Open'}</div>
                        <div className="mt-1 text-xs text-slate-500">{selectedSignals.fulfilledCount} fulfilled • {selectedSignals.pendingVerificationCount} pending verification</div>
                      </div>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'overview-priority',
                    'What matters first',
                    'Carry the strongest inspection attention signal into unit-level execution.',
                    attentionContext ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                              Focus {WORKSPACE_TABS.find((tab) => tab.key === attentionContext.preferredTab)?.label || 'Scope'}
                            </span>
                            {attentionContext.reasonLabel ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                {attentionContext.reasonLabel}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 text-base font-semibold text-slate-900">
                            {attentionContext.reasonDetail || 'Open the top-priority record for this unit.'}
                          </div>
                          <div className="mt-2 text-sm text-slate-600">
                            {attentionContext.scopeTarget
                              ? 'This priority context will stay attached when you move back into inspection.'
                              : 'This unit is carrying forward its strongest current inspection signal.'}
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid="unit-workspace-open-priority-inspection"
                          onClick={() => openInspectionWithAttention(attentionContext.scopeSection || 'findings', 'Opened from Unit Workspace • Priority')}
                          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:border-amber-300"
                        >
                          Open Top-Priority Inspection Context
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                        No specific inspection record needs priority carry-through right now.
                      </div>
                    )
                  )}
                  {renderCollapsibleSection(
                    'overview-recent-work',
                    'Recent work trail',
                    'Return to the last few meaningful contexts for this unit.',
                    recentWorkForUnit.length > 0 ? (
                      <div className="space-y-3" data-testid="unit-workspace-recent-work">
                        {recentWorkForUnit.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            data-testid={`unit-workspace-recent-work-item-${item.surface}`}
                            onClick={() => onOpenRecentWork?.(item.id)}
                            className="flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">{item.label}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  {item.surface === 'unit_workspace'
                                    ? 'Unit Workspace'
                                    : item.surface === 'procurement'
                                      ? 'Procurement'
                                      : 'Inspection'}
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-slate-600">{item.detail || 'Return to the same recent work context.'}</div>
                            </div>
                            <div className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-lowes-blue">
                              Return
                              <ArrowRight size={14} />
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                        Recent unit work will appear here after you move between inspection, procurement, and this unit workspace.
                      </div>
                    )
                  )}
                  {renderCollapsibleSection(
                    'overview-next-action',
                    'Current status and next action',
                    'What needs to happen next for this unit.',
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <div className="text-lg font-semibold text-slate-900">{nextAction.title}</div>
                        <div className="mt-2 text-sm text-slate-600">{nextAction.description}</div>
                        {attentionContext?.reasonLabel ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                            Top priority: {attentionContext.reasonLabel}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab(nextAction.tab);
                          nextAction.action();
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 transition hover:border-emerald-300"
                      >
                        {nextAction.actionLabel}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'overview-why-not-complete',
                    'Why not complete',
                    'Deterministic reasons this unit is still open.',
                    selectedSignals.whyNotComplete.length > 0 ? (
                      <div className="space-y-3">
                        {selectedSignals.whyNotComplete.map((reason) => (
                          <div key={reason.code} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                {titleCase(reason.stage)}
                              </span>
                              {reason.correctionRoute ? (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${correctionRouteTone[reason.correctionRoute]}`}
                                >
                                  Correct via {titleCase(reason.correctionRoute)}
                                </span>
                              ) : null}
                              <span className="text-sm font-semibold text-slate-900">{reason.label}</span>
                            </div>
                            <div className="mt-2 text-sm text-slate-600">{reason.detail}</div>
                            {reason.correctiveActionDetail ? (
                              <div className="mt-2 text-xs font-medium text-slate-500">
                                {reason.correctiveActionLabel}: {reason.correctiveActionDetail}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-8 text-sm text-emerald-700">
                        This unit currently meets the derived completion rule.
                      </div>
                    ),
                    !selectedSignals.isComplete
                  )}
                  {renderCollapsibleSection(
                    'overview-activity',
                    'Recent activity',
                    'Latest updates across inspection, scope, and procurement.',
                    recentActivity.length > 0 ? (
                      <div className="space-y-3">
                        {recentActivity.map((item) => (
                          <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                            <div className="mt-1 text-sm text-slate-600">{item.detail}</div>
                            <div className="mt-2 text-xs text-slate-500">{formatTimestamp(item.timestamp)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                        No recent lifecycle activity is available for this unit yet.
                      </div>
                    ),
                    false
                  )}
                </div>
              ) : null}

              {activeTab === 'inspection' ? (
                <div className="space-y-4" role="tabpanel" data-testid="unit-workspace-panel-inspection">
                  {renderCollapsibleSection(
                    'inspection-summary',
                    'Inspection summary',
                    'Current inspection status and immediate actions.',
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                        Latest inspection: {selectedSignals.latestInspection ? selectedSignals.latestInspection.title : 'No inspection yet'}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                        {selectedSignals.resumableInspection
                          ? `Resume ${selectedSignals.resumableInspection.title} to continue execution.`
                          : 'No resumable inspection exists for this unit.'}
                      </div>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'inspection-actions',
                    'Inspection actions',
                    'Use the existing inspection workflow for live capture and review.',
                    <div className="grid gap-3 md:grid-cols-2">
                      <button onClick={() => onOpenInspectionQueue(selectedUnit.id)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white">
                        <div className="font-semibold text-slate-900">Start inspection</div>
                        <div className="mt-1 text-sm text-slate-500">Open the inspection queue for this unit.</div>
                      </button>
                    <button
                      onClick={() =>
                        selectedSignals.resumableInspection
                          ? openInspectionWithAttention(undefined, 'Opened from Unit Workspace')
                          : onOpenInspectionQueue(selectedUnit.id)
                      }
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
                      >
                        <div className="font-semibold text-slate-900">
                          {selectedSignals.resumableInspection ? 'Resume inspection' : 'Open inspection history'}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">Route into the existing inspection surface without duplicating it here.</div>
                      </button>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'inspection-history',
                    'Inspection history',
                    `${selectedUnitInspections.length} inspection record${selectedUnitInspections.length === 1 ? '' : 's'} for this unit.`,
                    selectedUnitInspections.length > 0 ? (
                      <div className="space-y-3">
                        {selectedUnitInspections.slice(0, 5).map((inspection) => (
                          <button
                            key={inspection.id}
                            type="button"
                            onClick={() =>
                              onOpenInspection(
                                inspection.id,
                                attentionContext?.inspectionId === inspection.id ? attentionContext.scopeSection || undefined : undefined,
                                attentionContext?.inspectionId === inspection.id && attentionContext.reasonLabel
                                  ? `Opened from Unit Workspace • ${attentionContext.reasonLabel}`
                                  : 'Opened from Unit Workspace',
                                attentionContext?.inspectionId === inspection.id ? attentionContext.scopeTarget || null : null
                              )
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
                          >
                            <div className="font-semibold text-slate-900">{inspection.title}</div>
                            <div className="mt-1 text-sm text-slate-500">{titleCase(inspection.status)} • Updated {formatTimestamp(inspection.updatedAt)}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                        No inspection history exists for this unit yet.
                      </div>
                    ),
                    false
                  )}
                </div>
              ) : null}

              {activeTab === 'scope' ? (
                <div className="space-y-4" role="tabpanel" data-testid="unit-workspace-panel-scope">
                  {renderCollapsibleSection(
                    'scope-readiness',
                    'Scope readiness',
                    'Open-work summary across findings, tasks, and materials.',
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Findings</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{selectedSignals.unresolvedFindingsCount}</div>
                        <div className="mt-1 text-xs text-slate-500">{selectedUnitFindings.length} total</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Tasks</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{selectedSignals.activeTasksCount}</div>
                        <div className="mt-1 text-xs text-slate-500">{selectedSignals.blockedTasksCount} blocked</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Materials</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{selectedSignals.pendingMaterialsCount}</div>
                        <div className="mt-1 text-xs text-slate-500">{selectedSignals.procurementReadyCount} ready</div>
                      </div>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'scope-findings',
                    'Findings',
                    'Open the existing findings view for detailed refinement.',
                    <div className="space-y-3">
                      {selectedUnitFindings.slice(0, 3).map((finding) => (
                        <div key={finding.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-semibold text-slate-900">{finding.description}</div>
                          <div className="mt-1 text-sm text-slate-500">{titleCase(finding.status)} • {titleCase(finding.priority)} priority</div>
                        </div>
                      ))}
                      <button onClick={() => handleOpenScope('findings')} className="inline-flex items-center gap-2 text-sm font-medium text-lowes-blue">
                        View Findings
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'scope-tasks',
                    'Repair tasks',
                    'Latest task status and trade breakdown.',
                    <div className="space-y-3">
                      {selectedUnitTasks.slice(0, 3).map((task) => (
                        <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-semibold text-slate-900">{task.title}</div>
                          <div className="mt-1 text-sm text-slate-500">{titleCase(task.status)} • {titleCase(task.trade)}</div>
                        </div>
                      ))}
                      <button onClick={() => handleOpenScope('tasks')} className="inline-flex items-center gap-2 text-sm font-medium text-lowes-blue">
                        View Tasks
                        <ArrowRight size={14} />
                      </button>
                    </div>,
                    false
                  )}
                  {renderCollapsibleSection(
                    'scope-materials',
                    'Material requirements',
                    'Materials linked to current scope work.',
                    <div className="space-y-3">
                      {selectedUnitMaterials.slice(0, 3).map((material) => (
                        <div key={material.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-semibold text-slate-900">{material.itemDescription}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {material.quantity} {material.unit} • {titleCase(material.procurementState || 'scoped_only')}
                          </div>
                        </div>
                      ))}
                      <button onClick={() => handleOpenScope('materials')} className="inline-flex items-center gap-2 text-sm font-medium text-lowes-blue">
                        View Materials
                        <ArrowRight size={14} />
                      </button>
                    </div>,
                    false
                  )}
                </div>
              ) : null}

              {activeTab === 'procurement' ? (
                <div className="space-y-4" role="tabpanel" data-testid="unit-workspace-panel-procurement">
                  {renderCollapsibleSection(
                    'procurement-summary',
                    'Suggested vs selected summary',
                    'Explicit selection state without duplicating the procurement workspace.',
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        {selectedUnitMaterials.filter((material) => material.selectedMatch).length} selected procurement matches • {selectedSignals.procurementReadyCount} ready • {selectedSignals.activatedCount} activated • {selectedSignals.orderedCount} ordered
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        {selectedUnitMaterials.filter((material) => !material.selectedMatch).length} material requirement{selectedUnitMaterials.filter((material) => !material.selectedMatch).length === 1 ? '' : 's'} are still awaiting an explicit selected procurement product.
                      </div>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'procurement-actions',
                    'Procurement actions',
                    'Route into the shared procurement workspace for activation and assignment.',
                    <div className="grid gap-3 md:grid-cols-2">
                      <button onClick={() => openProcurementWithAttention('procurement', 'Opened from Unit Workspace • Procurement')} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white">
                        <div className="font-semibold text-slate-900">Open Procurement Workspace</div>
                        <div className="mt-1 text-sm text-slate-500">Continue selection and activation with this unit already filtered in Procurement.</div>
                      </button>
                      <button onClick={() => handleOpenScope('materials')} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white">
                        <div className="font-semibold text-slate-900">Open Materials</div>
                        <div className="mt-1 text-sm text-slate-500">Return to scope-linked material requirements for this unit.</div>
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === 'vendor' ? (
                <div className="space-y-4" role="tabpanel" data-testid="unit-workspace-panel-vendor">
                  {renderCollapsibleSection(
                    'vendor-assignment',
                    'Assigned vendor summary',
                    'Current assignment and vendor execution state for this unit.',
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        {selectedSignals.vendorAssignedCount + selectedSignals.vendorAcknowledgedCount} assigned • {selectedSignals.vendorInProgressCount} in progress
                      </div>
                      {selectedUnitMaterials.filter((material) => material.assignedVendorDisplayName).slice(0, 3).map((material) => (
                        <div key={material.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-semibold text-slate-900">{material.itemDescription}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {material.assignedVendorDisplayName} • {titleCase(material.vendorActionState || 'assigned')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'vendor-completion',
                    'Vendor completion context',
                    'Recent vendor-completion and progress timestamps.',
                    <div className="space-y-3">
                      {selectedUnitMaterials.filter((material) => material.vendorCompletedAt || material.vendorActionUpdatedAt).slice(0, 3).map((material) => (
                        <div key={material.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-semibold text-slate-900">{material.itemDescription}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {titleCase(material.vendorActionState || 'unassigned')} • Updated {formatTimestamp(material.vendorActionUpdatedAt || material.vendorCompletedAt)}
                          </div>
                        </div>
                      ))}
                      <button onClick={() => openProcurementWithAttention('vendor', 'Opened from Unit Workspace • Vendor')} className="inline-flex items-center gap-2 text-sm font-medium text-lowes-blue">
                        Open Vendor Queue in Procurement
                        <ArrowRight size={14} />
                      </button>
                    </div>,
                    false
                  )}
                </div>
              ) : null}

              {activeTab === 'verification' ? (
                <div className="space-y-4" role="tabpanel" data-testid="unit-workspace-panel-verification">
                  {renderCollapsibleSection(
                    'verification-status',
                    'Receiving and verification status',
                    'What still needs to be checked before closeout.',
                    <div className="grid gap-4 md:grid-cols-5">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Pending receiving</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{selectedSignals.pendingReceivingCount}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Pending verification</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{selectedSignals.pendingVerificationCount}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Fulfilled</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{selectedSignals.fulfilledCount}</div>
                      </div>
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-rose-700">Verification failed</div>
                        <div className="mt-2 text-2xl font-bold text-rose-900">{selectedSignals.failedVerificationCount}</div>
                      </div>
                      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-violet-700">Rework required</div>
                        <div className="mt-2 text-2xl font-bold text-violet-900">{selectedSignals.reworkRequiredCount}</div>
                      </div>
                    </div>
                  )}
                  {renderCollapsibleSection(
                    'verification-details',
                    'Closeout summary',
                    'Internal receiving and verification remain in Procurement, but this tab keeps the unit context visible.',
                    <div className="space-y-3">
                      {selectedUnitMaterials.filter((material) => material.receivedAt || material.verifiedAt || material.vendorCompletedAt || (material.closeoutIssueState || 'none') !== 'none').slice(0, 4).map((material) => (
                        <div key={material.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-semibold text-slate-900">{material.itemDescription}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            Vendor completed {formatTimestamp(material.vendorCompletedAt)} • Received {formatTimestamp(material.receivedAt)} • Verified {formatTimestamp(material.verifiedAt)}
                          </div>
                          {(material.closeoutIssueState || 'none') !== 'none' ? (
                            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                              {titleCase(material.closeoutIssueState || 'none')}
                              {material.closeoutIssueNotes ? ` • ${material.closeoutIssueNotes}` : ''}
                            </div>
                          ) : null}
                          {material.correctionRoute ? (
                            <div
                              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${correctionRouteTone[material.correctionRoute]}`}
                            >
                              Correct via {titleCase(material.correctionRoute)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>,
                    false
                  )}
                  {renderCollapsibleSection(
                    'verification-actions',
                    'Verification actions',
                    'Use the existing procurement workflow for receiving and verification.',
                    <div className="grid gap-3 md:grid-cols-2">
                      <button onClick={() => openProcurementWithAttention('receiving', 'Opened from Unit Workspace • Receiving')} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white">
                        <div className="font-semibold text-slate-900">Open receiving queue</div>
                        <div className="mt-1 text-sm text-slate-500">Review this unit’s pending receiving items first.</div>
                      </button>
                      <button onClick={() => openProcurementWithAttention('verification', 'Opened from Unit Workspace • Verification')} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white">
                        <div className="font-semibold text-slate-900">Open verification queue</div>
                        <div className="mt-1 text-sm text-slate-500">Verify this unit’s completed work and close the procurement loop.</div>
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
};
