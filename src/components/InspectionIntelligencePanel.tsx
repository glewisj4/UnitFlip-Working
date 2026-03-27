import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Hammer,
  Layers3,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Inspection } from '../core/models/inspections';
import { PhotoAsset } from '../core/models/media';
import { CatalogItem, ProductInstance } from '../core/models/types';
import {
  FINDING_CATEGORIES,
  FINDING_PRIORITIES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  Finding,
  FindingCategory,
  InspectionOperationalSummary,
  MaterialRequirement,
  REPAIR_TASK_STATUSES,
  RepairTask,
  TRADE_OPTIONS,
} from '../core/models/operations';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';
import { useCatalog } from '../core/hooks/useCatalog';
import { AuthPolicyService } from '../core/services/AuthPolicyService';
import { CatalogService } from '../core/services/CatalogService';
import { ClientLoggerService } from '../core/services/ClientLoggerService';
import { FindingService } from '../core/services/FindingService';
import { InspectionIntelligenceService } from '../core/services/InspectionIntelligenceService';
import { InspectionAttentionService, InspectionAttentionBucketKey } from '../core/services/InspectionAttentionService';
import { MaterialMatchingService } from '../core/services/MaterialMatchingService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { ProductInstanceService } from '../core/services/ProductInstanceService';
import { ProductRecommendationResult, ProductRecommendationService } from '../core/services/ProductRecommendationService';
import { createInspectionOperationalSummary } from '../core/services/InspectionReportSnapshotService';
import { RepairTaskService } from '../core/services/RepairTaskService';
import { UnitService } from '../core/services/UnitService';
import { ProductRecommendationPanel } from './ProductRecommendationPanel';

interface InspectionIntelligencePanelProps {
  inspection: Inspection;
  photos: PhotoAsset[];
  previews: Record<string, string>;
  refreshToken?: number;
  initialFocusSection?: 'findings' | 'tasks' | 'materials' | null;
  focusedScopeRecord?: {
    entityType: 'finding' | 'task' | 'material';
    entityId: string;
    token: number;
    originLabel?: string | null;
  } | null;
  onOpenProcurement?: (options?: { unitId?: string; focus?: 'all' | 'procurement' | 'vendor' | 'receiving' | 'verification' }) => void;
  onOpenUnitWorkspace?: (
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
}

interface FindingDraft {
  area: string;
  category: FindingCategory;
  severity: Finding['severity'];
  priority: Finding['priority'];
  status: Finding['status'];
  description: string;
  notes: string;
  recommendedTrade: Finding['recommendedTrade'];
  photoIds: string[];
}

const createDefaultDraft = (): FindingDraft => ({
  area: '',
  category: 'general',
  severity: 'moderate',
  priority: 'medium',
  status: 'open',
  description: '',
  notes: '',
  recommendedTrade: 'general',
  photoIds: [],
});

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const readinessStyles: Record<InspectionOperationalSummary['scopeReadiness']['stage'], string> = {
  needs_findings: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_tasks: 'bg-blue-50 text-blue-700 border-blue-200',
  ready_for_materials: 'bg-violet-50 text-violet-700 border-violet-200',
  ready_for_report: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const buildFindingRecommendationKey = (finding: Finding) => `finding:${finding.id}:${finding.updatedAt}`;
const buildTaskRecommendationKey = (task: RepairTask) => `task:${task.id}:${task.updatedAt}`;
const buildMaterialRecommendationKey = (requirement: MaterialRequirement) =>
  `material_requirement:${requirement.id}:${requirement.updatedAt}`;

const compactCountLabel = (count: number, singular: string, plural?: string) =>
  `${count} ${count === 1 ? singular : plural || `${singular}s`}`;

interface AttentionBucketDefinition {
  key: InspectionAttentionBucketKey;
  label: string;
  summaryTone: string;
}

const ATTENTION_BUCKETS: Record<InspectionAttentionBucketKey, AttentionBucketDefinition> = {
  attention: {
    key: 'attention',
    label: 'Needs Attention',
    summaryTone: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  background: {
    key: 'background',
    label: 'Completed / Non-Blocking',
    summaryTone: 'border-slate-200 bg-slate-50 text-slate-700',
  },
};

const buildGroupedRows = <T,>(
  items: T[],
  getBucketKey: (item: T) => InspectionAttentionBucketKey,
  getGroupKey: (item: T) => string,
  getGroupLabel: (item: T) => string
) => {
  const groupCounts = new Map<string, number>();
  items.forEach((item) => {
    const key = getGroupKey(item);
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  });

  return items.map((item, index) => {
    const bucketKey = getBucketKey(item);
    const key = getGroupKey(item);
    const previousBucketKey = index > 0 ? getBucketKey(items[index - 1]) : null;
    const previousKey = index > 0 ? getGroupKey(items[index - 1]) : null;
    return {
      item,
      bucketKey,
      bucketLabel: ATTENTION_BUCKETS[bucketKey].label,
      showBucketHeader: bucketKey !== previousBucketKey,
      groupKey: key,
      groupLabel: getGroupLabel(item),
      groupCount: groupCounts.get(key) || 1,
      showGroupHeader: key !== previousKey,
      compressMetadata: key === previousKey && bucketKey === previousBucketKey,
    };
  });
};

export const InspectionIntelligencePanel: React.FC<InspectionIntelligencePanelProps> = ({
  inspection,
  photos,
  previews,
  refreshToken = 0,
  initialFocusSection = null,
  focusedScopeRecord = null,
  onOpenProcurement,
  onOpenUnitWorkspace,
}) => {
  const { org, user, role, permissions } = useAppContext();
  const { log } = useAuditLogger();
  const { addCatalogItemToList } = useCatalog();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<RepairTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [catalogLibrary, setCatalogLibrary] = useState<CatalogItem[]>([]);
  const [productInstances, setProductInstances] = useState<ProductInstance[]>([]);
  const [unitFavoriteProductIds, setUnitFavoriteProductIds] = useState<string[]>([]);
  const [materialMatchCandidates, setMaterialMatchCandidates] = useState<Record<string, string[]>>({});
  const [summary, setSummary] = useState<InspectionOperationalSummary>(() =>
    createInspectionOperationalSummary(inspection, [], [], [])
  );
  const [draft, setDraft] = useState<FindingDraft>(createDefaultDraft);
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  const [isSavingFinding, setIsSavingFinding] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [isGeneratingMaterials, setIsGeneratingMaterials] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedRecordKey, setHighlightedRecordKey] = useState<string | null>(null);
  const [localFocusedScopeRecord, setLocalFocusedScopeRecord] = useState<{
    entityType: 'finding' | 'task' | 'material';
    entityId: string;
    token: number;
    originLabel?: string | null;
  } | null>(null);
  const recommendationLogKeysRef = useRef<Set<string>>(new Set());
  const findingsSectionRef = useRef<HTMLDivElement | null>(null);
  const tasksSectionRef = useRef<HTMLDivElement | null>(null);
  const materialsSectionRef = useRef<HTMLDivElement | null>(null);
  const findingRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const taskRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const materialRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeFocusedScopeRecord = localFocusedScopeRecord || focusedScopeRecord;

  useEffect(() => {
    if (org) {
      void loadData();
    }
  }, [org, inspection.id, refreshToken]);

  useEffect(() => {
    const handleInstanceAdded = (event: Event) => {
      const detail = (event as CustomEvent<ProductInstance>).detail;
      if (detail.listRef.kind !== 'inspection' || detail.listRef.id !== inspection.id) return;
      setProductInstances((current) => {
        if (current.some((instance) => instance.id === detail.id)) {
          return current;
        }
        return [...current, detail];
      });
    };

    window.addEventListener('product-instance-added', handleInstanceAdded as EventListener);
    return () => window.removeEventListener('product-instance-added', handleInstanceAdded as EventListener);
  }, [inspection.id]);

  const loadData = async () => {
    if (!org) return;
    setIsLoading(true);
    try {
      const [loadedFindings, loadedTasks, loadedMaterials, loadedCatalog, loadedUnit, loadedInstances] = await Promise.all([
        FindingService.listFindings(org.id, { inspectionId: inspection.id }),
        RepairTaskService.listTasks(org.id, { inspectionId: inspection.id }),
        MaterialRequirementService.listRequirements(org.id, { inspectionId: inspection.id }),
        CatalogService.getItems(org.id),
        UnitService.getUnit(org.id, inspection.unitId),
        ProductInstanceService.listInstances(org.id, { kind: 'inspection', id: inspection.id }),
      ]);

      setFindings(loadedFindings);
      setTasks(loadedTasks);
      setMaterials(loadedMaterials);
      setCatalogLibrary(loadedCatalog);
      setUnitFavoriteProductIds(loadedUnit?.favoriteProductIds || []);
      setProductInstances(loadedInstances);
      const candidateEntries = await Promise.all(
        loadedMaterials.map(async (requirement) => {
          const candidates = await MaterialMatchingService.getCandidates(org.id, requirement);
          return [requirement.id, candidates.map((candidate) => candidate.optionName)] as const;
        })
      );
      setSummary(createInspectionOperationalSummary(inspection, loadedFindings, loadedTasks, loadedMaterials));
      setMaterialMatchCandidates(Object.fromEntries(candidateEntries));
      return {
        findings: loadedFindings,
        tasks: loadedTasks,
        materials: loadedMaterials,
      };
    } finally {
      setIsLoading(false);
    }
  };

  const canActivateProcurement = AuthPolicyService.canActivateProcurement(role, permissions);

  const titleCaseProcurementState = (value?: string) =>
    value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Scoped Only';

  const handleMarkReadyForProcurement = async (requirement: MaterialRequirement) => {
    if (!org || !user || !canActivateProcurement) return;
    try {
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          status: requirement.status === 'draft' ? 'reviewed' : requirement.status,
          procurementState: 'ready_for_procurement',
          procurementReadyAt: Date.now(),
        },
        user.id
      );
      ClientLoggerService.info('Material requirement marked ready for procurement.', {
        category: 'procurement',
        eventType: 'procurement_activation.ready',
        route: window.location.pathname || '/inspection',
        screen: 'InspectionIntelligencePanel',
        contextIds: {
          orgId: org.id,
          inspectionId: inspection.id,
          unitId: inspection.unitId,
        },
        metadata: {
          materialRequirementId: requirement.id,
          selectedMatchCatalogItemId: requirement.selectedMatch?.catalogItemId,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
    }
  };

  const productInstanceCatalogItemIds = useMemo(
    () => productInstances.map((instance) => instance.catalogItemId),
    [productInstances]
  );
  const findingById = useMemo(() => new Map(findings.map((finding) => [finding.id, finding])), [findings]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const findingRecommendationEntries = useMemo(
    () =>
      findings.map((finding) => ({
        finding,
        key: buildFindingRecommendationKey(finding),
        result: ProductRecommendationService.recommendProducts(catalogLibrary, {
          sourceType: 'finding',
          label: finding.description,
          rawText: finding.description,
          notes: finding.notes,
          roomLabel: finding.area,
          category: finding.category,
          trade: finding.recommendedTrade,
          unitFavoriteProductIds,
        }),
      })),
    [catalogLibrary, findings, unitFavoriteProductIds]
  );

  const taskRecommendationEntries = useMemo(
    () =>
      tasks.map((task) => {
        const sourceFinding = task.findingIds.map((findingId) => findingById.get(findingId)).find(Boolean);
        return {
          task,
          key: buildTaskRecommendationKey(task),
          result: ProductRecommendationService.recommendProducts(catalogLibrary, {
            sourceType: 'task',
            label: task.title,
            rawText: [task.title, sourceFinding?.description].filter(Boolean).join(' '),
            notes: [task.notes, sourceFinding?.notes].filter(Boolean).join(' '),
            roomLabel: sourceFinding?.area,
            category: sourceFinding?.category,
            trade: task.trade,
            unitFavoriteProductIds,
          }),
        };
      }),
    [catalogLibrary, findingById, tasks, unitFavoriteProductIds]
  );

  const materialRecommendationEntries = useMemo(
    () =>
      materials.map((requirement) => {
        const sourceTask = taskById.get(requirement.repairTaskId);
        const sourceFinding = requirement.sourceFindingId ? findingById.get(requirement.sourceFindingId) : undefined;
        return {
          requirement,
          key: buildMaterialRecommendationKey(requirement),
          result: ProductRecommendationService.recommendProducts(catalogLibrary, {
            sourceType: 'material_requirement',
            label: requirement.itemDescription,
            rawText: [requirement.itemDescription, sourceTask?.title, sourceFinding?.description].filter(Boolean).join(' '),
            notes: [requirement.notes, sourceTask?.notes, sourceFinding?.notes].filter(Boolean).join(' '),
            roomLabel: requirement.roomLabel || sourceFinding?.area,
            category: requirement.category || sourceFinding?.category,
            trade: sourceTask?.trade,
            unitFavoriteProductIds,
          }),
        };
      }),
    [catalogLibrary, findingById, materials, taskById, unitFavoriteProductIds]
  );

  const findingRecommendations = useMemo(
    () => new Map(findingRecommendationEntries.map((entry) => [entry.finding.id, entry.result])),
    [findingRecommendationEntries]
  );
  const taskRecommendations = useMemo(
    () => new Map(taskRecommendationEntries.map((entry) => [entry.task.id, entry.result])),
    [taskRecommendationEntries]
  );
  const materialRecommendations = useMemo(
    () => new Map(materialRecommendationEntries.map((entry) => [entry.requirement.id, entry.result])),
    [materialRecommendationEntries]
  );

  const inspectionPriorityContext = useMemo(
    () => InspectionAttentionService.derivePriorityContext(findings, tasks, materials),
    [findings, materials, tasks]
  );

  const buildUnitWorkspaceAttentionContext = () => {
    const scopeTarget = activeFocusedScopeRecord
      ? {
          entityType: activeFocusedScopeRecord.entityType,
          entityId: activeFocusedScopeRecord.entityId,
          originLabel: activeFocusedScopeRecord.originLabel || inspectionPriorityContext?.reasonLabel || 'Opened from Inspection',
        }
      : inspectionPriorityContext?.scopeTarget || null;
    const scopeSection = scopeTarget
      ? scopeTarget.entityType === 'finding'
        ? 'findings'
        : scopeTarget.entityType === 'task'
          ? 'tasks'
          : 'materials'
      : inspectionPriorityContext?.scopeSection || null;

    return {
      preferredTab: inspectionPriorityContext?.unitTab || (scopeTarget ? 'scope' : 'inspection'),
      inspectionId: inspection.id,
      scopeSection,
      scopeTarget,
      reasonLabel: inspectionPriorityContext?.reasonLabel || activeFocusedScopeRecord?.originLabel || 'Inspection priority context',
      reasonDetail:
        inspectionPriorityContext?.reasonDetail || 'Carry the current inspection focus back into the unit lifecycle view.',
    };
  };

  const sortedFindings = useMemo(() => {
    return InspectionAttentionService.sortFindings(findings);
  }, [findings]);

  const sortedTasks = useMemo(() => {
    return InspectionAttentionService.sortTasks(tasks);
  }, [tasks]);

  const sortedMaterials = useMemo(() => {
    return InspectionAttentionService.sortMaterials(materials);
  }, [materials]);

  const groupedFindings = useMemo(
    () =>
      buildGroupedRows<Finding>(
        sortedFindings,
        (finding) => InspectionAttentionService.getFindingMeta(finding).bucket,
        (finding) => `${finding.category}:${finding.status}:${finding.recommendedTrade}`,
        (finding) => `${titleCase(finding.category)} • ${titleCase(finding.status)} • ${titleCase(finding.recommendedTrade)}`
      ),
    [sortedFindings]
  );

  const groupedTasks = useMemo(
    () =>
      buildGroupedRows<RepairTask>(
        sortedTasks,
        (task) => InspectionAttentionService.getTaskMeta(task).bucket,
        (task) => `${task.trade}:${task.status}:${task.priority}`,
        (task) => `${titleCase(task.trade)} • ${titleCase(task.status)} • ${titleCase(task.priority)}`
      ),
    [sortedTasks]
  );

  const groupedMaterials = useMemo(
    () =>
      buildGroupedRows<MaterialRequirement>(
        sortedMaterials,
        (requirement) => InspectionAttentionService.getMaterialMeta(requirement).bucket,
        (requirement) => `${requirement.category}:${requirement.procurementState || 'scoped_only'}`,
        (requirement) => `${titleCase(requirement.category)} • ${titleCaseProcurementState(requirement.procurementState)}`
      ),
    [sortedMaterials]
  );

  const findingsAttentionCount = useMemo(
    () => findings.filter((finding) => InspectionAttentionService.getFindingMeta(finding).bucket === 'attention').length,
    [findings]
  );
  const tasksAttentionCount = useMemo(
    () => tasks.filter((task) => InspectionAttentionService.getTaskMeta(task).bucket === 'attention').length,
    [tasks]
  );
  const materialsAttentionCount = useMemo(
    () => materials.filter((requirement) => InspectionAttentionService.getMaterialMeta(requirement).bucket === 'attention').length,
    [materials]
  );

  useEffect(() => {
    if (!org) return;
    const allEntries = [
      ...findingRecommendationEntries.map((entry) => ({
        key: entry.key,
        sourceType: 'finding',
        sourceId: entry.finding.id,
        result: entry.result,
      })),
      ...taskRecommendationEntries.map((entry) => ({
        key: entry.key,
        sourceType: 'task',
        sourceId: entry.task.id,
        result: entry.result,
      })),
      ...materialRecommendationEntries.map((entry) => ({
        key: entry.key,
        sourceType: 'material_requirement',
        sourceId: entry.requirement.id,
        result: entry.result,
      })),
    ];

    allEntries.forEach((entry) => {
      if (recommendationLogKeysRef.current.has(entry.key)) {
        return;
      }
      recommendationLogKeysRef.current.add(entry.key);
      const metadata = {
        inspectionId: inspection.id,
        unitId: inspection.unitId,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        resultCount: entry.result.suggestedProducts.length,
        alternateCount: entry.result.alternateProducts.length,
        inferredCategory: entry.result.inferredTopLevelCategory,
        inferredSubcategory: entry.result.inferredSubcategory,
        inferredEquivalentGroup: entry.result.inferredEquivalentGroup,
      };

      if (entry.result.suggestedProducts.length === 0) {
        ClientLoggerService.info('No structured scope product recommendation match found.', {
          category: 'inspection.scope',
          eventType: 'structured_scope_recommendation.no_match',
          route: window.location.pathname || '/inspection',
          screen: 'InspectionIntelligencePanel',
          contextIds: {
            orgId: org.id,
            inspectionId: inspection.id,
            unitId: inspection.unitId,
          },
          metadata,
        });
        return;
      }

      ClientLoggerService.info('Structured scope product recommendations generated.', {
        category: 'inspection.scope',
        eventType: 'structured_scope_recommendation.generated',
        route: window.location.pathname || '/inspection',
        screen: 'InspectionIntelligencePanel',
        contextIds: {
          orgId: org.id,
          inspectionId: inspection.id,
          unitId: inspection.unitId,
        },
        metadata,
      });
    });
  }, [findingRecommendationEntries, inspection.id, inspection.unitId, materialRecommendationEntries, org, taskRecommendationEntries]);

  const handleAddRecommendedProduct = async (
    item: CatalogItem,
    source: 'suggested' | 'alternate',
    sourceType: 'finding' | 'task' | 'material_requirement',
    sourceId: string
  ) => {
    if (!org) return;
    await addCatalogItemToList({ kind: 'inspection', id: inspection.id }, item.id, org.id);
    ClientLoggerService.info('Structured scope recommended product added to inspection.', {
      category: 'inspection.scope',
      eventType: 'structured_scope_recommendation.clicked',
      route: window.location.pathname || '/inspection',
      screen: 'InspectionIntelligencePanel',
      contextIds: {
        orgId: org.id,
        inspectionId: inspection.id,
        unitId: inspection.unitId,
      },
      metadata: {
        sourceType,
        sourceId,
        source,
        catalogItemId: item.id,
        productName: item.name,
        equivalentGroup: item.equivalentGroup,
      },
    });
  };

  const handleRecommendationAlternatesOpened = (
    sourceType: 'finding' | 'task' | 'material_requirement',
    sourceId: string,
    equivalentGroup: string
  ) => {
    if (!org) return;
    ClientLoggerService.info('Structured scope recommendation alternates opened.', {
      category: 'inspection.scope',
      eventType: 'structured_scope_recommendation.alternate_opened',
      route: window.location.pathname || '/inspection',
      screen: 'InspectionIntelligencePanel',
      contextIds: {
        orgId: org.id,
        inspectionId: inspection.id,
        unitId: inspection.unitId,
      },
      metadata: {
        sourceType,
        sourceId,
        equivalentGroup,
      },
    });
  };

  const renderRecommendationPanel = (
    result: ProductRecommendationResult | undefined,
    sourceType: 'finding' | 'task' | 'material_requirement',
    sourceId: string
  ) => {
    if (!result) return null;
    return (
      <div className="mt-4">
        <ProductRecommendationPanel
          result={result}
          existingCatalogItemIds={productInstanceCatalogItemIds}
          onAddProduct={(item, source) => handleAddRecommendedProduct(item, source, sourceType, sourceId)}
          onAlternatesOpened={(equivalentGroup) =>
            handleRecommendationAlternatesOpened(sourceType, sourceId, equivalentGroup)
          }
        />
      </div>
    );
  };

  useEffect(() => {
    const target =
      initialFocusSection === 'findings'
        ? findingsSectionRef.current
        : initialFocusSection === 'tasks'
          ? tasksSectionRef.current
          : initialFocusSection === 'materials'
            ? materialsSectionRef.current
            : null;

    if (!target) return;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [initialFocusSection, inspection.id]);

  useEffect(() => {
    if (!activeFocusedScopeRecord) return;

    const highlightedKey = `${activeFocusedScopeRecord.entityType}:${activeFocusedScopeRecord.entityId}`;
    const target =
      activeFocusedScopeRecord.entityType === 'finding'
        ? findingRowRefs.current[activeFocusedScopeRecord.entityId] || findingsSectionRef.current
        : activeFocusedScopeRecord.entityType === 'task'
          ? taskRowRefs.current[activeFocusedScopeRecord.entityId] || tasksSectionRef.current
          : materialRowRefs.current[activeFocusedScopeRecord.entityId] || materialsSectionRef.current;

    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightedRecordKey(highlightedKey);
    });
  }, [activeFocusedScopeRecord, findings, tasks, materials]);

  useEffect(() => {
    if (!highlightedRecordKey) return;
    const timeout = window.setTimeout(() => setHighlightedRecordKey(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [highlightedRecordKey]);

  const resetDraft = (preserveContext = false) => {
    setDraft((current) =>
      preserveContext
        ? {
            ...createDefaultDraft(),
            area: current.area,
            category: current.category,
            severity: current.severity,
            priority: current.priority,
            recommendedTrade: current.recommendedTrade,
          }
        : createDefaultDraft()
    );
    setEditingFindingId(null);
  };

  const focusScopeRecord = (entityType: 'finding' | 'task' | 'material', entityId: string, originLabel?: string) => {
    setLocalFocusedScopeRecord({
      entityType,
      entityId,
      token: Date.now(),
      originLabel: originLabel || null,
    });
  };

  const adjacentScopeRecord = useMemo(() => {
    if (!activeFocusedScopeRecord) return { previous: null, next: null, position: null as number | null, total: 0 };

    const sequence =
      activeFocusedScopeRecord.entityType === 'finding'
        ? findings.map((finding) => finding.id)
        : activeFocusedScopeRecord.entityType === 'task'
          ? tasks.map((task) => task.id)
          : materials.map((requirement) => requirement.id);

    const currentIndex = sequence.findIndex((entry) => entry === activeFocusedScopeRecord.entityId);
    if (currentIndex === -1) {
      return { previous: null, next: null, position: null as number | null, total: sequence.length };
    }

    return {
      previous: currentIndex > 0 ? sequence[currentIndex - 1] : null,
      next: currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null,
      position: currentIndex + 1,
      total: sequence.length,
    };
  }, [activeFocusedScopeRecord, findings, materials, tasks]);

  const handleSaveFinding = async () => {
    if (!org || !user || !draft.area.trim() || !draft.description.trim()) return;
    setIsSavingFinding(true);

    try {
      if (editingFindingId) {
        const existing = findings.find((finding) => finding.id === editingFindingId);
        if (!existing) return;
        await FindingService.updateFinding(
          org.id,
          {
            ...existing,
            area: draft.area.trim(),
            category: draft.category,
            severity: draft.severity,
            priority: draft.priority,
            status: draft.status,
            description: draft.description.trim(),
            notes: draft.notes.trim() || undefined,
            recommendedTrade: draft.recommendedTrade,
            photoIds: draft.photoIds,
          },
          user.id
        );
        log('FINDING_UPDATED', {
          entityType: 'finding',
          entityId: editingFindingId,
          message: `Updated finding in ${draft.area.trim()}`,
        });
      } else {
        const createdFinding = await FindingService.createFinding(
          org.id,
          {
            orgId: org.id,
            inspectionId: inspection.id,
            unitId: inspection.unitId,
            area: draft.area.trim(),
            category: draft.category,
            severity: draft.severity,
            priority: draft.priority,
            status: draft.status,
            description: draft.description.trim(),
            notes: draft.notes.trim() || undefined,
            recommendedTrade: draft.recommendedTrade,
            photoIds: draft.photoIds,
            metadata: { source: 'manual' },
          },
          user.id
        );
        log('FINDING_CREATED', {
          entityType: 'finding',
          entityId: createdFinding.id,
          message: `Created finding in ${draft.area.trim()}`,
        });
        focusScopeRecord('finding', createdFinding.id, 'Created from structured scope');
      }

      resetDraft(!editingFindingId);
      await loadData();
    } finally {
      setIsSavingFinding(false);
    }
  };

  const handleEditFinding = (finding: Finding) => {
    setEditingFindingId(finding.id);
    setDraft({
      area: finding.area,
      category: finding.category,
      severity: finding.severity,
      priority: finding.priority,
      status: finding.status,
      description: finding.description,
      notes: finding.notes || '',
      recommendedTrade: finding.recommendedTrade,
      photoIds: finding.photoIds,
    });
  };

  const handleDeleteFinding = async (findingId: string) => {
    if (!org || !user || !confirm('Delete this finding? Linked generated tasks will need to be regenerated.')) return;

    await FindingService.deleteFinding(org.id, findingId, user.id);

    const linkedTasks = tasks.filter((task) => task.findingIds.includes(findingId));
    for (const task of linkedTasks) {
      await RepairTaskService.deleteTask(org.id, task.id, user.id);
    }
    if (linkedTasks.length > 0) {
      await MaterialRequirementService.clearForInspection(org.id, inspection.id, user.id);
    }

    log('FINDING_DELETED', {
      entityType: 'finding',
      entityId: findingId,
      message: 'Deleted finding from inspection scope',
    });
    await loadData();
  };

  const handleGenerateTasks = async () => {
    if (!org || !user) return;
    const actionableFindings = findings.filter((finding) => finding.status !== 'resolved');
    if (actionableFindings.length === 0) return;

    setIsGeneratingTasks(true);
    try {
      const previousTaskIds = new Set(tasks.map((task) => task.id));
      const generatedTasks = InspectionIntelligenceService.buildTasksFromFindings(actionableFindings);
      await RepairTaskService.replaceForInspection(org.id, inspection.id, generatedTasks, user.id);
      await MaterialRequirementService.clearForInspection(org.id, inspection.id, user.id);
      log('REPAIR_TASKS_GENERATED', {
        entityType: 'inspection',
        entityId: inspection.id,
        message: `Generated ${generatedTasks.length} repair tasks from findings`,
      });
      const nextData = await loadData();
      const firstNewTask = nextData?.tasks.find((task) => !previousTaskIds.has(task.id));
      if (firstNewTask) {
        focusScopeRecord('task', firstNewTask.id, `Generated ${generatedTasks.length} repair task${generatedTasks.length === 1 ? '' : 's'}`);
      }
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  const handleCreateTaskFromFinding = async (finding: Finding) => {
    if (!org || !user) return;
    if (tasks.some((task) => task.findingIds.includes(finding.id))) {
      alert('A repair task already exists for this finding.');
      return;
    }

    const [generatedTask] = InspectionIntelligenceService.buildTasksFromFindings([finding]);
    const createdTask = await RepairTaskService.createTask(org.id, generatedTask, user.id);
    log('REPAIR_TASK_CREATED', {
      entityType: 'repair_task',
      entityId: createdTask.id,
      message: `Created repair task from finding ${finding.id}`,
    });
    focusScopeRecord('task', createdTask.id, 'Created from finding');
    await loadData();
  };

  const handleTaskStatusChange = async (task: RepairTask, status: RepairTask['status']) => {
    if (!org || !user) return;
    await RepairTaskService.updateTask(org.id, { ...task, status }, user.id);
    log('REPAIR_TASK_UPDATED', {
      entityType: 'repair_task',
      entityId: task.id,
      message: `Updated repair task status to ${status}`,
    });
    await loadData();
  };

  const handleGenerateMaterials = async () => {
    if (!org || !user || tasks.length === 0) return;
    setIsGeneratingMaterials(true);
    try {
      const previousMaterialIds = new Set(materials.map((requirement) => requirement.id));
      const generatedMaterials = InspectionIntelligenceService.buildMaterialRequirementsFromTasks(tasks, findings);
      await MaterialRequirementService.replaceForInspection(org.id, inspection.id, generatedMaterials, user.id);
      log('MATERIAL_REQUIREMENTS_GENERATED', {
        entityType: 'inspection',
        entityId: inspection.id,
        message: `Generated ${generatedMaterials.length} material requirements`,
      });
      const nextData = await loadData();
      const firstNewRequirement = nextData?.materials.find((requirement) => !previousMaterialIds.has(requirement.id));
      if (firstNewRequirement) {
        focusScopeRecord(
          'material',
          firstNewRequirement.id,
          `Generated ${generatedMaterials.length} material requirement${generatedMaterials.length === 1 ? '' : 's'}`
        );
      }
    } finally {
      setIsGeneratingMaterials(false);
    }
  };

  const handleCreateMaterialFromTask = async (task: RepairTask) => {
    if (!org || !user) return;
    if (materials.some((material) => material.repairTaskId === task.id)) {
      alert('A material requirement already exists for this task.');
      return;
    }

    const generatedMaterials = InspectionIntelligenceService.buildMaterialRequirementsFromTasks([task], findings);
    const nextMaterial = generatedMaterials[0];
    if (!nextMaterial) {
      alert('No material requirement could be generated for this task.');
      return;
    }

    const createdRequirement = await MaterialRequirementService.createRequirement(org.id, nextMaterial, user.id);
    log('MATERIAL_REQUIREMENT_CREATED', {
      entityType: 'material_requirement',
      entityId: createdRequirement.id,
      message: `Created material requirement from task ${task.id}`,
    });
    focusScopeRecord('material', createdRequirement.id, 'Created from repair task');
    await loadData();
  };

  const handleMaterialQuantityChange = async (requirement: MaterialRequirement, quantity: number) => {
    if (!org || !user || !Number.isFinite(quantity) || quantity <= 0) return;
    await MaterialRequirementService.updateRequirement(org.id, { ...requirement, quantity }, user.id);
    log('MATERIAL_REQUIREMENT_UPDATED', {
      entityType: 'material_requirement',
      entityId: requirement.id,
      message: `Updated material quantity for ${requirement.itemDescription}`,
    });
    await loadData();
  };

  const readinessClassName = readinessStyles[summary.scopeReadiness.stage];

  const stageCards = useMemo(
    () => [
      {
        key: 'findings',
        label: 'Findings',
        count: summary.findings.total,
        state:
          summary.findings.total === 0 ? 'needs_action' : summary.findings.openCount > 0 ? 'active' : 'complete',
        detail:
          summary.findings.total === 0
            ? 'Add the first structured finding.'
            : `${summary.findings.openCount} unresolved finding${summary.findings.openCount === 1 ? '' : 's'}`,
      },
      {
        key: 'tasks',
        label: 'Repair Tasks',
        count: summary.repairTasks.total,
        state:
          summary.repairTasks.total === 0
            ? summary.findings.total > 0
              ? 'needs_action'
              : 'waiting'
            : summary.repairTasks.openCount > 0
              ? 'active'
              : 'complete',
        detail:
          summary.repairTasks.total === 0
            ? 'Generate tasks from findings.'
            : `${summary.repairTasks.openCount} active task${summary.repairTasks.openCount === 1 ? '' : 's'}`,
      },
      {
        key: 'materials',
        label: 'Materials',
        count: summary.materialRequirements.total,
        state:
          summary.materialRequirements.total === 0
            ? summary.repairTasks.total > 0
              ? 'needs_action'
              : 'waiting'
            : summary.materialRequirements.openCount > 0
              ? 'active'
              : 'complete',
        detail:
          summary.materialRequirements.total === 0
            ? 'Generate material requirements from tasks.'
            : `${summary.materialRequirements.openCount} open requirement${summary.materialRequirements.openCount === 1 ? '' : 's'}`,
      },
      {
        key: 'handoff',
        label: 'Operational Handoff',
        count: summary.materialRequirements.procurementReadyCount,
        state:
          summary.materialRequirements.total === 0
            ? 'waiting'
            : summary.materialRequirements.procurementReadyCount > 0
              ? 'active'
              : 'ready',
        detail:
          summary.materialRequirements.total === 0
            ? 'Complete scope first.'
            : summary.materialRequirements.procurementReadyCount > 0
              ? `${summary.materialRequirements.procurementReadyCount} requirement${summary.materialRequirements.procurementReadyCount === 1 ? '' : 's'} ready for procurement`
              : 'Continue in Unit Workspace or prepare procurement handoff.',
      },
    ],
    [summary]
  );

  const nextAction = useMemo(() => {
    if (inspection.status === 'draft' && summary.checklist.percentComplete < 100) {
      return {
        title: 'Continue inspection capture',
        summary: 'Finish inspection details and capture enough observations to structure the work.',
        actionLabel: 'Resume inspection details',
        action: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
      };
    }
    if (summary.findings.total === 0) {
      return {
        title: 'Add findings',
        summary: 'Structured findings are the first output of inspection and unlock the rest of the scope.',
        actionLabel: 'Go to findings',
        action: () => findingsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      };
    }
    if (summary.repairTasks.total === 0) {
      return {
        title: 'Generate repair tasks',
        summary: 'Findings are ready. Create the work scope so materials can be built from it.',
        actionLabel: 'Go to repair tasks',
        action: () => tasksSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      };
    }
    if (summary.materialRequirements.total === 0) {
      return {
        title: 'Generate material requirements',
        summary: 'Repair tasks exist. Build the material list to complete scope readiness.',
        actionLabel: 'Go to materials',
        action: () => materialsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      };
    }
    if (summary.materialRequirements.procurementReadyCount > 0 && onOpenProcurement) {
      return {
        title: 'Continue into Procurement',
        summary: 'Scope is structured and procurement-ready work exists for this inspection’s unit.',
        actionLabel: 'Open Procurement',
        action: () => onOpenProcurement({ unitId: inspection.unitId, focus: 'procurement' }),
      };
    }
    if (onOpenUnitWorkspace) {
      return {
        title: 'Continue in Unit Workspace',
        summary: 'Use Unit Workspace to review this unit’s broader lifecycle and route into the next operational step.',
        actionLabel: 'Open Unit Workspace',
        action: () => onOpenUnitWorkspace(inspection.unitId, buildUnitWorkspaceAttentionContext()),
      };
    }
    return {
      title: 'Review structured scope',
      summary: 'Findings, tasks, and materials are all present. Review readiness and choose the next operational handoff.',
      actionLabel: 'Review materials',
      action: () => materialsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    };
  }, [buildUnitWorkspaceAttentionContext, inspection.status, inspection.unitId, onOpenProcurement, onOpenUnitWorkspace, summary]);

  const stageTone = (state: 'needs_action' | 'active' | 'complete' | 'waiting' | 'ready') => {
    if (state === 'needs_action') return 'border-amber-200 bg-amber-50 text-amber-900';
    if (state === 'active') return 'border-blue-200 bg-blue-50 text-blue-900';
    if (state === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    if (state === 'ready') return 'border-violet-200 bg-violet-50 text-violet-900';
    return 'border-slate-200 bg-slate-50 text-slate-700';
  };

  return (
    <div className="border-t border-slate-200 pt-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Hammer size={20} className="text-slate-600" />
            Inspection Intelligence
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Convert inspection observations into findings, repair tasks, and material requirements.
          </p>
        </div>
        <div className={`rounded-xl border px-4 py-3 text-sm max-w-md ${readinessClassName}`}>
          <div className="font-semibold">{summary.scopeReadiness.label}</div>
          <div className="mt-1">{summary.scopeReadiness.details}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Guided Scope Progression</div>
            <h4 className="mt-2 text-xl font-semibold text-slate-900">{nextAction.title}</h4>
            <p className="mt-1 text-sm text-slate-600">{nextAction.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={nextAction.action}
              className="rounded-xl bg-lowes-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              {nextAction.actionLabel}
            </button>
            {onOpenUnitWorkspace ? (
              <button
                type="button"
                onClick={() => onOpenUnitWorkspace(inspection.unitId, buildUnitWorkspaceAttentionContext())}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                Open Unit Workspace
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stageCards.map((card) => (
            <div key={card.key} className={`rounded-2xl border p-4 ${stageTone(card.state as 'needs_action' | 'active' | 'complete' | 'waiting' | 'ready')}`}>
              <div className="text-xs uppercase tracking-wide opacity-80">{card.label}</div>
              <div className="mt-2 text-2xl font-semibold">{card.count}</div>
              <div className="mt-1 text-xs opacity-90">{card.detail}</div>
            </div>
          ))}
        </div>
        {activeFocusedScopeRecord ? (
          <div
            data-testid="inspection-scope-focus-banner"
            className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
          >
            <div className="font-semibold">
              Focused {activeFocusedScopeRecord.entityType === 'material' ? 'material requirement' : activeFocusedScopeRecord.entityType}
            </div>
            <div className="mt-1 text-blue-800">
              {activeFocusedScopeRecord.originLabel || 'Opened from a connected workflow'}.
            </div>
            {adjacentScopeRecord.position ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                  Item {adjacentScopeRecord.position} of {adjacentScopeRecord.total}
                </span>
                <button
                  type="button"
                  disabled={!adjacentScopeRecord.previous}
                  onClick={() =>
                    adjacentScopeRecord.previous
                      ? focusScopeRecord(
                          activeFocusedScopeRecord.entityType,
                          adjacentScopeRecord.previous,
                          `Previous ${activeFocusedScopeRecord.entityType === 'material' ? 'material requirement' : activeFocusedScopeRecord.entityType}`
                        )
                      : undefined
                  }
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                >
                  Previous item
                </button>
                <button
                  type="button"
                  disabled={!adjacentScopeRecord.next}
                  onClick={() =>
                    adjacentScopeRecord.next
                      ? focusScopeRecord(
                          activeFocusedScopeRecord.entityType,
                          adjacentScopeRecord.next,
                          `Next ${activeFocusedScopeRecord.entityType === 'material' ? 'material requirement' : activeFocusedScopeRecord.entityType}`
                        )
                      : undefined
                  }
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                >
                  Next item
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Checklist</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.checklist.percentComplete}%</div>
          <div className="text-xs text-slate-500 mt-1">
            {summary.checklist.unresolvedCount} unresolved issue{summary.checklist.unresolvedCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Findings</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.findings.total}</div>
          <div className="text-xs text-slate-500 mt-1">{summary.findings.openCount} open</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Repair Tasks</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.repairTasks.total}</div>
          <div className="text-xs text-slate-500 mt-1">{summary.repairTasks.openCount} active</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Materials</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.materialRequirements.total}</div>
          <div className="text-xs text-slate-500 mt-1">{summary.materialRequirements.totalQuantity} total quantity</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Inspection Status</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{titleCase(inspection.status)}</div>
          <div className="text-xs text-slate-500 mt-1">Operational scope snapshot</div>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-slate-600" />
          <h4 className="font-semibold text-slate-800">{editingFindingId ? 'Edit Finding' : 'Add Finding'}</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Room / Area</label>
            <input
              value={draft.area}
              onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
              placeholder="Living room, bathroom vanity, exterior stair..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Recommended Trade</label>
            <select
              value={draft.recommendedTrade}
              onChange={(event) =>
                setDraft((current) => ({ ...current, recommendedTrade: event.target.value as Finding['recommendedTrade'] }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {TRADE_OPTIONS.map((trade) => (
                <option key={trade} value={trade}>
                  {titleCase(trade)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as FindingCategory }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {titleCase(category)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Severity</label>
            <select
              value={draft.severity}
              onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value as Finding['severity'] }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {titleCase(severity)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
            <select
              value={draft.priority}
              onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Finding['priority'] }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {titleCase(priority)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Finding['status'] }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            rows={3}
            placeholder="Describe the observed issue in clear operational terms."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
          <textarea
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            rows={2}
            placeholder="Optional context, measurements, or contractor notes."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue resize-none"
          />
        </div>

        {photos.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Linked Photos</label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {photos.map((photo, index) => {
                const selected = draft.photoIds.includes(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        photoIds: selected
                          ? current.photoIds.filter((id) => id !== photo.id)
                          : [...current.photoIds, photo.id],
                      }))
                    }
                    className={`rounded-xl overflow-hidden border text-left transition-colors ${
                      selected ? 'border-lowes-blue ring-2 ring-blue-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="aspect-square bg-slate-100">
                      {previews[photo.id] ? (
                        <img src={previews[photo.id]} alt={`Inspection photo ${index + 1}`} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="px-2 py-1 text-[11px] text-slate-500">Photo {index + 1}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleSaveFinding()}
            disabled={isSavingFinding || !draft.area.trim() || !draft.description.trim()}
            className="bg-lowes-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {editingFindingId ? <Save size={16} /> : <Plus size={16} />}
            {editingFindingId ? 'Update Finding' : 'Add Finding'}
          </button>
          {editingFindingId && (
            <button
              onClick={resetDraft}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 hover:bg-white"
            >
              Cancel
            </button>
          )}
        </div>
        {!editingFindingId ? (
          <div className="text-xs text-slate-500">
            After you add a finding, the area, trade, and priority defaults stay in place so you can move quickly through similar issues.
          </div>
        ) : null}
      </div>

      <div ref={findingsSectionRef} className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-slate-600" />
            Findings ({findings.length})
          </h4>
          <div className="text-xs text-slate-500">
            {isLoading
              ? 'Refreshing...'
              : findingsAttentionCount > 0
                ? `${compactCountLabel(findingsAttentionCount, 'finding')} need attention`
                : 'Structured inspection observations'}
          </div>
        </div>
        {findings.length > 0 ? (
          <div
            data-testid="inspection-findings-guidance"
            className={`rounded-xl border px-4 py-2 text-sm ${
              findingsAttentionCount > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            <span className="font-medium">
              {findingsAttentionCount > 0
                ? `${compactCountLabel(findingsAttentionCount, 'finding')} need attention.`
                : 'All findings are resolved or non-blocking.'}
            </span>{' '}
            <span className="text-xs">
              {findingsAttentionCount > 0
                ? 'Next recommended action: review the open findings at the top of the list, then create repair tasks for the remaining issues.'
                : 'You can still open any finding below to review notes or source context.'}
            </span>
          </div>
        ) : null}

        {findings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 bg-white">
            No findings yet. Add the first structured finding to start the scope. Findings are the source for repair tasks and the downstream material list.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedFindings.map(
              ({ item: finding, bucketKey, bucketLabel, showBucketHeader, groupKey, groupLabel, groupCount, showGroupHeader, compressMetadata }) => {
                const attentionMeta = InspectionAttentionService.getFindingMeta(finding);
                return (
              <React.Fragment key={finding.id}>
                {showBucketHeader ? (
                  <div className={`rounded-xl border px-4 py-2 ${ATTENTION_BUCKETS[bucketKey].summaryTone}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">{bucketLabel}</div>
                      <div className="text-[11px]">
                        {compactCountLabel(
                          bucketKey === 'attention' ? findingsAttentionCount : findings.length - findingsAttentionCount,
                          'finding'
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                {showGroupHeader ? (
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1 pt-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{groupLabel}</div>
                    <div className="text-[11px] text-slate-400">{compactCountLabel(groupCount, 'item')}</div>
                  </div>
                ) : null}
                <div
                  ref={(node) => {
                    findingRowRefs.current[finding.id] = node;
                  }}
                  data-testid={`inspection-finding-${finding.id}`}
                  data-group-key={groupKey}
                  className={`rounded-xl border px-4 py-3 transition-colors ${
                    highlightedRecordKey === `finding:${finding.id}`
                      ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100 shadow-sm'
                      : activeFocusedScopeRecord
                        ? `${attentionMeta.rowToneClass} opacity-95`
                        : attentionMeta.rowToneClass
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{finding.description}</span>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${attentionMeta.badgeClass}`}>
                          {attentionMeta.badge}
                        </span>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                          {titleCase(finding.status)}
                        </span>
                        {!compressMetadata ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                            {titleCase(finding.priority)}
                          </span>
                        ) : null}
                        {attentionMeta.recent ? (
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">New</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {finding.area}
                        {!compressMetadata ? ` • ${titleCase(finding.category)} • ${titleCase(finding.recommendedTrade)}` : ''}
                      </div>
                      {finding.notes ? <p className="mt-2 text-xs text-slate-500">{finding.notes}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        <span>{compactCountLabel(finding.photoIds.length, 'photo')}</span>
                        {compressMetadata ? <span>Grouped with similar findings</span> : null}
                        {finding.metadata?.generatedItemId ? (
                          <span className="font-medium text-blue-600">
                            Checklist-linked: {String(finding.metadata.sourceChecklistLabel || finding.metadata.generatedItemId)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start">
                      <button
                        onClick={() => void handleCreateTaskFromFinding(finding)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        title="Create task"
                      >
                        Create Task
                      </button>
                      <button
                        onClick={() => handleEditFinding(finding)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                        title="Edit finding"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => void handleDeleteFinding(finding.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                        title="Delete finding"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {renderRecommendationPanel(findingRecommendations.get(finding.id), 'finding', finding.id)}
                </div>
              </React.Fragment>
            );
              }
            )}
          </div>
        )}
      </div>

      <div ref={tasksSectionRef} className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-col md:flex-row">
          <div>
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Wrench size={18} className="text-slate-600" />
              Repair Tasks ({tasks.length})
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              {tasksAttentionCount > 0
                ? `${compactCountLabel(tasksAttentionCount, 'task')} need attention now.`
                : 'Deterministically generated from unresolved findings.'}
            </p>
          </div>
          <button
            onClick={() => void handleGenerateTasks()}
            disabled={isGeneratingTasks || findings.filter((finding) => finding.status !== 'resolved').length === 0}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {isGeneratingTasks ? 'Generating...' : tasks.length > 0 ? 'Regenerate Tasks' : 'Generate Tasks'}
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 bg-white">
            No repair tasks generated yet. Generate them from unresolved findings to turn observations into executable work.
          </div>
        ) : (
          <div className="space-y-3">
            <div
              data-testid="inspection-tasks-guidance"
              className={`rounded-xl border px-4 py-2 text-sm ${
                tasksAttentionCount > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-medium">
                {tasksAttentionCount > 0
                  ? `${compactCountLabel(tasksAttentionCount, 'task')} need attention.`
                  : 'Completed tasks are carrying less visual weight.'}
              </span>{' '}
              <span className="text-xs">
                {tasks.some((task) => task.status === 'blocked')
                  ? 'Next recommended action: unblock the blocked tasks first, then continue through ready and in-progress work.'
                  : tasksAttentionCount > 0
                    ? 'Next recommended action: review the top tasks first and create any missing material requirements from them.'
                    : 'Use the source links below if you need to trace work back to a finding.'}
              </span>
            </div>
            {groupedTasks.map(
              ({ item: task, bucketKey, bucketLabel, showBucketHeader, groupKey, groupLabel, groupCount, showGroupHeader, compressMetadata }) => {
                const attentionMeta = InspectionAttentionService.getTaskMeta(task);
                return (
              <React.Fragment key={task.id}>
                {showBucketHeader ? (
                  <div className={`rounded-xl border px-4 py-2 ${ATTENTION_BUCKETS[bucketKey].summaryTone}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">{bucketLabel}</div>
                      <div className="text-[11px]">
                        {compactCountLabel(bucketKey === 'attention' ? tasksAttentionCount : tasks.length - tasksAttentionCount, 'task')}
                      </div>
                    </div>
                  </div>
                ) : null}
                {showGroupHeader ? (
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1 pt-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{groupLabel}</div>
                    <div className="text-[11px] text-slate-400">{compactCountLabel(groupCount, 'task')}</div>
                  </div>
                ) : null}
                <div
                  ref={(node) => {
                    taskRowRefs.current[task.id] = node;
                  }}
                  data-testid={`inspection-task-${task.id}`}
                  data-group-key={groupKey}
                  className={`rounded-xl border px-4 py-3 transition-colors ${
                    highlightedRecordKey === `task:${task.id}`
                      ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100 shadow-sm'
                      : activeFocusedScopeRecord
                        ? `${attentionMeta.rowToneClass} opacity-95`
                        : attentionMeta.rowToneClass
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${attentionMeta.badgeClass}`}>
                          {attentionMeta.badge}
                        </span>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                          {titleCase(task.status)}
                        </span>
                        {attentionMeta.recent ? (
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">New</span>
                        ) : null}
                      </div>
                      {task.notes ? <div className="mt-1 text-xs text-slate-500">{task.notes}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        {!compressMetadata ? <span>{titleCase(task.trade)}</span> : null}
                        {!compressMetadata ? <span>{titleCase(task.priority)}</span> : null}
                        <span>{task.estimatedEffortMinutes || 0} min</span>
                        {compressMetadata ? <span>Grouped with similar tasks</span> : null}
                      </div>
                      {task.findingIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => focusScopeRecord('finding', task.findingIds[0], 'Linked from repair task')}
                          className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Open source finding
                        </button>
                      ) : null}
                    </div>
                    <div className="w-44 space-y-2">
                      <select
                        value={task.status}
                        onChange={(event) => void handleTaskStatusChange(task, event.target.value as RepairTask['status'])}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
                      >
                        {REPAIR_TASK_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {titleCase(status)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => void handleCreateMaterialFromTask(task)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Create Material
                      </button>
                    </div>
                  </div>
                  {renderRecommendationPanel(taskRecommendations.get(task.id), 'task', task.id)}
                </div>
              </React.Fragment>
            );
              }
            )}
          </div>
        )}
      </div>

      <div ref={materialsSectionRef} className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-col md:flex-row">
          <div>
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Layers3 size={18} className="text-slate-600" />
              Material Requirements ({materials.length})
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              {materialsAttentionCount > 0
                ? `${compactCountLabel(materialsAttentionCount, 'requirement')} are still actively driving procurement or closeout.`
                : 'Scope stays here. Procurement activation only marks requirements ready and hands them into the procurement workspace.'}
            </p>
          </div>
          <button
            onClick={() => void handleGenerateMaterials()}
            disabled={isGeneratingMaterials || tasks.length === 0}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {isGeneratingMaterials ? 'Generating...' : materials.length > 0 ? 'Regenerate Materials' : 'Generate Materials'}
          </button>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 bg-white">
            No material requirements generated yet. Generate them from repair tasks to complete the structured scope and prepare the next operational handoff.
          </div>
        ) : (
          <div className="space-y-3">
            <div
              data-testid="inspection-materials-guidance"
              className={`rounded-xl border px-4 py-2 text-sm ${
                materialsAttentionCount > 0 ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-medium">
                {materialsAttentionCount > 0
                  ? `${compactCountLabel(materialsAttentionCount, 'requirement')} need attention.`
                  : 'All material requirements are fulfilled or non-blocking.'}
              </span>{' '}
              <span className="text-xs">
                {materials.some((requirement) => (requirement.closeoutIssueState || 'none') !== 'none' || typeof requirement.reopenedAt === 'number')
                  ? 'Next recommended action: resolve exception or rework items first, then continue with procurement and closeout.'
                  : materials.some(
                        (requirement) =>
                          (requirement.verificationStatus || 'pending') !== 'verified' &&
                          (requirement.procurementState || 'scoped_only') === 'fulfilled'
                      )
                    ? 'Next recommended action: close out the fulfilled items waiting on receiving or verification.'
                    : 'Next recommended action: move the top requirements into procurement as they become ready.'}
              </span>
            </div>
            {groupedMaterials.map(
              ({ item: requirement, bucketKey, bucketLabel, showBucketHeader, groupKey, groupLabel, groupCount, showGroupHeader, compressMetadata }) => {
                const attentionMeta = InspectionAttentionService.getMaterialMeta(requirement);
                return (
              <React.Fragment key={`${requirement.id}:${requirement.updatedAt}`}>
                {showBucketHeader ? (
                  <div className={`rounded-xl border px-4 py-2 ${ATTENTION_BUCKETS[bucketKey].summaryTone}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">{bucketLabel}</div>
                      <div className="text-[11px]">
                        {compactCountLabel(
                          bucketKey === 'attention' ? materialsAttentionCount : materials.length - materialsAttentionCount,
                          'requirement'
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                {showGroupHeader ? (
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1 pt-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{groupLabel}</div>
                    <div className="text-[11px] text-slate-400">{compactCountLabel(groupCount, 'requirement')}</div>
                  </div>
                ) : null}
                <div
                  ref={(node) => {
                    materialRowRefs.current[requirement.id] = node;
                  }}
                  data-testid={`inspection-material-${requirement.id}`}
                  data-group-key={groupKey}
                  className={`rounded-xl border px-4 py-3 transition-colors ${
                    highlightedRecordKey === `material:${requirement.id}`
                      ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100 shadow-sm'
                      : activeFocusedScopeRecord
                        ? `${attentionMeta.rowToneClass} opacity-95`
                        : attentionMeta.rowToneClass
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{requirement.itemDescription}</div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${attentionMeta.badgeClass}`}>
                          {attentionMeta.badge}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {titleCaseProcurementState(requirement.procurementState)}
                        </span>
                        {attentionMeta.recent ? (
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">New</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {!compressMetadata
                          ? `${titleCase(requirement.category)} • ${titleCase(requirement.source)} generated • Confidence ${titleCase(requirement.confidence)}`
                          : `${titleCase(requirement.source)} generated`}
                      </div>
                      {requirement.notes ? <div className="mt-2 text-xs text-slate-500">{requirement.notes}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        <span>
                          Qty {requirement.quantity} {requirement.unit}
                        </span>
                        {compressMetadata ? <span>Grouped with similar material requirements</span> : null}
                        {requirement.selectedMatch ? (
                          <span className="font-medium text-emerald-700">
                            Selected: {requirement.selectedMatch.optionName}
                          </span>
                        ) : materialMatchCandidates[requirement.id]?.[0] ? (
                          <span className="font-medium text-blue-700">
                            Suggested: {materialMatchCandidates[requirement.id][0]}
                          </span>
                        ) : (
                          <span>No procurement product selected yet</span>
                        )}
                      </div>
                      {canActivateProcurement ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {requirement.repairTaskId ? (
                            <button
                              type="button"
                              onClick={() => focusScopeRecord('task', requirement.repairTaskId, 'Linked from material requirement')}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Open source task
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void handleMarkReadyForProcurement(requirement)}
                            disabled={requirement.procurementState === 'ready_for_procurement' || requirement.procurementState === 'activated' || requirement.procurementState === 'ordered' || requirement.procurementState === 'fulfilled'}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Mark Ready for Procurement
                          </button>
                          {onOpenProcurement ? (
                            <button
                              type="button"
                              onClick={onOpenProcurement}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            >
                              Open Procurement Workspace
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="w-28">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">Quantity</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          defaultValue={requirement.quantity}
                          onBlur={(event) => void handleMaterialQuantityChange(requirement, Number(event.target.value))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue"
                        />
                        <span className="text-xs text-slate-500">{requirement.unit}</span>
                      </div>
                    </div>
                  </div>
                  {renderRecommendationPanel(materialRecommendations.get(requirement.id), 'material_requirement', requirement.id)}
                </div>
              </React.Fragment>
            );
              }
            )}
          </div>
        )}
      </div>
    </div>
  );
};
