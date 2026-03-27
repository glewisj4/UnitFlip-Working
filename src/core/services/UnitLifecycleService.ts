import { Inspection, Unit } from '../models/inspections';
import { Finding, MaterialCorrectionRoute, MaterialRequirement, RepairTask } from '../models/operations';

export type UnitLifecycleHealthLabel = 'needs_attention' | 'active_work' | 'complete' | 'clear';
export type UnitLifecycleStageStatus = 'not_started' | 'active' | 'attention' | 'complete';
export type UnitLifecycleBlockerStage = 'inspection' | 'scope' | 'procurement' | 'vendor' | 'verification';

export interface UnitLifecycleBlocker {
  code:
    | 'inspection_pending'
    | 'findings_open'
    | 'tasks_active'
    | 'tasks_blocked'
    | 'materials_pending'
    | 'verification_pending'
    | 'verification_failed'
    | 'partial_receipt'
    | 'rework_required';
  stage: UnitLifecycleBlockerStage;
  count: number;
  label: string;
  detail: string;
  correctionRoute?: MaterialCorrectionRoute;
  correctiveActionLabel?: string;
  correctiveActionDetail?: string;
}

export interface UnitLifecycleCorrectiveGuidance {
  route: MaterialCorrectionRoute;
  stage: UnitLifecycleBlockerStage;
  count: number;
  label: string;
  detail: string;
  actionLabel: string;
}

export interface UnitLifecycleSignals {
  latestInspection: Inspection | null;
  resumableInspection: Inspection | null;
  latestInspectionStatus: Inspection['status'] | 'none';
  unresolvedFindingsCount: number;
  activeTasksCount: number;
  blockedTasksCount: number;
  openTasksCount: number;
  pendingMaterialsCount: number;
  procurementReadyCount: number;
  activatedCount: number;
  orderedCount: number;
  vendorAssignedCount: number;
  vendorAcknowledgedCount: number;
  vendorInProgressCount: number;
  vendorCompletedCount: number;
  pendingReceivingCount: number;
  pendingVerificationCount: number;
  fulfilledCount: number;
  failedVerificationCount: number;
  partialReceiptCount: number;
  reworkRequiredCount: number;
  reopenedCount: number;
  lastInspectionAt?: number;
  lastActivityAt?: number;
  healthLabel: UnitLifecycleHealthLabel;
  needsAttention: boolean;
  isComplete: boolean;
  stageStatus: Record<'inspection' | 'scope' | 'procurement' | 'vendor' | 'verification', UnitLifecycleStageStatus>;
  whyNotComplete: UnitLifecycleBlocker[];
  correctionRouteCounts: Record<MaterialCorrectionRoute, number>;
  correctiveGuidance: UnitLifecycleCorrectiveGuidance[];
  primaryCorrectiveGuidance: UnitLifecycleCorrectiveGuidance | null;
}

const getLatestTimestamp = (values: Array<number | undefined>) => {
  const timestamps = values.filter((value): value is number => typeof value === 'number');
  if (timestamps.length === 0) return undefined;
  return timestamps.reduce((latest, current) => Math.max(latest, current), 0);
};

const isOpenMaterial = (material: MaterialRequirement) => !['fulfilled', 'canceled'].includes(material.status);

const correctionRouteCopy: Record<
  MaterialCorrectionRoute,
  Pick<UnitLifecycleCorrectiveGuidance, 'label' | 'detail' | 'actionLabel' | 'stage'>
> = {
  vendor: {
    stage: 'vendor',
    label: 'Return to vendor execution',
    detail: 'The issue points back to vendor execution quality or completion.',
    actionLabel: 'Open Vendor Queue',
  },
  procurement: {
    stage: 'procurement',
    label: 'Return to procurement review',
    detail: 'The selected procurement product or activation path needs to be corrected.',
    actionLabel: 'Open Procurement',
  },
  scope: {
    stage: 'scope',
    label: 'Return to structured scope',
    detail: 'The work definition, task, or material requirement needs to be corrected in scope.',
    actionLabel: 'Open Scope Correction',
  },
};

const correctionRoutePriority: MaterialCorrectionRoute[] = ['scope', 'procurement', 'vendor'];

const getPreferredCorrectionRoute = (
  materials: MaterialRequirement[],
  predicate: (material: MaterialRequirement) => boolean,
  fallback: MaterialCorrectionRoute
): MaterialCorrectionRoute => {
  const counts: Record<MaterialCorrectionRoute, number> = {
    vendor: 0,
    procurement: 0,
    scope: 0,
  };

  materials.forEach((material) => {
    if (!predicate(material) || !material.correctionRoute) {
      return;
    }
    counts[material.correctionRoute] += 1;
  });

  return correctionRoutePriority.find((route) => counts[route] > 0) || fallback;
};

export const UnitLifecycleService = {
  deriveSignals(
    unit: Unit,
    unitInspections: Inspection[],
    unitFindings: Finding[],
    unitTasks: RepairTask[],
    unitMaterials: MaterialRequirement[]
  ): UnitLifecycleSignals {
    const latestInspection = unitInspections[0] || null;
    const resumableInspection = unitInspections.find((inspection) => inspection.status !== 'completed') || null;
    const unresolvedFindingsCount = unitFindings.filter((finding) => finding.status !== 'resolved').length;
    const blockedTasksCount = unitTasks.filter((task) => task.status === 'blocked').length;
    const activeTasksCount = unitTasks.filter((task) => task.status === 'ready' || task.status === 'in_progress').length;
    const openTasksCount = unitTasks.filter((task) => task.status !== 'done').length;
    const pendingMaterialsCount = unitMaterials.filter(isOpenMaterial).length;
    const procurementReadyCount = unitMaterials.filter((material) => material.procurementState === 'ready_for_procurement').length;
    const activatedCount = unitMaterials.filter((material) => material.procurementState === 'activated').length;
    const orderedCount = unitMaterials.filter((material) => material.procurementState === 'ordered').length;
    const vendorAssignedCount = unitMaterials.filter((material) => material.vendorActionState === 'assigned').length;
    const vendorAcknowledgedCount = unitMaterials.filter((material) => material.vendorActionState === 'acknowledged').length;
    const vendorInProgressCount = unitMaterials.filter((material) => material.vendorActionState === 'in_progress').length;
    const vendorCompletedCount = unitMaterials.filter((material) => material.vendorActionState === 'completed').length;
    const pendingReceivingCount = unitMaterials.filter(
      (material) => material.vendorActionState === 'completed' && (material.verificationStatus || 'pending') === 'pending'
    ).length;
    const pendingVerificationCount = unitMaterials.filter((material) => material.verificationStatus === 'received').length;
    const fulfilledCount = unitMaterials.filter((material) => material.procurementState === 'fulfilled').length;
    const failedVerificationCount = unitMaterials.filter((material) => material.closeoutIssueState === 'verification_failed').length;
    const partialReceiptCount = unitMaterials.filter((material) => material.closeoutIssueState === 'partial_receipt').length;
    const reworkRequiredCount = unitMaterials.filter((material) => material.closeoutIssueState === 'rework_required').length;
    const reopenedCount = unitMaterials.filter((material) => typeof material.reopenedAt === 'number').length;
    const effectiveReworkCount = unitMaterials.filter(
      (material) => material.closeoutIssueState === 'rework_required' || typeof material.reopenedAt === 'number'
    ).length;
    const correctionRouteCounts: Record<MaterialCorrectionRoute, number> = {
      vendor: 0,
      procurement: 0,
      scope: 0,
    };
    unitMaterials.forEach((material) => {
      const hasCorrectionIssue =
        (material.closeoutIssueState || 'none') !== 'none' || typeof material.reopenedAt === 'number';
      if (!hasCorrectionIssue || !material.correctionRoute) {
        return;
      }
      correctionRouteCounts[material.correctionRoute] += 1;
    });

    const hasInspectionHistory = unitInspections.length > 0;
    const hasInspectionPending = !hasInspectionHistory || unitInspections.some((inspection) => inspection.status !== 'completed');
    const hasOpenScope = unresolvedFindingsCount > 0 || openTasksCount > 0;
    const hasOpenMaterials = unitMaterials.some((material) => {
      const procurementState = material.procurementState || 'scoped_only';
      const verificationStatus = material.verificationStatus || 'pending';
      const vendorState = material.vendorActionState || 'unassigned';
      return (
        procurementState !== 'fulfilled' ||
        verificationStatus !== 'verified' ||
        !['unassigned', 'completed'].includes(vendorState) ||
        (material.closeoutIssueState || 'none') !== 'none'
      );
    });

    const isComplete = hasInspectionHistory && !hasInspectionPending && !hasOpenScope && !hasOpenMaterials;
    const needsAttention =
      unresolvedFindingsCount > 0 ||
      blockedTasksCount > 0 ||
      pendingReceivingCount > 0 ||
      pendingVerificationCount > 0 ||
      procurementReadyCount > 0 ||
      failedVerificationCount > 0 ||
      partialReceiptCount > 0 ||
      reworkRequiredCount > 0;

    let healthLabel: UnitLifecycleHealthLabel = 'clear';
    if (isComplete) {
      healthLabel = 'complete';
    } else if (needsAttention) {
      healthLabel = 'needs_attention';
    } else if (
      latestInspection?.status === 'in_progress' ||
      activeTasksCount > 0 ||
      activatedCount > 0 ||
      orderedCount > 0 ||
      vendorAssignedCount > 0 ||
      vendorAcknowledgedCount > 0 ||
      vendorInProgressCount > 0
    ) {
      healthLabel = 'active_work';
    }

    const stageStatus: UnitLifecycleSignals['stageStatus'] = {
      inspection: !hasInspectionHistory
        ? 'not_started'
        : hasInspectionPending
          ? 'active'
          : 'complete',
      scope: unresolvedFindingsCount > 0 || blockedTasksCount > 0 || correctionRouteCounts.scope > 0
        ? 'attention'
        : openTasksCount > 0 || pendingMaterialsCount > 0
          ? 'active'
          : hasInspectionHistory
            ? 'complete'
            : 'not_started',
      procurement: procurementReadyCount > 0 || correctionRouteCounts.procurement > 0
        ? 'attention'
        : activatedCount > 0 || orderedCount > 0
          ? 'active'
          : fulfilledCount > 0 && pendingMaterialsCount === 0
            ? 'complete'
            : pendingMaterialsCount > 0
              ? 'not_started'
              : 'complete',
      vendor: correctionRouteCounts.vendor > 0 || vendorAssignedCount > 0 || vendorAcknowledgedCount > 0
        ? 'attention'
        : vendorInProgressCount > 0
          ? 'active'
          : vendorCompletedCount > 0 || fulfilledCount > 0
            ? 'complete'
            : activatedCount > 0 || orderedCount > 0
              ? 'not_started'
              : 'complete',
      verification: pendingReceivingCount > 0 || pendingVerificationCount > 0 || failedVerificationCount > 0 || partialReceiptCount > 0
        ? 'attention'
        : fulfilledCount > 0
          ? 'complete'
          : vendorCompletedCount > 0
            ? 'active'
            : pendingMaterialsCount > 0
              ? 'not_started'
              : 'complete',
    };

    const whyNotComplete: UnitLifecycleBlocker[] = [];
    const correctiveGuidance: UnitLifecycleCorrectiveGuidance[] = correctionRoutePriority
      .filter((route) => correctionRouteCounts[route] > 0)
      .map((route) => ({
        route,
        stage: correctionRouteCopy[route].stage,
        count: correctionRouteCounts[route],
        label: correctionRouteCopy[route].label,
        detail: `${correctionRouteCounts[route]} requirement${correctionRouteCounts[route] === 1 ? '' : 's'} currently route back to ${route === 'scope' ? 'structured scope' : route}. ${correctionRouteCopy[route].detail}`,
        actionLabel: correctionRouteCopy[route].actionLabel,
      }));
    const primaryCorrectiveGuidance = correctiveGuidance[0] || null;

    if (hasInspectionPending) {
      whyNotComplete.push({
        code: 'inspection_pending',
        stage: 'inspection',
        count: unitInspections.filter((inspection) => inspection.status !== 'completed').length || 1,
        label: 'Inspection still open',
        detail: hasInspectionHistory ? 'An inspection for this unit is still draft or in progress.' : 'This unit has no completed inspection yet.',
      });
    }
    if (unresolvedFindingsCount > 0) {
      whyNotComplete.push({
        code: 'findings_open',
        stage: 'scope',
        count: unresolvedFindingsCount,
        label: 'Unresolved findings remain',
        detail: `${unresolvedFindingsCount} finding${unresolvedFindingsCount === 1 ? '' : 's'} still need follow-up.`,
      });
    }
    if (activeTasksCount > 0) {
      whyNotComplete.push({
        code: 'tasks_active',
        stage: 'scope',
        count: activeTasksCount,
        label: 'Repair tasks still active',
        detail: `${activeTasksCount} task${activeTasksCount === 1 ? '' : 's'} are still ready or in progress.`,
      });
    }
    if (blockedTasksCount > 0) {
      whyNotComplete.push({
        code: 'tasks_blocked',
        stage: 'scope',
        count: blockedTasksCount,
        label: 'Blocked repair tasks',
        detail: `${blockedTasksCount} task${blockedTasksCount === 1 ? '' : 's'} are blocked and need review.`,
      });
    }
    if (pendingMaterialsCount > 0 && procurementReadyCount + activatedCount + orderedCount > 0) {
      whyNotComplete.push({
        code: 'materials_pending',
        stage: 'procurement',
        count: pendingMaterialsCount,
        label: 'Material work still open',
        detail: `${pendingMaterialsCount} material requirement${pendingMaterialsCount === 1 ? '' : 's'} are still active in procurement or fulfillment.`,
      });
    }
    if (pendingReceivingCount + pendingVerificationCount > 0) {
      whyNotComplete.push({
        code: 'verification_pending',
        stage: 'verification',
        count: pendingReceivingCount + pendingVerificationCount,
        label: 'Closeout still pending',
        detail:
          pendingReceivingCount > 0
            ? `${pendingReceivingCount} requirement${pendingReceivingCount === 1 ? '' : 's'} still need receiving before verification.`
            : `${pendingVerificationCount} requirement${pendingVerificationCount === 1 ? '' : 's'} are waiting on internal verification.`,
      });
    }
    if (failedVerificationCount > 0) {
      const route = getPreferredCorrectionRoute(
        unitMaterials,
        (material) => material.closeoutIssueState === 'verification_failed',
        primaryCorrectiveGuidance?.route || 'vendor'
      );
      whyNotComplete.push({
        code: 'verification_failed',
        stage: 'verification',
        count: failedVerificationCount,
        label: 'Verification failed',
        detail: `${failedVerificationCount} requirement${failedVerificationCount === 1 ? '' : 's'} failed closeout review and need corrective action.`,
        correctionRoute: route,
        correctiveActionLabel: route ? correctionRouteCopy[route].actionLabel : undefined,
        correctiveActionDetail: route ? correctionRouteCopy[route].detail : undefined,
      });
    }
    if (partialReceiptCount > 0) {
      const route = getPreferredCorrectionRoute(
        unitMaterials,
        (material) => material.closeoutIssueState === 'partial_receipt',
        correctionRouteCounts.vendor > 0 ? 'vendor' : 'procurement'
      );
      whyNotComplete.push({
        code: 'partial_receipt',
        stage: 'verification',
        count: partialReceiptCount,
        label: 'Partial receipt recorded',
        detail: `${partialReceiptCount} requirement${partialReceiptCount === 1 ? '' : 's'} were only partially received and still need resolution.`,
        correctionRoute: route,
        correctiveActionLabel: correctionRouteCopy[route].actionLabel,
        correctiveActionDetail: correctionRouteCopy[route].detail,
      });
    }
    if (effectiveReworkCount > 0) {
      const route = getPreferredCorrectionRoute(
        unitMaterials,
        (material) => material.closeoutIssueState === 'rework_required' || typeof material.reopenedAt === 'number',
        primaryCorrectiveGuidance?.route || (vendorAssignedCount + vendorAcknowledgedCount + vendorInProgressCount > 0 ? 'vendor' : 'procurement')
      );
      whyNotComplete.push({
        code: 'rework_required',
        stage: correctionRouteCopy[route].stage,
        count: effectiveReworkCount,
        label: 'Rework is required',
        detail: `${effectiveReworkCount} requirement${effectiveReworkCount === 1 ? '' : 's'} have been reopened and routed back into execution.`,
        correctionRoute: route,
        correctiveActionLabel: correctionRouteCopy[route].actionLabel,
        correctiveActionDetail: correctionRouteCopy[route].detail,
      });
    }

    return {
      latestInspection,
      resumableInspection,
      latestInspectionStatus: latestInspection?.status || 'none',
      unresolvedFindingsCount,
      activeTasksCount,
      blockedTasksCount,
      openTasksCount,
      pendingMaterialsCount,
      procurementReadyCount,
      activatedCount,
      orderedCount,
      vendorAssignedCount,
      vendorAcknowledgedCount,
      vendorInProgressCount,
      vendorCompletedCount,
      pendingReceivingCount,
      pendingVerificationCount,
      fulfilledCount,
      failedVerificationCount,
      partialReceiptCount,
      reworkRequiredCount,
      reopenedCount,
      lastInspectionAt: latestInspection?.updatedAt,
      lastActivityAt: getLatestTimestamp([
        unit.updatedAt,
        latestInspection?.updatedAt,
        unitFindings[0]?.updatedAt,
        unitTasks[0]?.updatedAt,
        ...unitMaterials.map((material) => material.updatedAt),
      ]),
      healthLabel,
      needsAttention,
      isComplete,
      stageStatus,
      whyNotComplete,
      correctionRouteCounts,
      correctiveGuidance,
      primaryCorrectiveGuidance,
    };
  },
};
