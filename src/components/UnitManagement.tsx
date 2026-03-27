import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FolderCog,
  Home,
  Layers3,
  ListChecks,
  Plus,
  Search,
  Star,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { CatalogItem } from '../core/models/types';
import { Inspection, Unit } from '../core/models/inspections';
import { ChecklistTemplate, LayoutChecklistMapping, LayoutTemplate } from '../core/models/templates';
import { Finding, MaterialRequirement, RepairTask } from '../core/models/operations';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';
import { CatalogService } from '../core/services/CatalogService';
import { ChecklistTemplateService } from '../core/services/ChecklistTemplateService';
import { ClientLoggerService } from '../core/services/ClientLoggerService';
import { DevSeedService, SeedSummary } from '../core/services/DevSeedService';
import { FindingService } from '../core/services/FindingService';
import { InspectionService } from '../core/services/InspectionService';
import { LayoutChecklistMappingService } from '../core/services/LayoutChecklistMappingService';
import { LayoutTemplateService } from '../core/services/LayoutTemplateService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { RepairTaskService } from '../core/services/RepairTaskService';
import { InspectionAttentionService } from '../core/services/InspectionAttentionService';
import { UnitService } from '../core/services/UnitService';
import { UnitLifecycleService } from '../core/services/UnitLifecycleService';
import { UnitRecordPanel } from './UnitRecordPanel';

interface UnitManagementProps {
  onOpenUnitWorkspace: (
    unitId: string,
    context?: {
      preferredTab?: 'overview' | 'inspection' | 'scope' | 'procurement' | 'vendor' | 'verification' | null;
      inspectionId?: string | null;
      scopeSection?: 'findings' | 'tasks' | 'materials' | null;
      scopeTarget?: {
        entityType: 'finding' | 'task' | 'material';
        entityId: string;
        originLabel?: string | null;
      } | null;
      reasonLabel?: string | null;
      reasonDetail?: string | null;
    }
  ) => void;
  onOpenUnitInspections: (unitId: string) => void;
  onOpenInspection: (
    inspectionId: string,
    scopeSection?: 'findings' | 'tasks' | 'materials',
    originContextLabel?: string,
    unitId?: string,
    scopeTarget?: {
      entityType: 'finding' | 'task' | 'material';
      entityId: string;
      originLabel?: string | null;
    }
  ) => void;
}

type InspectionStatusGroup = Inspection['status'];

interface BuildingGroup {
  label: string;
  key: string;
  units: Unit[];
}

interface FacilityGroup {
  label: string;
  key: string;
  buildings: BuildingGroup[];
}

type DetailMode = 'overview' | 'record';

interface UnitOperationalSignals {
  latestInspection: Inspection | null;
  latestInspectionStatus: Inspection['status'] | 'none';
  unresolvedFindingsCount: number;
  activeTasksCount: number;
  blockedTasksCount: number;
  materialRequirementsCount: number;
  needsAttention: boolean;
  healthLabel: 'active_work' | 'needs_attention' | 'clear' | 'complete';
  isComplete: boolean;
  lastInspectionAt?: number;
  lastActivityAt?: number;
  resumableInspection: Inspection | null;
  fallbackInspection: Inspection | null;
  priorityLabel: string;
  priorityDetail: string;
  priorityContext: ReturnType<typeof InspectionAttentionService.derivePriorityContext>;
}

interface UnitTemplateStatus {
  layout: LayoutTemplate | null;
  reason: 'assigned' | 'exact_shape' | 'full_bath_fallback' | 'same_bedroom_fallback' | 'fallback_first_active' | null;
  statusLabel: string;
  detail: string;
  chipClasses: string;
  canRepair: boolean;
}

const STATUS_ORDER: InspectionStatusGroup[] = ['in_progress', 'draft', 'completed'];

const STATUS_COPY: Record<InspectionStatusGroup, { title: string; description: string; classes: string }> = {
  in_progress: {
    title: 'In progress',
    description: 'Inspections currently being worked.',
    classes: 'bg-sky-100 text-sky-700',
  },
  draft: {
    title: 'Ready',
    description: 'Draft inspections ready for the next operational session.',
    classes: 'bg-amber-100 text-amber-700',
  },
  completed: {
    title: 'Completed',
    description: 'Finished inspections retained for historical review.',
    classes: 'bg-emerald-100 text-emerald-700',
  },
};

const normalizeLabel = (value?: string | null) => value?.trim() || '';

const inferFacilityName = (unit: Unit) => {
  if (normalizeLabel(unit.facilityName)) {
    return normalizeLabel(unit.facilityName);
  }
  if (normalizeLabel(unit.address1)) {
    return normalizeLabel(unit.address1).split(',')[0].trim() || 'Independent units';
  }
  if (unit.city || unit.state) {
    return [unit.city, unit.state].filter(Boolean).join(', ');
  }
  return 'Independent units';
};

const inferBuildingName = (unit: Unit) => {
  if (normalizeLabel(unit.buildingName)) {
    return normalizeLabel(unit.buildingName);
  }
  if (normalizeLabel(unit.address2)) {
    return normalizeLabel(unit.address2);
  }
  if (normalizeLabel(unit.unitCode)) {
    return `Unit code ${normalizeLabel(unit.unitCode)}`;
  }
  return 'General units';
};

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatDateTime = (timestamp?: number) => (timestamp ? new Date(timestamp).toLocaleString() : 'Not available');
const formatDate = (timestamp?: number) => (timestamp ? new Date(timestamp).toLocaleDateString() : 'Not available');

const matchesSearch = (unit: Unit, searchTerm: string) => {
  if (!searchTerm) return true;
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

const ensureExpanded = (groups: FacilityGroup[]) => {
  const next: Record<string, boolean> = {};
  groups.forEach((facility) => {
    next[facility.key] = true;
    facility.buildings.forEach((building) => {
      next[building.key] = true;
    });
  });
  return next;
};

const buildPortfolioExpandedStorageKey = (orgId: string) => `unitflip:portfolio:expanded:${orgId}`;
const buildPortfolioSelectedUnitStorageKey = (orgId: string) => `unitflip:portfolio:selected-unit:${orgId}`;

const getHealthPriority = (signals?: UnitOperationalSignals) => {
  if (!signals) return 99;
  if (signals.healthLabel === 'needs_attention') return 0;
  if (signals.healthLabel === 'active_work') return 1;
  if (signals.healthLabel === 'complete') return 3;
  return 2;
};

const getHealthCopy = (signals?: UnitOperationalSignals) => {
  if (!signals) {
    return {
      label: 'No active scope',
      classes: 'bg-emerald-100 text-emerald-700',
      summary: 'No unresolved findings, tasks, or materials.',
    };
  }

  if (signals.isComplete) {
    return {
      label: 'Unit complete',
      classes: 'bg-emerald-100 text-emerald-700',
      summary: 'Inspection, scope, procurement, vendor work, and verification are fully closed.',
    };
  }

  if (signals.healthLabel === 'needs_attention') {
    return {
      label: 'Needs attention',
      classes: 'bg-amber-100 text-amber-800',
      summary:
        signals.blockedTasksCount > 0
          ? `${signals.blockedTasksCount} blocked task${signals.blockedTasksCount === 1 ? '' : 's'} need review.`
          : `${signals.unresolvedFindingsCount} unresolved finding${signals.unresolvedFindingsCount === 1 ? '' : 's'} still need definition or follow-up.`,
    };
  }

  if (signals.healthLabel === 'active_work') {
    return {
      label: 'Active work',
      classes: 'bg-sky-100 text-sky-700',
      summary: 'Inspection or task execution is already in motion.',
    };
  }

  return {
    label: 'No active scope',
    classes: 'bg-emerald-100 text-emerald-700',
    summary: 'No unresolved findings, tasks, or materials.',
  };
};

const renderHighlightedText = (text: string, searchTerm: string) => {
  if (!searchTerm.trim()) return text;
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(matcher);

  return parts.map((part, index) =>
    part.toLowerCase() === searchTerm.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded bg-amber-100 px-0.5 text-slate-900">
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    )
  );
};

const buildWorkspaceAttentionContext = (signals?: UnitOperationalSignals) =>
  signals?.priorityContext
    ? {
        preferredTab: signals.priorityContext.unitTab,
        inspectionId: signals.latestInspection?.id || null,
        scopeSection: signals.priorityContext.scopeSection,
        scopeTarget: signals.priorityContext.scopeTarget,
        reasonLabel: signals.priorityContext.reasonLabel,
        reasonDetail: signals.priorityContext.reasonDetail,
      }
    : undefined;

const getTemplateStatusCopy = (status?: UnitTemplateStatus | null) => {
  if (!status || !status.layout) {
    return {
      statusLabel: 'Template missing',
      detail: 'No deterministic layout match is available yet. Open the unit record to assign one.',
      chipClasses: 'bg-red-100 text-red-700',
      canRepair: false,
    };
  }

  if (status.reason === 'assigned') {
    return {
      statusLabel: `Template ready • ${status.layout.name}`,
      detail: 'This unit already has a saved layout assignment that drives inspection room structure.',
      chipClasses: 'bg-emerald-100 text-emerald-700',
      canRepair: false,
    };
  }

  if (status.reason === 'exact_shape') {
    return {
      statusLabel: `Suggested template • ${status.layout.name}`,
      detail: 'This unit is missing an assigned template, but its bedroom and bathroom shape match this layout exactly.',
      chipClasses: 'bg-amber-100 text-amber-800',
      canRepair: true,
    };
  }

  if (status.reason === 'full_bath_fallback') {
    return {
      statusLabel: `Suggested template • ${status.layout.name}`,
      detail: 'This unit is missing an assigned template. The closest deterministic match uses the same bedrooms and full-bath count.',
      chipClasses: 'bg-amber-100 text-amber-800',
      canRepair: true,
    };
  }

  if (status.reason === 'same_bedroom_fallback') {
    return {
      statusLabel: `Suggested template • ${status.layout.name}`,
      detail: 'This unit is missing an assigned template. The safest deterministic fallback uses the only active layout for this bedroom count.',
      chipClasses: 'bg-amber-100 text-amber-800',
      canRepair: true,
    };
  }

  return {
    statusLabel: `Template fallback • ${status.layout.name}`,
    detail: 'No explicit or deterministic match exists yet. Focused Mode will still fall back to the first active layout if needed.',
    chipClasses: 'bg-slate-100 text-slate-700',
    canRepair: false,
  };
};

export const UnitManagement: React.FC<UnitManagementProps> = ({
  onOpenUnitWorkspace,
  onOpenUnitInspections,
  onOpenInspection,
}) => {
  const { org } = useAppContext();
  const { log } = useAuditLogger();
  const [units, setUnits] = useState<Unit[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<RepairTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [layouts, setLayouts] = useState<LayoutTemplate[]>([]);
  const [checklists, setChecklists] = useState<ChecklistTemplate[]>([]);
  const [mappings, setMappings] = useState<LayoutChecklistMapping[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [seedSummary, setSeedSummary] = useState<SeedSummary | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>('overview');

  useEffect(() => {
    if (!org) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [
          loadedUnits,
          loadedInspections,
          loadedFindings,
          loadedTasks,
          loadedMaterials,
          loadedLayouts,
          loadedChecklists,
          loadedMappings,
          loadedCatalogItems,
          loadedSeedSummary,
        ] = await Promise.all([
          UnitService.listUnits(org.id),
          InspectionService.listInspections(org.id),
          FindingService.listFindings(org.id),
          RepairTaskService.listTasks(org.id),
          MaterialRequirementService.listRequirements(org.id),
          LayoutTemplateService.listActive(org.id),
          ChecklistTemplateService.listActive(org.id),
          LayoutChecklistMappingService.listActive(org.id),
          CatalogService.getItems(org.id),
          DevSeedService.getSeedSummary(org.id),
        ]);

        const activeUnits = loadedUnits.filter((unit) => unit.status !== 'archived');
        setUnits(activeUnits);
        setInspections(loadedInspections);
        setFindings(loadedFindings);
        setTasks(loadedTasks);
        setMaterials(loadedMaterials);
        setLayouts(loadedLayouts);
        setChecklists(loadedChecklists);
        setMappings(loadedMappings);
        setCatalogItems(loadedCatalogItems);
        setSeedSummary(loadedSeedSummary);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [org, refreshNonce]);

  useEffect(() => {
    if (!org) return;

    const handleSeedRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ orgId?: string; action?: 'seeded' | 'cleared'; summary?: SeedSummary }>).detail;
      if (detail?.orgId !== org.id) return;
      setSearchTerm('');
      setExpandedGroups({});
      setSelectedUnitId(null);
      setDetailMode('overview');
      if (detail.summary) {
        setSeedSummary(detail.summary);
      }
      setRefreshNonce((current) => current + 1);
      ClientLoggerService.info('Unit Management refreshed after demo seed update.', {
        category: 'unit_management',
        eventType: 'unit_management.seed_refresh_completed',
        screen: 'UnitManagement',
        contextIds: { orgId: org.id },
        metadata: detail?.summary ? { ...detail.summary } : undefined,
      });
    };

    window.addEventListener(DevSeedService.REFRESH_EVENT, handleSeedRefresh as EventListener);
    return () => window.removeEventListener(DevSeedService.REFRESH_EVENT, handleSeedRefresh as EventListener);
  }, [org]);

  useEffect(() => {
    if (!org) return;
    try {
      const storedExpanded = window.localStorage.getItem(buildPortfolioExpandedStorageKey(org.id));
      if (storedExpanded) {
        setExpandedGroups(JSON.parse(storedExpanded) as Record<string, boolean>);
      }
      const storedSelectedUnitId = window.localStorage.getItem(buildPortfolioSelectedUnitStorageKey(org.id));
      if (storedSelectedUnitId) {
        setSelectedUnitId(storedSelectedUnitId);
      }
    } catch {
      // Ignore local UI persistence failures.
    }
  }, [org]);

  useEffect(() => {
    if (!org) return;
    try {
      window.localStorage.setItem(buildPortfolioExpandedStorageKey(org.id), JSON.stringify(expandedGroups));
    } catch {
      // Ignore local UI persistence failures.
    }
  }, [expandedGroups, org]);

  useEffect(() => {
    if (!org) return;
    try {
      if (selectedUnitId) {
        window.localStorage.setItem(buildPortfolioSelectedUnitStorageKey(org.id), selectedUnitId);
      } else {
        window.localStorage.removeItem(buildPortfolioSelectedUnitStorageKey(org.id));
      }
    } catch {
      // Ignore local UI persistence failures.
    }
  }, [org, selectedUnitId]);

  const inspectionsByUnitId = useMemo(() => {
    const next: Record<string, Inspection[]> = {};
    inspections.forEach((inspection) => {
      if (!next[inspection.unitId]) {
        next[inspection.unitId] = [];
      }
      next[inspection.unitId].push(inspection);
    });
    Object.values(next).forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [inspections]);

  const inspectionById = useMemo(
    () => new Map(inspections.map((inspection) => [inspection.id, inspection])),
    [inspections]
  );

  const findingsByUnitId = useMemo(() => {
    const next: Record<string, Finding[]> = {};
    findings.forEach((finding) => {
      if (!next[finding.unitId]) {
        next[finding.unitId] = [];
      }
      next[finding.unitId].push(finding);
    });
    Object.values(next).forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [findings]);

  const tasksByUnitId = useMemo(() => {
    const next: Record<string, RepairTask[]> = {};
    tasks.forEach((task) => {
      if (!next[task.unitId]) {
        next[task.unitId] = [];
      }
      next[task.unitId].push(task);
    });
    Object.values(next).forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [tasks]);

  const materialsByUnitId = useMemo(() => {
    const next: Record<string, MaterialRequirement[]> = {};
    materials.forEach((requirement) => {
      const inspection = inspectionById.get(requirement.inspectionId);
      if (!inspection) return;
      if (!next[inspection.unitId]) {
        next[inspection.unitId] = [];
      }
      next[inspection.unitId].push(requirement);
    });
    return next;
  }, [inspectionById, materials]);

  const operationalSignalsByUnitId = useMemo<Record<string, UnitOperationalSignals>>(() => {
    const next: Record<string, UnitOperationalSignals> = {};

    units.forEach((unit) => {
      const unitInspections = inspectionsByUnitId[unit.id] || [];
      const unitFindings = findingsByUnitId[unit.id] || [];
      const unitTasks = tasksByUnitId[unit.id] || [];
      const unitMaterials = materialsByUnitId[unit.id] || [];
      const lifecycle = UnitLifecycleService.deriveSignals(unit, unitInspections, unitFindings, unitTasks, unitMaterials);
      const attentionProjection = InspectionAttentionService.deriveUnitAttentionProjection(unitFindings, unitTasks, unitMaterials);

      next[unit.id] = {
        latestInspection: lifecycle.latestInspection,
        latestInspectionStatus: lifecycle.latestInspectionStatus,
        unresolvedFindingsCount: lifecycle.unresolvedFindingsCount,
        activeTasksCount: lifecycle.activeTasksCount,
        blockedTasksCount: lifecycle.blockedTasksCount,
        materialRequirementsCount: lifecycle.pendingMaterialsCount,
        needsAttention: lifecycle.needsAttention,
        healthLabel: lifecycle.healthLabel,
        isComplete: lifecycle.isComplete,
        lastInspectionAt: lifecycle.lastInspectionAt,
        lastActivityAt: lifecycle.lastActivityAt,
        resumableInspection: lifecycle.resumableInspection,
        fallbackInspection: lifecycle.latestInspection,
        priorityLabel: attentionProjection.priorityLabel,
        priorityDetail: attentionProjection.priorityDetail,
        priorityContext: attentionProjection.context,
      };
    });

    return next;
  }, [findingsByUnitId, inspectionsByUnitId, materialsByUnitId, tasksByUnitId, units]);

  const templateStatusByUnitId = useMemo<Record<string, UnitTemplateStatus>>(() => {
    const next: Record<string, UnitTemplateStatus> = {};
    units.forEach((unit) => {
      const resolved = UnitService.resolveTemplateForUnit(unit, layouts);
      const copy = getTemplateStatusCopy(
        resolved.layout
          ? {
              layout: resolved.layout,
              reason: resolved.reason,
              statusLabel: '',
              detail: '',
              chipClasses: '',
              canRepair: false,
            }
          : null
      );
      next[unit.id] = {
        layout: resolved.layout,
        reason: resolved.reason,
        ...copy,
      };
    });
    return next;
  }, [layouts, units]);

  const checklistLookup = useMemo(
    () => Object.fromEntries(checklists.map((template) => [template.id, template])),
    [checklists]
  );

  const resolvedChecklistByLayoutId = useMemo(() => {
    const byLayoutId: Record<string, string | undefined> = {};
    layouts.forEach((layout) => {
      const mapping = mappings.find((candidate) => candidate.layoutTemplateId === layout.id);
      byLayoutId[layout.id] = mapping?.checklistTemplateId || layout.defaultChecklistTemplateId || undefined;
    });
    return byLayoutId;
  }, [layouts, mappings]);

  const statusGroups = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        inspections: inspections.filter((inspection) => inspection.status === status),
      })),
    [inspections]
  );

  const filteredUnits = useMemo(
    () => units.filter((unit) => matchesSearch(unit, searchTerm)),
    [searchTerm, units]
  );

  const facilityGroups = useMemo<FacilityGroup[]>(() => {
    const facilities = new Map<string, Map<string, Unit[]>>();
    filteredUnits.forEach((unit) => {
      const facilityLabel = inferFacilityName(unit);
      const buildingLabel = inferBuildingName(unit);
      if (!facilities.has(facilityLabel)) {
        facilities.set(facilityLabel, new Map<string, Unit[]>());
      }
      const buildings = facilities.get(facilityLabel)!;
      const buildingUnits = buildings.get(buildingLabel) || [];
      buildingUnits.push(unit);
      buildings.set(buildingLabel, buildingUnits);
    });

    return Array.from(facilities.entries())
      .map(([facilityLabel, buildings]) => ({
        label: facilityLabel,
        key: `facility:${facilityLabel}`,
        buildings: Array.from(buildings.entries())
          .map(([buildingLabel, groupedUnits]) => ({
            label: buildingLabel,
            key: `facility:${facilityLabel}|building:${buildingLabel}`,
            units: groupedUnits.sort((a, b) => {
              const priorityDifference =
                getHealthPriority(operationalSignalsByUnitId[a.id]) - getHealthPriority(operationalSignalsByUnitId[b.id]);
              if (priorityDifference !== 0) {
                return priorityDifference;
              }
              return a.name.localeCompare(b.name);
            }),
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredUnits, operationalSignalsByUnitId]);

  useEffect(() => {
    setExpandedGroups((current) => {
      const defaults = ensureExpanded(facilityGroups);
      return { ...defaults, ...current };
    });
  }, [facilityGroups]);

  const selectedUnit = useMemo(
    () => filteredUnits.find((unit) => unit.id === selectedUnitId) || units.find((unit) => unit.id === selectedUnitId) || null,
    [filteredUnits, selectedUnitId, units]
  );

  useEffect(() => {
    if (selectedUnitId && units.some((unit) => unit.id === selectedUnitId)) {
      return;
    }
    setSelectedUnitId(filteredUnits[0]?.id || units[0]?.id || null);
  }, [filteredUnits, selectedUnitId, units]);

  useEffect(() => {
    setDetailMode('overview');
  }, [selectedUnitId]);

  const totalActiveInspections = inspections.filter((inspection) => inspection.status !== 'completed').length;
  const seededUnitCount = units.filter((unit) => unit.seedMarker?.isSeedData).length;
  const unitsNeedingAttention = units.filter((unit) => operationalSignalsByUnitId[unit.id]?.needsAttention).length;
  const highestPriorityUnit = useMemo(
    () =>
      filteredUnits
        .slice()
        .sort((a, b) => {
          const signalA = operationalSignalsByUnitId[a.id];
          const signalB = operationalSignalsByUnitId[b.id];
          const priorityDifference = getHealthPriority(signalA) - getHealthPriority(signalB);
          if (priorityDifference !== 0) return priorityDifference;
          return (signalB?.lastActivityAt || 0) - (signalA?.lastActivityAt || 0);
        })[0] || null,
    [filteredUnits, operationalSignalsByUnitId]
  );

  const handleSaveUnit = async (updatedUnit: Unit) => {
    if (!org) return;
    const normalized: Unit = {
      ...updatedUnit,
      name: updatedUnit.name.trim() || updatedUnit.name,
      facilityName: normalizeLabel(updatedUnit.facilityName) || undefined,
      buildingName: normalizeLabel(updatedUnit.buildingName) || undefined,
      unitCode: normalizeLabel(updatedUnit.unitCode) || undefined,
      address1: normalizeLabel(updatedUnit.address1) || undefined,
      address2: normalizeLabel(updatedUnit.address2) || undefined,
      city: normalizeLabel(updatedUnit.city) || undefined,
      state: normalizeLabel(updatedUnit.state) || undefined,
      zip: normalizeLabel(updatedUnit.zip) || undefined,
      notes: normalizeLabel(updatedUnit.notes) || undefined,
      assignedLayoutTemplateId: updatedUnit.assignedLayoutTemplateId || null,
      favoriteProductIds: updatedUnit.favoriteProductIds || [],
      managementData: updatedUnit.managementData
        ? {
            ...updatedUnit.managementData,
            applianceLogs: updatedUnit.managementData.applianceLogs || [],
            maintenanceHistory: updatedUnit.managementData.maintenanceHistory || [],
            warrantyInfo: updatedUnit.managementData.warrantyInfo || [],
            keyLog: updatedUnit.managementData.keyLog || [],
            physicalDetails: updatedUnit.managementData.physicalDetails
              ? {
                  ...updatedUnit.managementData.physicalDetails,
                  floorPlanNotes: normalizeLabel(updatedUnit.managementData.physicalDetails.floorPlanNotes) || undefined,
                  roomMeasurements: updatedUnit.managementData.physicalDetails.roomMeasurements || [],
                  windowSizes: updatedUnit.managementData.physicalDetails.windowSizes || [],
                  doorWidthsIn: updatedUnit.managementData.physicalDetails.doorWidthsIn || [],
                }
              : undefined,
          }
        : undefined,
    };

    await UnitService.updateUnit(org.id, normalized);
    setUnits((current) =>
      current
        .map((unit) => (unit.id === normalized.id ? { ...normalized, updatedAt: Date.now() } : unit))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
    log('UNIT_UPDATED', {
      entityId: normalized.id,
      message: `Updated unit record: ${normalized.name}`,
      metadata: {
        assignedLayoutTemplateId: normalized.assignedLayoutTemplateId,
        favoriteCount: normalized.favoriteProductIds?.length || 0,
      },
    });
    ClientLoggerService.info('Unit management section saved.', {
      category: 'unit_management',
      eventType: 'unit_management.section_saved',
      screen: 'UnitManagement',
      contextIds: { orgId: org.id, unitId: normalized.id },
      metadata: {
        assignedLayoutTemplateId: normalized.assignedLayoutTemplateId,
        favoriteCount: normalized.favoriteProductIds?.length || 0,
        maintenanceHistoryCount: normalized.managementData?.maintenanceHistory?.length || 0,
        applianceLogCount: normalized.managementData?.applianceLogs?.length || 0,
      },
    });
  };

  const handleApplySuggestedTemplate = async (unit: Unit) => {
    if (!org) return;
    const templateStatus = templateStatusByUnitId[unit.id];
    if (!templateStatus?.layout || !templateStatus.canRepair) return;

    const normalizedUnit: Unit = {
      ...unit,
      assignedLayoutTemplateId: templateStatus.layout.id,
    };

    await handleSaveUnit(normalizedUnit);
    setSelectedUnitId(unit.id);
    setDetailMode('overview');
  };

  const selectedUnitInspections = selectedUnit ? inspectionsByUnitId[selectedUnit.id] || [] : [];
  const selectedUnitSignals = selectedUnit ? operationalSignalsByUnitId[selectedUnit.id] : undefined;
  const selectedUnitTemplateStatus = selectedUnit ? templateStatusByUnitId[selectedUnit.id] : null;

  const handleSelectUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    setDetailMode('overview');
  };

  const handleOpenScopeSection = (section: 'findings' | 'tasks' | 'materials') => {
    if (!selectedUnitSignals?.latestInspection) return;
    const scopedTarget =
      selectedUnitSignals.priorityContext?.scopeSection === section ? selectedUnitSignals.priorityContext.scopeTarget : null;
    onOpenInspection(
      selectedUnitSignals.latestInspection.id,
      section,
      `Opened from Portfolio • ${titleCase(section)}`,
      selectedUnit?.id,
      scopedTarget || undefined
    );
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Portfolio</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Browse units and decide where work should happen next.</h1>
            <p className="mt-3 text-sm text-slate-600">
              Navigate the facility hierarchy, scan operational signals, and route directly into the existing
              inspection and scope review flows. Use Inspection to do the work, and use Portfolio to decide where
              to go next.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white/70 px-4 py-3 text-sm text-slate-600">
            Search across facilities, buildings, and units to route directly into existing inspection and scope review.
          </div>
        </div>
        {highestPriorityUnit ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">
              {unitsNeedingAttention} unit{unitsNeedingAttention === 1 ? '' : 's'} need attention.
            </span>{' '}
            <span>
              Start with {highestPriorityUnit.name}: {operationalSignalsByUnitId[highestPriorityUnit.id]?.priorityLabel}
              {operationalSignalsByUnitId[highestPriorityUnit.id]?.priorityDetail
                ? ` • ${operationalSignalsByUnitId[highestPriorityUnit.id]?.priorityDetail}`
                : ''}
              .
            </span>
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Units</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{units.length}</div>
          <p className="mt-2 text-sm text-slate-500">Active unit records available for setup and review.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Facilities</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{facilityGroups.length}</div>
          <p className="mt-2 text-sm text-slate-500">Grouped hierarchy for quick scanning across buildings and units.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Needs attention</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{unitsNeedingAttention}</div>
          <p className="mt-2 text-sm text-slate-500">Units with open findings, active tasks, or pending materials.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active inspections</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{totalActiveInspections}</div>
          <p className="mt-2 text-sm text-slate-500">Draft and in-progress inspections available for resume.</p>
        </div>
      </section>

      {seededUnitCount > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-amber-900">
            {seededUnitCount} demo unit record{seededUnitCount === 1 ? '' : 's'} are currently loaded. Demo records are marked and can be cleared from Feedback Management.
          </p>
          {seedSummary ? (
            <p className="mt-1 text-xs text-amber-800">
              Seed batch {seedSummary.seedBatch}: {seedSummary.facilities} facilities, {seedSummary.buildings} buildings, {seedSummary.seededInspections} seeded inspections.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Inspection lifecycle review</h2>
          <p className="mt-1 text-sm text-slate-500">
            Review workload and historical status from management context without entering the live capture workflow.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {statusGroups.map(({ status, inspections: grouped }) => (
            <div key={status} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{STATUS_COPY[status].title}</div>
                  <div className="mt-1 text-xs text-slate-500">{STATUS_COPY[status].description}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_COPY[status].classes}`}>
                  {grouped.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {grouped.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    No inspections in this status.
                  </div>
                ) : (
                  grouped.slice(0, 4).map((inspection) => (
                    <div key={inspection.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-slate-900">{inspection.title}</div>
                        {inspection.seedMarker?.isSeedData ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Demo
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{titleCase(inspection.status)}</div>
                      <div className="mt-3 inline-flex items-center gap-1 text-xs text-lowes-blue">
                        <ClipboardList size={13} />
                        Updated {new Date(inspection.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Portfolio explorer</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Search the full hierarchy and jump into the next unit that needs operational attention.
                </p>
              </div>
            </div>

            <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search size={16} className="text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search facilities, buildings, units, or addresses"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>

            <div className="mt-5 space-y-4">
              {isLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  Loading units, inspections, templates, and favorites...
                </div>
              ) : facilityGroups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <Building2 size={40} className="mx-auto text-slate-300" />
                  <p className="mt-4 text-sm text-slate-600">
                    {searchTerm ? 'No units match this search yet.' : 'No portfolio records are available yet.'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {searchTerm
                      ? 'Clear the current search to show the full portfolio again.'
                      : 'Load demo data from Feedback Management to see the full seeded portfolio in this environment.'}
                  </p>
                </div>
              ) : (
                <>
                  {!searchTerm ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      Showing the full portfolio: {facilityGroups.length} facilities • {filteredUnits.length} visible units.
                    </div>
                  ) : null}
                  {facilityGroups.map((facility) => {
                  const facilityUnitCount = facility.buildings.reduce((total, building) => total + building.units.length, 0);
                  const facilityAttentionCount = facility.buildings.reduce(
                    (total, building) =>
                      total + building.units.filter((unit) => operationalSignalsByUnitId[unit.id]?.needsAttention).length,
                    0
                  );
                  const isFacilityExpanded = searchTerm ? true : expandedGroups[facility.key] ?? true;

                  return (
                    <div key={facility.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <button
                        onClick={() =>
                          setExpandedGroups((current) => ({ ...current, [facility.key]: !isFacilityExpanded }))
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white"
                      >
                        <div className="flex items-center gap-3">
                          {isFacilityExpanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                          <div className="rounded-xl bg-white p-2 text-emerald-700">
                            <Building2 size={16} />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{renderHighlightedText(facility.label, searchTerm)}</div>
                            <div className="text-xs text-slate-500">
                              {facility.buildings.length} building groups • {facilityUnitCount} units
                              {facilityAttentionCount > 0 ? ` • ${facilityAttentionCount} need attention` : ''}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isFacilityExpanded ? (
                        <div className="mt-3 space-y-3">
                          {facility.buildings.map((building) => {
                            const buildingAttentionCount = building.units.filter(
                              (unit) => operationalSignalsByUnitId[unit.id]?.needsAttention
                            ).length;
                            const isBuildingExpanded = searchTerm ? true : expandedGroups[building.key] ?? true;
                            return (
                              <div key={building.key} className="rounded-xl border border-slate-200 bg-white p-3">
                                <button
                                  onClick={() =>
                                    setExpandedGroups((current) => ({
                                      ...current,
                                      [building.key]: !isBuildingExpanded,
                                    }))
                                  }
                                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50"
                                >
                                  <div className="flex items-center gap-3">
                                    {isBuildingExpanded ? (
                                      <ChevronDown size={15} className="text-slate-400" />
                                    ) : (
                                      <ChevronRight size={15} className="text-slate-400" />
                                    )}
                                    <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                                      <Home size={15} />
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-slate-900">{renderHighlightedText(building.label, searchTerm)}</div>
                                      <div className="text-xs text-slate-500">
                                        {building.units.length} units
                                        {buildingAttentionCount > 0 ? ` • ${buildingAttentionCount} need attention` : ''}
                                      </div>
                                    </div>
                                  </div>
                                </button>

                                {isBuildingExpanded ? (
                                  <div className="mt-3 space-y-2">
                                    {building.units.map((unit) => {
                                      const signals = operationalSignalsByUnitId[unit.id];
                                      const templateStatus = templateStatusByUnitId[unit.id];
                                      const latestInspection = signals?.latestInspection;
                                      const healthCopy = getHealthCopy(signals);
                                      const hasDirectMatch = Boolean(searchTerm.trim());
                                      const isSelected = selectedUnitId === unit.id;
                                      return (
                                        <button
                                          key={unit.id}
                                          onClick={() => handleSelectUnit(unit.id)}
                                          className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                            isSelected
                                              ? 'border-lowes-blue bg-blue-50'
                                              : hasDirectMatch
                                                ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-medium text-slate-900">{renderHighlightedText(unit.name, searchTerm)}</div>
                                                {unit.seedMarker?.isSeedData ? (
                                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                                    Demo
                                                  </span>
                                                ) : null}
                                              </div>
                                              <div className="mt-1 text-xs text-slate-500">
                                                {renderHighlightedText(
                                                  [unit.unitCode, unit.address1, unit.city].filter(Boolean).join(' • ') || 'Details not set yet',
                                                  searchTerm
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${healthCopy.classes}`}>
                                                {healthCopy.label}
                                              </span>
                                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                                {(inspectionsByUnitId[unit.id] || []).length} inspections
                                              </span>
                                            </div>
                                          </div>
                                          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                        <span>
                                          {signals?.unresolvedFindingsCount || 0} findings • {signals?.activeTasksCount || 0} tasks •{' '}
                                          {signals?.materialRequirementsCount || 0} materials
                                        </span>
                                        <span className="font-medium text-slate-700">
                                          {latestInspection ? titleCase(latestInspection.status) : 'No inspections yet'}
                                        </span>
                                      </div>
                                      {signals ? (
                                        <div className="mt-2 text-xs text-slate-600">
                                          <span className="font-semibold text-slate-800">{signals.priorityLabel}</span>
                                          {signals.priorityDetail ? ` • ${signals.priorityDetail}` : ''}
                                        </div>
                                      ) : null}
                                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                        <span className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${templateStatus?.chipClasses || 'bg-slate-100 text-slate-700'}`}>
                                          {templateStatus?.layout ? templateStatus.statusLabel : 'Template missing'}
                                        </span>
                                        {templateStatus?.reason && templateStatus.reason !== 'assigned' ? (
                                          <span className="text-slate-500">
                                            {templateStatus.reason === 'fallback_first_active'
                                              ? 'Legacy unit still needs a saved template.'
                                              : 'Legacy unit can be repaired from unit specs.'}
                                          </span>
                                        ) : null}
                                      </div>
                                    </button>
                                  );
                                })}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Explorer boundaries</h2>
              <p className="mt-1 text-sm text-slate-500">
                Portfolio is for navigation, summary, and routing. It is not a second inspection or scope editor.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <FolderCog size={20} className="text-slate-700" />
                <div className="mt-3 font-semibold text-slate-900">Navigation first</div>
                <p className="mt-2 text-sm text-slate-500">Use the hierarchy to decide what needs attention before entering live work.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Layers3 size={20} className="text-slate-700" />
                <div className="mt-3 font-semibold text-slate-900">Scope review handoff</div>
                <p className="mt-2 text-sm text-slate-500">Jump directly into findings, tasks, or materials through the existing inspection detail flow.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Star size={20} className="text-slate-700" />
                <div className="mt-3 font-semibold text-slate-900">Simple signals</div>
                <p className="mt-2 text-sm text-slate-500">Counts and status keep the explorer readable without turning it into a dashboard.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Wrench size={20} className="text-slate-700" />
                <div className="mt-3 font-semibold text-slate-900">Record management stays separate</div>
                <p className="mt-2 text-sm text-slate-500">If you need to edit unit defaults, open the record view intentionally instead of mixing it into navigation.</p>
              </div>
            </div>
          </section>
        </div>

        {detailMode === 'record' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div>
                <div className="text-sm font-semibold text-slate-900">Unit record management</div>
                <div className="mt-1 text-xs text-slate-500">Editing is kept separate from the explorer summary so navigation stays clean.</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailMode('overview')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <ChevronRight size={16} className="rotate-180" />
                Back to Portfolio
              </button>
            </div>
            <UnitRecordPanel
              unit={selectedUnit}
              inspections={selectedUnitInspections}
              layouts={layouts}
              checklistLookup={checklistLookup}
              resolvedChecklistByLayoutId={resolvedChecklistByLayoutId}
              catalogItems={catalogItems}
              onSaveUnit={handleSaveUnit}
              onOpenInspectionQueue={onOpenUnitInspections}
              onOpenInspection={(inspectionId) => onOpenInspection(inspectionId, undefined, undefined, selectedUnit?.id)}
            />
          </div>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {selectedUnit ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Selected Unit</p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-900">{selectedUnit.name}</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {[
                        selectedUnit.unitCode || null,
                        inferBuildingName(selectedUnit),
                        inferFacilityName(selectedUnit),
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenUnitInspections(selectedUnit.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                      <Plus size={16} />
                      Start Inspection
                    </button>
                    <button
                      type="button"
                      disabled={!selectedUnitSignals?.resumableInspection && !selectedUnitSignals?.fallbackInspection}
                        onClick={() => {
                          const targetInspection =
                            selectedUnitSignals?.resumableInspection || selectedUnitSignals?.fallbackInspection || null;
                          if (!targetInspection) return;
                          onOpenInspection(
                            targetInspection.id,
                            selectedUnitSignals?.priorityContext?.inspectionId === targetInspection.id
                              ? selectedUnitSignals.priorityContext.scopeSection
                              : undefined,
                            selectedUnitSignals?.resumableInspection
                              ? 'Opened from Portfolio • Resume'
                              : 'Opened from Portfolio • Latest inspection',
                            selectedUnit.id,
                            selectedUnitSignals?.priorityContext?.inspectionId === targetInspection.id
                              ? selectedUnitSignals.priorityContext.scopeTarget
                              : undefined
                          );
                        }}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ClipboardList size={16} />
                      {selectedUnitSignals?.resumableInspection ? 'Resume Inspection' : 'Open Latest Inspection'}
                    </button>
                  </div>
                </div>

                {selectedUnitSignals ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Health state</div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getHealthCopy(selectedUnitSignals).classes}`}>
                          {getHealthCopy(selectedUnitSignals).label}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                          Inspection {selectedUnitSignals.latestInspection ? titleCase(selectedUnitSignals.latestInspection.status) : 'not started'}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{getHealthCopy(selectedUnitSignals).summary}</p>
                      <div
                        data-testid="portfolio-priority-summary"
                        className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                      >
                        <span className="font-semibold">{selectedUnitSignals.priorityLabel}</span>
                        {selectedUnitSignals.priorityDetail ? ` • ${selectedUnitSignals.priorityDetail}` : ''}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Routing status</div>
                      <div className="mt-3 text-sm text-slate-700">
                        {selectedUnitSignals.resumableInspection
                          ? 'Resume will reopen the latest active inspection session.'
                          : selectedUnitSignals.fallbackInspection
                            ? 'No active inspection is resumable, so the latest inspection opens in review mode.'
                            : 'No inspection exists yet. Start Inspection creates the first operational path.'}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Layers3 size={18} />
                      <h3 className="text-sm font-semibold">Layout template status</h3>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span
                        data-testid="portfolio-template-status"
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${selectedUnitTemplateStatus?.chipClasses || 'bg-red-100 text-red-700'}`}
                      >
                        {selectedUnitTemplateStatus?.layout ? selectedUnitTemplateStatus.statusLabel : 'Template missing'}
                      </span>
                      {selectedUnitTemplateStatus?.layout ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                          {selectedUnitTemplateStatus.layout.bedrooms} bed /{' '}
                          {selectedUnitTemplateStatus.layout.bathroomsFull + selectedUnitTemplateStatus.layout.bathroomsHalf * 0.5} bath
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      {selectedUnitTemplateStatus?.detail ||
                        'This unit does not have a saved layout assignment yet. Open the record to assign one before relying on template-backed inspections.'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedUnit && selectedUnitTemplateStatus?.canRepair ? (
                        <button
                          data-testid="portfolio-apply-suggested-template"
                          type="button"
                          onClick={() => void handleApplySuggestedTemplate(selectedUnit)}
                          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                        >
                          <Layers3 size={16} />
                          Apply Suggested Template
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDetailMode('record')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <FolderCog size={16} />
                        {selectedUnitTemplateStatus?.layout ? 'Review Template Assignment' : 'Assign Template in Record'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Activity size={18} />
                      <h3 className="text-sm font-semibold">Unit health snapshot</h3>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getHealthCopy(selectedUnitSignals).classes}`}>
                        {getHealthCopy(selectedUnitSignals).label}
                      </span>
                      {selectedUnitSignals?.needsAttention ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                          <TriangleAlert size={12} />
                          Attention needed
                        </span>
                      ) : null}
                      {selectedUnitSignals?.isComplete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                          Unit complete
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-slate-700">
                      <div>{selectedUnitSignals?.unresolvedFindingsCount || 0} open findings</div>
                      <div>{selectedUnitSignals?.activeTasksCount || 0} active tasks</div>
                      <div>{selectedUnitSignals?.materialRequirementsCount || 0} materials needed</div>
                      <div>
                        Last inspection:{' '}
                        <span className="font-medium text-slate-900">
                          {selectedUnitSignals?.latestInspection
                            ? titleCase(selectedUnitSignals.latestInspection.status)
                            : 'No inspections yet'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Clock3 size={18} />
                      <h3 className="text-sm font-semibold">Last activity</h3>
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last inspection date</div>
                        <div className="mt-1 text-slate-900">{formatDate(selectedUnitSignals?.lastInspectionAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated</div>
                        <div className="mt-1 text-slate-900">{formatDateTime(selectedUnitSignals?.lastActivityAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest inspection status</div>
                        <div className="mt-1 text-slate-900">
                          {selectedUnitSignals?.latestInspection ? titleCase(selectedUnitSignals.latestInspection.status) : 'No inspections yet'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 text-slate-800">
                    <ListChecks size={18} />
                    <h3 className="text-sm font-semibold">Operational routing</h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Open existing flows from the latest inspection context without creating a new workflow surface.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => selectedUnit && onOpenUnitWorkspace(selectedUnit.id, buildWorkspaceAttentionContext(selectedUnitSignals))}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <Activity size={16} />
                      Open Unit Workspace
                    </button>
                    <button
                      type="button"
                      disabled={!selectedUnitSignals?.latestInspection}
                      onClick={() => handleOpenScopeSection('findings')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ClipboardList size={16} />
                      View Findings
                    </button>
                    <button
                      type="button"
                      disabled={!selectedUnitSignals?.latestInspection}
                      onClick={() => handleOpenScopeSection('tasks')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Wrench size={16} />
                      View Tasks
                    </button>
                    <button
                      type="button"
                      disabled={!selectedUnitSignals?.latestInspection}
                      onClick={() => handleOpenScopeSection('materials')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Layers3 size={16} />
                      View Materials
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailMode('record')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <FolderCog size={16} />
                      Manage Record
                    </button>
                  </div>
                  {!selectedUnitSignals?.latestInspection ? (
                    <p className="mt-4 text-xs text-slate-500">
                      No inspection context exists yet for this unit. Start an inspection first to open findings, tasks, or materials.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <Home size={42} className="text-slate-300" />
                <h2 className="mt-4 text-xl font-semibold text-slate-900">Select a unit in the portfolio</h2>
                <p className="mt-2 max-w-md text-sm text-slate-500">
                  Choose a facility, building, and unit on the left to review health signals and route into the existing
                  inspection or scope workflows.
                </p>
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
};
