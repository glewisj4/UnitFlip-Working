import { Inspection } from '../models/inspections';
import {
  ChecklistExecutionSummary,
  Finding,
  FindingCategory,
  FindingSeverity,
  InspectionOperationalSummary,
  InspectionProcurementOptimizationSummary,
  InspectionProcurementReviewGuidanceSummary,
  InspectionProcurementVendorIntelligenceSummary,
  InspectionReportSnapshot,
  MaterialRequirement,
  RepairTask,
  RepairTaskStatus,
  ScopeReadinessSummary,
  TradeOption,
} from '../models/operations';
import { GeneratedInspectionItem } from '../models/templates';
import { ProcurementOptimizationSignal } from '../models/procurement';
import { FindingService } from './FindingService';
import { InspectionService } from './InspectionService';
import { MaterialRequirementService } from './MaterialRequirementService';
import { ProcurementDraftService } from './ProcurementDraftService';
import { RepairTaskService } from './RepairTaskService';

const incrementRecord = <T extends string>(record: Partial<Record<T, number>>, key: T) => {
  record[key] = (record[key] || 0) + 1;
};

const getScopeReadiness = (
  checklist: ChecklistExecutionSummary,
  findings: Finding[],
  tasks: RepairTask[],
  materials: MaterialRequirement[]
): ScopeReadinessSummary => {
  if (checklist.total > 0 && !checklist.readyForScope) {
    return {
      stage: 'needs_findings',
      label: 'Checklist execution in progress',
      details: 'Resolve blocked or failed checklist items before the inspection is ready for downstream scope work.',
      findingsReady: false,
      tasksReady: false,
      materialsReady: false,
    };
  }

  if (findings.length === 0) {
    return {
      stage: 'needs_findings',
      label: 'Needs findings',
      details: 'Capture structured findings to unlock repair scope generation.',
      findingsReady: false,
      tasksReady: false,
      materialsReady: false,
    };
  }

  if (tasks.length === 0) {
    return {
      stage: 'ready_for_tasks',
      label: 'Ready for task generation',
      details: 'Findings are recorded. Generate repair tasks to create the work scope.',
      findingsReady: true,
      tasksReady: false,
      materialsReady: false,
    };
  }

  if (materials.length === 0) {
    return {
      stage: 'ready_for_materials',
      label: 'Ready for material requirements',
      details: 'Repair tasks exist. Generate material requirements to complete scope readiness.',
      findingsReady: true,
      tasksReady: true,
      materialsReady: false,
    };
  }

  return {
    stage: 'ready_for_report',
    label: 'Ready for report',
    details: 'Findings, tasks, and materials are all present for report and scope review.',
    findingsReady: true,
    tasksReady: true,
    materialsReady: true,
  };
};

const normalizeChecklistStatus = (status: string): string => {
  switch (status) {
    case 'pass':
      return 'completed';
    case 'fail':
      return 'failed';
    case 'na':
      return 'not_applicable';
    case 'pending':
      return 'not_started';
    default:
      return status;
  }
};

const createChecklistExecutionSummary = (inspection: Inspection): ChecklistExecutionSummary => {
  const items = inspection.generatedItems || [];
  const total = items.length;
  const completedCount = items.filter((item) => normalizeChecklistStatus(item.status) === 'completed').length;
  const failedCount = items.filter((item) => normalizeChecklistStatus(item.status) === 'failed').length;
  const blockedCount = items.filter((item) => normalizeChecklistStatus(item.status) === 'blocked').length;
  const notApplicableCount = items.filter((item) => normalizeChecklistStatus(item.status) === 'not_applicable').length;
  const inProgressCount = items.filter((item) => normalizeChecklistStatus(item.status) === 'in_progress').length;

  // Completion is deterministic: completed + not_applicable are resolved checklist outcomes.
  const resolvedCount = completedCount + notApplicableCount;
  const unresolvedCount = failedCount + blockedCount;
  const percentComplete = total === 0 ? 0 : Math.round((resolvedCount / total) * 100);

  return {
    total,
    completedCount,
    failedCount,
    blockedCount,
    notApplicableCount,
    inProgressCount,
    unresolvedCount,
    percentComplete,
    readyForScope: unresolvedCount === 0,
  };
};

export const createInspectionOperationalSummary = (
  inspection: Inspection,
  findings: Finding[],
  tasks: RepairTask[],
  materials: MaterialRequirement[]
): InspectionOperationalSummary => {
  const checklist = createChecklistExecutionSummary(inspection);
  const findingsByCategory: Partial<Record<FindingCategory, number>> = {};
  const findingsBySeverity: Partial<Record<FindingSeverity, number>> = {};
  const tasksByTrade: Partial<Record<TradeOption, number>> = {};
  const tasksByStatus: Partial<Record<RepairTaskStatus, number>> = {};
  const materialsByCategory: Record<string, number> = {};

  for (const finding of findings) {
    incrementRecord(findingsByCategory, finding.category);
    incrementRecord(findingsBySeverity, finding.severity);
  }

  for (const task of tasks) {
    incrementRecord(tasksByTrade, task.trade);
    incrementRecord(tasksByStatus, task.status);
  }

  for (const material of materials) {
    materialsByCategory[material.category] = (materialsByCategory[material.category] || 0) + 1;
  }

  return {
    inspectionId: inspection.id,
    unitId: inspection.unitId,
    checklist,
    findings: {
      total: findings.length,
      openCount: findings.filter((finding) => finding.status !== 'resolved').length,
      byCategory: findingsByCategory,
      bySeverity: findingsBySeverity,
    },
    repairTasks: {
      total: tasks.length,
      openCount: tasks.filter((task) => task.status !== 'done').length,
      byTrade: tasksByTrade,
      byStatus: tasksByStatus,
    },
    materialRequirements: {
      total: materials.length,
      byCategory: materialsByCategory,
      totalQuantity: materials.reduce((sum, material) => sum + material.quantity, 0),
      openCount: materials.filter((material) => !['fulfilled', 'canceled'].includes(material.status)).length,
      procurementReadyCount: materials.filter((material) =>
        ['reviewed', 'planned', 'quoted', 'ordered'].includes(material.status)
      ).length,
    },
    scopeReadiness: getScopeReadiness(checklist, findings, tasks, materials),
  };
};

const createProcurementOptimizationSummary = async (
  orgId: string,
  inspectionId: string
): Promise<InspectionProcurementOptimizationSummary | undefined> => {
  const drafts = await ProcurementDraftService.listDrafts(orgId);
  const relevantDrafts = drafts.filter((draft) =>
    draft.items.some((item) => item.inspectionId === inspectionId && item.optimization)
  );

  const optimizedItems = relevantDrafts.flatMap((draft) =>
    draft.items.filter((item) => item.inspectionId === inspectionId && item.optimization)
  );

  if (optimizedItems.length === 0) {
    return undefined;
  }

  const riskSignals = Array.from(
    new Set(
      optimizedItems.flatMap((item) => item.optimization?.signals || [])
    )
  ) as ProcurementOptimizationSignal[];

  return {
    draftCount: relevantDrafts.length,
    optimizedItemCount: optimizedItems.length,
    estimatedOptimizedCost: optimizedItems.reduce(
      (sum, item) => sum + (item.optimization?.estimatedTotalCost || 0),
      0
    ),
    estimatedWasteQuantity: optimizedItems.reduce(
      (sum, item) => sum + (item.optimization?.estimatedWasteQuantity || 0),
      0
    ),
    riskSignals,
    packStrategySummaries: optimizedItems.slice(0, 5).map((item) => {
      const strategy =
        item.optimization?.recommendedPacks
          .map((selection) => `${selection.packCount} x ${selection.optionName}`)
          .join(' + ') || 'No pack strategy';
      return `${item.itemDescription}: ${strategy}`;
    }),
  };
};

const createProcurementVendorIntelligenceSummary = async (
  orgId: string,
  inspectionId: string
): Promise<InspectionProcurementVendorIntelligenceSummary | undefined> => {
  const drafts = await ProcurementDraftService.listDrafts(orgId);
  const relevantDrafts = drafts.filter((draft) =>
    draft.items.some((item) => item.inspectionId === inspectionId && item.vendorIntelligence)
  );
  const intelligentItems = relevantDrafts.flatMap((draft) =>
    draft.items.filter((item) => item.inspectionId === inspectionId && item.vendorIntelligence)
  );

  if (intelligentItems.length === 0) {
    return undefined;
  }

  const freshnessValues = intelligentItems
    .map((item) => item.vendorIntelligence?.selectedOffer?.freshnessLabel)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    draftCount: relevantDrafts.length,
    intelligentItemCount: intelligentItems.length,
    selectedOfferCount: intelligentItems.filter((item) => item.vendorIntelligence?.selectedOffer).length,
    staleOfferCount: freshnessValues.filter((value) => value === 'Stale').length,
    riskSignals: Array.from(
      new Set(intelligentItems.flatMap((item) => item.vendorIntelligence?.riskSignals || []))
    ),
    selectedOfferFreshness: Array.from(new Set(freshnessValues)),
    offerSummaries: intelligentItems.slice(0, 5).flatMap((item) => {
      const offer = item.vendorIntelligence?.selectedOffer;
      if (!offer) {
        return [];
      }
      return [
        `${item.itemDescription}: ${offer.optionName}${typeof offer.price === 'number' ? ` at $${offer.price.toFixed(2)}` : ''} (${offer.freshnessLabel})`,
      ];
    }),
    cheaperAlternativeSummaries: intelligentItems.slice(0, 5).flatMap((item) => {
      const alternative = item.vendorIntelligence?.cheapestAlternative;
      if (!alternative) {
        return [];
      }
      return [
        `${item.itemDescription}: cheaper alternative ${alternative.optionName}${typeof alternative.price === 'number' ? ` at $${alternative.price.toFixed(2)}` : ''}`,
      ];
    }),
    bundleOpportunitySummaries: intelligentItems.slice(0, 5).flatMap((item) => {
      const bundle = item.vendorIntelligence?.bundleSuggestion;
      if (!bundle) {
        return [];
      }
      return [
        `${item.itemDescription}: bundle opportunity with ${bundle.triggerName} and ${bundle.companionCount} companion item${bundle.companionCount === 1 ? '' : 's'}`,
      ];
    }),
  };
};

const createProcurementReviewGuidanceSummary = async (
  orgId: string,
  inspectionId: string
): Promise<InspectionProcurementReviewGuidanceSummary | undefined> => {
  const drafts = await ProcurementDraftService.listDrafts(orgId);
  const relevantDrafts = drafts.filter((draft) =>
    draft.items.some((item) => item.inspectionId === inspectionId && (item.reviewGuidance?.length || 0) > 0)
  );
  const reviewItems = relevantDrafts.flatMap((draft) =>
    draft.items.filter((item) => item.inspectionId === inspectionId && (item.reviewGuidance?.length || 0) > 0)
  );

  if (reviewItems.length === 0) {
    return undefined;
  }

  const guidanceEntries = reviewItems.flatMap((item) => item.reviewGuidance || []);

  return {
    draftCount: relevantDrafts.length,
    reviewItemCount: reviewItems.length,
    guidanceCount: guidanceEntries.length,
    codes: Array.from(new Set(guidanceEntries.map((entry) => entry.code))),
    summaries: reviewItems.slice(0, 6).flatMap((item) =>
      (item.reviewGuidance || []).slice(0, 1).map((entry) => `${item.itemDescription}: ${entry.title.replace('Review recommended: ', '')}`)
    ),
  };
};

export const InspectionReportSnapshotService = {
  async buildSnapshot(orgId: string, inspectionId: string): Promise<InspectionReportSnapshot | null> {
    const inspections = await InspectionService.listInspections(orgId);
    const inspection = inspections.find((entry) => entry.id === inspectionId);

    if (!inspection) {
      return null;
    }

    const [findings, tasks, materials, procurementOptimization, procurementVendorIntelligence, procurementReviewGuidance] = await Promise.all([
      FindingService.listFindings(orgId, { inspectionId }),
      RepairTaskService.listTasks(orgId, { inspectionId }),
      MaterialRequirementService.listRequirements(orgId, { inspectionId }),
      createProcurementOptimizationSummary(orgId, inspectionId),
      createProcurementVendorIntelligenceSummary(orgId, inspectionId),
      createProcurementReviewGuidanceSummary(orgId, inspectionId),
    ]);

    return {
      inspectionId: inspection.id,
      unitId: inspection.unitId,
      generatedAt: Date.now(),
      findings,
      repairTasks: tasks,
      materialRequirements: materials,
      summary: createInspectionOperationalSummary(inspection, findings, tasks, materials),
      procurementOptimization,
      procurementVendorIntelligence,
      procurementReviewGuidance,
    };
  },
};
