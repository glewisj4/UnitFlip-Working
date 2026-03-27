import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import {
  MaterialCloseoutIssueState,
  MaterialCorrectionRoute,
  MaterialProcurementState,
  MaterialRequirement,
  MaterialVerificationStatus,
  MaterialVendorActionState,
} from '../models/operations';
import { createPrefixedId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';

const STORAGE_KEY_PREFIX = 'unitflip_material_requirements_v1:';
const adapter = createLocalDbAdapter();

type MaterialRequirementCreateInput = Omit<MaterialRequirement, 'id' | 'createdAt' | 'updatedAt'>;

const deriveProcurementState = (requirement: MaterialRequirement): MaterialProcurementState => {
  if (requirement.procurementState) {
    return requirement.procurementState;
  }

  if (requirement.status === 'fulfilled') return 'fulfilled';
  if (requirement.status === 'ordered') return 'ordered';
  if (['planned', 'quoted'].includes(requirement.status)) return 'activated';
  if (requirement.status === 'reviewed' && requirement.selectedMatch) return 'ready_for_procurement';
  return 'scoped_only';
};

const deriveVendorActionState = (requirement: MaterialRequirement): MaterialVendorActionState => {
  if (requirement.vendorActionState) {
    return requirement.vendorActionState;
  }

  if (requirement.assignedVendorUserId) {
    return 'assigned';
  }

  return 'unassigned';
};

const deriveVerificationStatus = (requirement: MaterialRequirement): MaterialVerificationStatus => {
  if (requirement.verificationStatus) {
    return requirement.verificationStatus;
  }

  if (requirement.verifiedAt || requirement.procurementState === 'fulfilled') {
    return 'verified';
  }

  if (requirement.receivedAt) {
    return 'received';
  }

  return 'pending';
};

const deriveCloseoutIssueState = (requirement: MaterialRequirement): MaterialCloseoutIssueState => {
  if (requirement.closeoutIssueState) {
    return requirement.closeoutIssueState;
  }

  return 'none';
};

const deriveCorrectionRoute = (requirement: MaterialRequirement): MaterialCorrectionRoute | undefined => {
  if ((requirement.closeoutIssueState || 'none') === 'none') {
    return undefined;
  }

  if (requirement.correctionRoute) {
    return requirement.correctionRoute;
  }

  if ((requirement.closeoutIssueState || 'none') === 'partial_receipt') {
    return 'vendor';
  }

  if ((requirement.closeoutIssueState || 'none') === 'verification_failed') {
    return 'vendor';
  }

  if ((requirement.closeoutIssueState || 'none') === 'rework_required') {
    if (requirement.assignedVendorUserId && (requirement.vendorActionState || 'unassigned') !== 'unassigned') {
      return 'vendor';
    }
    if (requirement.selectedMatch) {
      return 'procurement';
    }
    return 'scope';
  }

  return 'vendor';
};

const getAssignmentResetForRoute = (
  requirement: MaterialRequirement,
  correctionRoute: MaterialCorrectionRoute
): Pick<
  MaterialRequirement,
  'assignedVendorUserId' | 'assignedVendorDisplayName' | 'procurementAssignedAt' | 'procurementAssignedByUserId' | 'vendorActionState'
> => {
  if (correctionRoute === 'vendor') {
    return {
      assignedVendorUserId: requirement.assignedVendorUserId,
      assignedVendorDisplayName: requirement.assignedVendorDisplayName,
      procurementAssignedAt: requirement.procurementAssignedAt,
      procurementAssignedByUserId: requirement.procurementAssignedByUserId,
      vendorActionState: requirement.assignedVendorUserId ? 'assigned' : 'unassigned',
    };
  }

  return {
    assignedVendorUserId: undefined,
    assignedVendorDisplayName: undefined,
    procurementAssignedAt: undefined,
    procurementAssignedByUserId: undefined,
    vendorActionState: 'unassigned',
  };
};

const normalizeRequirement = (requirement: MaterialRequirement): MaterialRequirement => ({
  ...requirement,
  status: requirement.status || 'draft',
  procurementState: deriveProcurementState(requirement),
  vendorActionState: deriveVendorActionState(requirement),
  verificationStatus: deriveVerificationStatus(requirement),
  closeoutIssueState: deriveCloseoutIssueState(requirement),
  correctionRoute: deriveCorrectionRoute(requirement),
  vendorCompletionNote: requirement.vendorCompletionNote?.trim() || undefined,
  vendorCompletionDetails: requirement.vendorCompletionDetails?.trim() || undefined,
});

export const MaterialRequirementService = {
  async listRequirements(
    orgId: string,
    filters?: { inspectionId?: string; repairTaskId?: string }
  ): Promise<MaterialRequirement[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const requirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];

    return requirements
      .map((requirement) => normalizeRequirement(requirement))
      .filter((requirement) => {
        if (filters?.inspectionId && requirement.inspectionId !== filters.inspectionId) return false;
        if (filters?.repairTaskId && requirement.repairTaskId !== filters.repairTaskId) return false;
        return true;
      })
      .sort((a, b) => a.itemDescription.localeCompare(b.itemDescription));
  },

  async updateRequirement(
    orgId: string,
    requirement: MaterialRequirement,
    userId: string
  ): Promise<MaterialRequirement> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const requirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];
    const existing = requirements.find((entry) => entry.id === requirement.id);
    if (!existing) {
      throw new Error('Material requirement not found.');
    }

    if (['fulfilled', 'canceled'].includes(existing.status) && ['draft', 'reviewed'].includes(requirement.status)) {
      throw new Error('Fulfilled or canceled material requirements cannot move back to draft or reviewed.');
    }

    const nextProcurementState = deriveProcurementState(requirement);
    const nextVendorActionState = deriveVendorActionState(requirement);
    const nextVerificationStatus = deriveVerificationStatus(requirement);
    const nextCloseoutIssueState = deriveCloseoutIssueState(requirement);
    const nextCorrectionRoute = deriveCorrectionRoute({
      ...requirement,
      procurementState: nextProcurementState,
      vendorActionState: nextVendorActionState,
      verificationStatus: nextVerificationStatus,
      closeoutIssueState: nextCloseoutIssueState,
    });
    if (['activated', 'ordered'].includes(nextProcurementState) && !requirement.selectedMatch) {
      throw new Error('Select a procurement product before activating or ordering this material requirement.');
    }

    if (requirement.assignedVendorUserId) {
      if (!['activated', 'ordered', 'fulfilled'].includes(nextProcurementState)) {
        throw new Error('Only activated, ordered, or fulfilled material requirements can be assigned to a vendor.');
      }
      if (!requirement.selectedMatch) {
        throw new Error('Select a procurement product before assigning a vendor.');
      }
    }

    if (!requirement.assignedVendorUserId && nextVendorActionState !== 'unassigned') {
      throw new Error('Assign a vendor before updating vendor action status.');
    }

    if (nextVendorActionState === 'completed' && !requirement.assignedVendorUserId) {
      throw new Error('Assign a vendor before completing vendor work.');
    }

    if (nextVerificationStatus === 'received' && nextVendorActionState !== 'completed') {
      throw new Error('Vendor work must be completed before this requirement can be marked received.');
    }

    if (nextVerificationStatus === 'verified') {
      if (nextVendorActionState !== 'completed') {
        throw new Error('Vendor work must be completed before this requirement can be verified.');
      }
      if (!requirement.receivedAt) {
        throw new Error('Mark the requirement received before verifying it.');
      }
    }

    if (nextProcurementState === 'fulfilled' && nextVerificationStatus !== 'verified') {
      throw new Error('Only verified material requirements can move to fulfilled.');
    }

    if (nextProcurementState === 'fulfilled' && nextCloseoutIssueState !== 'none') {
      throw new Error('Resolve closeout issues before marking a material requirement fulfilled.');
    }

    const updatedRequirement = normalizeRequirement({
      ...requirement,
      procurementState: nextProcurementState,
      vendorActionState: nextVendorActionState,
      verificationStatus: nextVerificationStatus,
      closeoutIssueState: nextCloseoutIssueState,
      procurementReadyAt:
        requirement.procurementReadyAt ||
        (nextProcurementState === 'ready_for_procurement' ? Date.now() : undefined),
      procurementActivatedAt:
        requirement.procurementActivatedAt ||
        (nextProcurementState === 'activated' || nextProcurementState === 'ordered' ? Date.now() : undefined),
      procurementAssignedAt:
        requirement.assignedVendorUserId
          ? requirement.procurementAssignedAt || Date.now()
          : undefined,
      assignedVendorDisplayName:
        requirement.assignedVendorUserId
          ? requirement.assignedVendorDisplayName
          : undefined,
      procurementAssignedByUserId:
        requirement.assignedVendorUserId
          ? requirement.procurementAssignedByUserId
          : undefined,
      vendorActionUpdatedAt:
        nextVendorActionState !== existing.vendorActionState ? Date.now() : requirement.vendorActionUpdatedAt,
      vendorActionUpdatedByUserId:
        nextVendorActionState !== existing.vendorActionState ? userId : requirement.vendorActionUpdatedByUserId,
      vendorCompletedAt:
        nextVendorActionState === 'completed'
          ? requirement.vendorCompletedAt || Date.now()
          : requirement.vendorCompletedAt,
      vendorCompletedByUserId:
        nextVendorActionState === 'completed'
          ? requirement.vendorCompletedByUserId || userId
          : requirement.vendorCompletedByUserId,
      receivedAt:
        nextVerificationStatus === 'received' || nextVerificationStatus === 'verified'
          ? requirement.receivedAt || Date.now()
          : nextCloseoutIssueState !== 'none'
            ? requirement.receivedAt
            : undefined,
      receivedByUserId:
        nextVerificationStatus === 'received' || nextVerificationStatus === 'verified'
          ? requirement.receivedByUserId || userId
          : nextCloseoutIssueState !== 'none'
            ? requirement.receivedByUserId
            : undefined,
      verifiedAt:
        nextVerificationStatus === 'verified'
          ? requirement.verifiedAt || Date.now()
          : undefined,
      verifiedByUserId:
        nextVerificationStatus === 'verified'
          ? requirement.verifiedByUserId || userId
          : undefined,
      closeoutIssueAt:
        nextCloseoutIssueState !== 'none'
          ? requirement.closeoutIssueAt || Date.now()
          : undefined,
      closeoutIssueByUserId:
        nextCloseoutIssueState !== 'none'
          ? requirement.closeoutIssueByUserId || userId
          : undefined,
      closeoutIssueNotes: nextCloseoutIssueState !== 'none' ? requirement.closeoutIssueNotes : undefined,
      correctionRoute: nextCloseoutIssueState !== 'none' ? nextCorrectionRoute : undefined,
      updatedAt: Date.now(),
    });

    await adapter.setItem(
      key,
      requirements.map((existing) => (existing.id === requirement.id ? updatedRequirement : existing))
    );
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_MATERIAL_REQUIREMENT',
      userId,
      payload: updatedRequirement as unknown as Record<string, unknown>,
    });

    return updatedRequirement;
  },

  async createRequirement(
    orgId: string,
    requirement: MaterialRequirementCreateInput,
    userId: string
  ): Promise<MaterialRequirement> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const requirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];
    const now = Date.now();
    const createdRequirement: MaterialRequirement = normalizeRequirement({
      ...requirement,
      status: requirement.status || 'draft',
      id: createPrefixedId('mat_'),
      createdAt: now,
      updatedAt: now,
    });

    requirements.push(createdRequirement);
    await adapter.setItem(key, requirements);
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_MATERIAL_REQUIREMENT',
      userId,
      payload: createdRequirement as unknown as Record<string, unknown>,
    });

    return createdRequirement;
  },

  async replaceForInspection(
    orgId: string,
    inspectionId: string,
    replacements: MaterialRequirementCreateInput[],
    userId: string
  ): Promise<MaterialRequirement[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const existingRequirements = (await adapter.getItem<MaterialRequirement[]>(key)) || [];
    const remainingRequirements = existingRequirements.filter(
      (requirement) => requirement.inspectionId !== inspectionId
    );
    const now = Date.now();
    const createdRequirements = replacements.map((requirement, index) => ({
      ...normalizeRequirement(requirement as MaterialRequirement),
      id: createPrefixedId('mat_'),
      createdAt: now + index,
      updatedAt: now + index,
    }));

    await adapter.setItem(key, [...remainingRequirements, ...createdRequirements]);

    const removedRequirements = existingRequirements.filter(
      (requirement) => requirement.inspectionId === inspectionId
    );
    for (const requirement of removedRequirements) {
      await SyncQueueService.enqueue(orgId, {
        type: 'DELETE_MATERIAL_REQUIREMENT',
        userId,
        payload: { materialRequirementId: requirement.id },
      });
    }

    for (const requirement of createdRequirements) {
      await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_MATERIAL_REQUIREMENT',
        userId,
        payload: requirement as unknown as Record<string, unknown>,
      });
    }

    return createdRequirements;
  },

  async clearForInspection(orgId: string, inspectionId: string, userId: string): Promise<void> {
    await this.replaceForInspection(orgId, inspectionId, [], userId);
  },

  async updateVendorActionState(
    orgId: string,
    requirement: MaterialRequirement,
    nextVendorActionState: MaterialVendorActionState,
    userId: string
  ): Promise<MaterialRequirement> {
    return this.updateRequirement(
      orgId,
      {
        ...requirement,
        vendorActionState: nextVendorActionState,
      },
      userId
    );
  },

  async markVendorCompleted(
    orgId: string,
    requirement: MaterialRequirement,
    userId: string,
    evidence?: {
      note?: string;
      details?: string;
    }
  ): Promise<MaterialRequirement> {
    return this.updateRequirement(
      orgId,
      {
        ...requirement,
        vendorActionState: 'completed',
        vendorCompletionNote: evidence?.note?.trim() || undefined,
        vendorCompletionDetails: evidence?.details?.trim() || undefined,
      },
      userId
    );
  },

  async markReceived(orgId: string, requirement: MaterialRequirement, userId: string): Promise<MaterialRequirement> {
    return this.updateRequirement(
      orgId,
      {
        ...requirement,
        verificationStatus: 'received',
        receivedAt: requirement.receivedAt || Date.now(),
        receivedByUserId: requirement.receivedByUserId || userId,
      },
      userId
    );
  },

  async markVerified(orgId: string, requirement: MaterialRequirement, userId: string): Promise<MaterialRequirement> {
    return this.updateRequirement(
      orgId,
      {
        ...requirement,
        verificationStatus: 'verified',
        closeoutIssueState: 'none',
        receivedAt: requirement.receivedAt || Date.now(),
        receivedByUserId: requirement.receivedByUserId || userId,
        verifiedAt: requirement.verifiedAt || Date.now(),
        verifiedByUserId: requirement.verifiedByUserId || userId,
        procurementState: 'fulfilled',
        status: 'fulfilled',
      },
      userId
    );
  },

  async markVerificationFailed(
    orgId: string,
    requirement: MaterialRequirement,
    userId: string,
    issueNotes?: string,
    correctionRoute?: MaterialCorrectionRoute
  ): Promise<MaterialRequirement> {
    const canFailVerification =
      ['received', 'verified'].includes(requirement.verificationStatus || 'pending') ||
      requirement.procurementState === 'fulfilled';

    if (!canFailVerification) {
      throw new Error('Only received, verified, or fulfilled requirements can record a verification failure.');
    }

    const nextCorrectionRoute = correctionRoute || deriveCorrectionRoute({
      ...requirement,
      closeoutIssueState: 'verification_failed',
    }) || 'vendor';
    const assignmentReset = getAssignmentResetForRoute(requirement, nextCorrectionRoute);
    const nextProcurementState =
      nextCorrectionRoute === 'scope'
        ? 'scoped_only'
        : nextCorrectionRoute === 'procurement'
          ? 'ready_for_procurement'
          : requirement.selectedMatch
            ? 'ordered'
            : 'ready_for_procurement';
    const nextStatus =
      nextCorrectionRoute === 'vendor'
        ? requirement.status === 'fulfilled'
          ? 'ordered'
          : requirement.status
        : 'reviewed';

    return this.updateRequirement(
      orgId,
      {
        ...requirement,
        verificationStatus: 'pending',
        procurementState: nextProcurementState,
        status: nextStatus,
        ...assignmentReset,
        verifiedAt: undefined,
        verifiedByUserId: undefined,
        closeoutIssueState: 'verification_failed',
        closeoutIssueNotes: issueNotes || 'Verification failed during internal closeout review.',
        closeoutIssueAt: Date.now(),
        closeoutIssueByUserId: userId,
        correctionRoute: nextCorrectionRoute,
      },
      userId
    );
  },

  async reopenForRework(
    orgId: string,
    requirement: MaterialRequirement,
    userId: string,
    issueNotes?: string,
    correctionRoute?: MaterialCorrectionRoute
  ): Promise<MaterialRequirement> {
    const canReopen =
      requirement.closeoutIssueState !== 'none' ||
      requirement.vendorActionState === 'completed' ||
      ['received', 'verified'].includes(requirement.verificationStatus || 'pending') ||
      requirement.procurementState === 'fulfilled';

    if (!canReopen) {
      throw new Error('Only completed or exception-blocked requirements can be reopened for rework.');
    }

    const nextCorrectionRoute = correctionRoute || deriveCorrectionRoute({
      ...requirement,
      closeoutIssueState: 'rework_required',
    }) || 'vendor';
    const assignmentReset = getAssignmentResetForRoute(requirement, nextCorrectionRoute);
    const nextProcurementState =
      nextCorrectionRoute === 'scope'
        ? 'scoped_only'
        : nextCorrectionRoute === 'procurement'
          ? 'ready_for_procurement'
          : requirement.selectedMatch
            ? 'activated'
            : 'ready_for_procurement';
    const nextStatus =
      nextCorrectionRoute === 'vendor' && requirement.selectedMatch
        ? 'planned'
        : 'reviewed';

    return this.updateRequirement(
      orgId,
      {
        ...requirement,
        procurementState: nextProcurementState,
        status: nextStatus,
        verificationStatus: 'pending',
        ...assignmentReset,
        receivedAt: undefined,
        receivedByUserId: undefined,
        verifiedAt: undefined,
        verifiedByUserId: undefined,
        closeoutIssueState: 'rework_required',
        closeoutIssueNotes: issueNotes || 'Requirement reopened for rework after closeout issue review.',
        closeoutIssueAt: Date.now(),
        closeoutIssueByUserId: userId,
        correctionRoute: nextCorrectionRoute,
        reopenedAt: Date.now(),
        reopenedByUserId: userId,
      },
      userId
    );
  },

  getSuggestedCorrectionRoute(requirement: MaterialRequirement): MaterialCorrectionRoute {
    return deriveCorrectionRoute(requirement) || 'vendor';
  },
};
