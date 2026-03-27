import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ClipboardList, Download, Loader2, RefreshCw, ShoppingCart, Sparkles } from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { Inspection, Unit } from '../core/models/inspections';
import {
  MaterialCloseoutIssueState,
  MaterialCorrectionRoute,
  MaterialProcurementState,
  MaterialRequirement,
  MaterialVerificationStatus,
  MaterialVendorActionState,
  MATERIAL_REQUIREMENT_STATUSES,
  MaterialRequirementStatus,
} from '../core/models/operations';
import {
  MaterialRequirementMatchCandidate,
  ProcurementDraft,
  ProcurementMaintenanceDigest,
  ProcurementOptimizationSignal,
  ProcurementPortfolioSummary,
  ProcurementRefreshAnalyticsSnapshot,
  ProcurementRefreshLedgerEntry,
  ProcurementReviewGuidanceCode,
  ProcurementVendorRiskSignal,
  SelectedProcurementOption,
} from '../core/models/procurement';
import { InspectionService } from '../core/services/InspectionService';
import { AuthPolicyService } from '../core/services/AuthPolicyService';
import { ClientLoggerService } from '../core/services/ClientLoggerService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { MaterialMatchingService } from '../core/services/MaterialMatchingService';
import { ProcurementDraftService } from '../core/services/ProcurementDraftService';
import { ProcurementExportService } from '../core/services/ProcurementExportService';
import { ProcurementMaintenanceSnapshotExportService } from '../core/services/ProcurementMaintenanceSnapshotExportService';
import { ProcurementMaintenanceDigestService } from '../core/services/ProcurementMaintenanceDigestService';
import { ProcurementRefreshAnalyticsService } from '../core/services/ProcurementRefreshAnalyticsService';
import { ProcurementPortfolioSummaryService } from '../core/services/ProcurementPortfolioSummaryService';
import { UnitService } from '../core/services/UnitService';
import { MaterialMatchComparisonModal } from './MaterialMatchComparisonModal';

type GroupBy = 'inspection' | 'category' | 'status';
type ProcurementMode = 'selection' | 'assignment' | 'vendor' | 'receiving' | 'verification' | 'exceptions' | 'completed';
type DraftFilter =
  | 'all'
  | 'needs_review'
  | 'never_refreshed'
  | 'stale_refresh'
  | 'no_offer'
  | 'vendor_issues'
  | 'has_manual_note'
  | 'no_manual_note';
type DraftSort =
  | 'most_stale'
  | 'most_review_needed'
  | 'highest_no_offer'
  | 'highest_optimized_cost'
  | 'most_recently_refreshed'
  | 'least_recently_refreshed';
type DraftGrouping = 'none' | 'triage';

interface ProcurementWorkspaceProps {
  focusedUnitId?: string | null;
  initialFocus?: 'all' | 'procurement' | 'vendor' | 'receiving' | 'verification';
  focusedRequirementId?: string | null;
  focusedRequirementIds?: string[] | null;
  originContextLabel?: string | null;
  arrivalContext?: {
    source: 'focused_submission';
    outcome: 'submitted' | 'queued';
    unitName: string;
    itemCount: number;
    estimatedTotal: number;
    nextStep: string;
  } | null;
  onClearUnitFocus?: () => void;
  onOpenInspectionScope?: (
    inspectionId: string,
    scopeSection?: 'findings' | 'tasks' | 'materials',
    originContextLabel?: string,
    scopeTarget?: {
      entityType: 'finding' | 'task' | 'material';
      entityId: string;
      originLabel?: string | null;
    }
  ) => void;
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const procurementStateLabel = (value: MaterialProcurementState | undefined) => titleCase(value || 'scoped_only');
const procurementStateTone: Record<MaterialProcurementState, string> = {
  scoped_only: 'bg-slate-100 text-slate-600',
  ready_for_procurement: 'bg-amber-100 text-amber-700',
  activated: 'bg-blue-100 text-blue-700',
  ordered: 'bg-violet-100 text-violet-700',
  fulfilled: 'bg-emerald-100 text-emerald-700',
};
const vendorActionStateLabel = (value: MaterialVendorActionState | undefined) => titleCase(value || 'unassigned');
const vendorActionStateTone: Record<MaterialVendorActionState, string> = {
  unassigned: 'bg-slate-100 text-slate-600',
  assigned: 'bg-amber-100 text-amber-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
};
const verificationStatusLabel = (value: MaterialVerificationStatus | undefined) => titleCase(value || 'pending');
const verificationStatusTone: Record<MaterialVerificationStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  received: 'bg-amber-100 text-amber-700',
  verified: 'bg-emerald-100 text-emerald-700',
};
const closeoutIssueStateLabel = (value: MaterialCloseoutIssueState | undefined) => titleCase(value || 'none');
const closeoutIssueStateTone: Record<MaterialCloseoutIssueState, string> = {
  none: 'bg-slate-100 text-slate-600',
  verification_failed: 'bg-rose-100 text-rose-700',
  partial_receipt: 'bg-amber-100 text-amber-700',
  rework_required: 'bg-violet-100 text-violet-700',
};
const correctionRouteLabel = (value: MaterialCorrectionRoute | undefined) => titleCase(value || 'vendor');
const correctionRouteTone: Record<MaterialCorrectionRoute, string> = {
  vendor: 'bg-violet-100 text-violet-700',
  procurement: 'bg-blue-100 text-blue-700',
  scope: 'bg-amber-100 text-amber-800',
};

const vendorStateGuide: Record<
  MaterialVendorActionState,
  {
    label: string;
    summary: string;
    nextAction: string;
  }
> = {
  unassigned: {
    label: 'Waiting on internal assignment',
    summary: 'This work is not yet in a vendor queue.',
    nextAction: 'No vendor action is available yet.',
  },
  assigned: {
    label: 'Needs acknowledgement',
    summary: 'This work has been assigned to you and is ready to accept.',
    nextAction: 'Acknowledge it first so internal users know you have picked it up.',
  },
  acknowledged: {
    label: 'Ready to start',
    summary: 'You have accepted this work, but have not started execution yet.',
    nextAction: 'Mark it in progress when you begin the work on site.',
  },
  in_progress: {
    label: 'Execution in progress',
    summary: 'This work is actively being completed by the vendor.',
    nextAction: 'Mark it completed when the assigned work is done.',
  },
  completed: {
    label: 'Waiting on internal closeout',
    summary: 'Vendor work is done and now waits on internal receiving or verification.',
    nextAction: 'No more vendor action is needed unless internal users reopen the item.',
  },
};

const vendorGroupGuide: Record<
  MaterialVendorActionState,
  {
    description: string;
  }
> = {
  unassigned: { description: 'These items are not vendor-actionable yet.' },
  assigned: { description: 'Newly assigned work that still needs an explicit acknowledgement.' },
  acknowledged: { description: 'Accepted work that is ready to begin, but has not started yet.' },
  in_progress: { description: 'Active vendor work currently underway.' },
  completed: { description: 'Completed vendor work waiting on internal receiving or verification.' },
};

const getCloseoutGuidance = (requirement: MaterialRequirement) => {
  const verificationStatus = requirement.verificationStatus || 'pending';
  const closeoutIssueState = requirement.closeoutIssueState || 'none';
  const vendorState = requirement.vendorActionState || 'unassigned';

  if (closeoutIssueState !== 'none') {
    return {
      tone: 'border-rose-200 bg-rose-50 text-rose-900',
      label: closeoutIssueState === 'verification_failed' ? 'Verification failed' : closeoutIssueState === 'rework_required' ? 'Rework required' : 'Partial receipt',
      detail: requirement.closeoutIssueNotes || 'This item needs correction routing instead of normal closeout.',
      nextAction: requirement.correctionRoute ? `Use ${correctionRouteLabel(requirement.correctionRoute)} routing to send the item back through the correct lifecycle stage.` : 'Choose a correction path and reroute the item.',
    };
  }

  if (vendorState === 'completed' && verificationStatus === 'pending') {
    return {
      tone: 'border-amber-200 bg-amber-50 text-amber-900',
      label: 'Ready to receive',
      detail: 'Vendor says this item is complete. Review the submitted completion context and receive it into internal closeout.',
      nextAction: 'Receive it first. Verification comes after receiving confirms the handoff.',
    };
  }

  if (verificationStatus === 'received') {
    return {
      tone: 'border-blue-200 bg-blue-50 text-blue-900',
      label: 'Ready to verify',
      detail: 'This item has already been received internally and is waiting on a final verification decision.',
      nextAction: 'Verify it to close the loop, or fail/reroute it if the vendor-completed work does not hold up.',
    };
  }

  if (verificationStatus === 'verified' || requirement.procurementState === 'fulfilled') {
    return {
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      label: 'Confidently closed',
      detail: 'Internal receiving and verification are complete for this item.',
      nextAction: 'No closeout action is needed unless a new issue reopens the item.',
    };
  }

  return {
    tone: 'border-slate-200 bg-slate-50 text-slate-900',
    label: 'Not ready for closeout',
    detail: 'Vendor execution or procurement work is still in progress before internal closeout can begin.',
    nextAction: 'Wait for vendor completion before receiving or verification actions become relevant.',
  };
};

const modeTone: Record<ProcurementMode, string> = {
  selection: 'border-amber-200 bg-amber-50 text-amber-900',
  assignment: 'border-slate-300 bg-white text-slate-900',
  vendor: 'border-violet-200 bg-violet-50 text-violet-900',
  receiving: 'border-amber-200 bg-amber-50 text-amber-900',
  verification: 'border-blue-200 bg-blue-50 text-blue-900',
  exceptions: 'border-rose-200 bg-rose-50 text-rose-900',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

const formatTimestamp = (timestamp?: number) => (timestamp ? new Date(timestamp).toLocaleString() : null);

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'default';

const buildVendorDirectory = (orgName?: string) => {
  const orgSlug = slugify(orgName || 'My Organization');
  return [
    {
      userId: 'local_user_val_vendor',
      displayName: 'Val Vendor',
      orgId: `local_org_${orgSlug}`,
    },
  ];
};

const optimizationSignalTone: Record<ProcurementOptimizationSignal, string> = {
  better_pack_size_available: 'bg-blue-100 text-blue-700',
  combine_with_other_units: 'bg-violet-100 text-violet-700',
  high_quantity_item: 'bg-amber-100 text-amber-700',
  overbuy_risk: 'bg-rose-100 text-rose-700',
};

const vendorSignalTone: Record<ProcurementVendorRiskSignal, string> = {
  no_offer: 'bg-rose-100 text-rose-700',
  cheaper_alternative: 'bg-amber-100 text-amber-700',
  stale_price: 'bg-slate-200 text-slate-700',
  bundle_opportunity: 'bg-emerald-100 text-emerald-700',
  unmatched_requirement: 'bg-orange-100 text-orange-700',
};

const freshnessTone: Record<string, string> = {
  Fresh: 'bg-emerald-100 text-emerald-700',
  Recent: 'bg-blue-100 text-blue-700',
  Stale: 'bg-slate-200 text-slate-700',
};

const reviewGuidanceTone: Record<ProcurementReviewGuidanceCode, string> = {
  low_confidence_match: 'bg-orange-100 text-orange-700',
  missing_pricing: 'bg-slate-200 text-slate-700',
  stale_vendor_data: 'bg-slate-200 text-slate-700',
  no_offer_available: 'bg-rose-100 text-rose-700',
  overbuy_risk: 'bg-rose-100 text-rose-700',
  cheaper_alternative_available: 'bg-amber-100 text-amber-700',
  bundle_review: 'bg-emerald-100 text-emerald-700',
};

const getRefreshRecency = (timestamp?: number): { label: string; tone: string } => {
  if (!timestamp) {
    return { label: 'Never refreshed', tone: 'bg-slate-100 text-slate-600' };
  }

  const ageMs = Date.now() - timestamp;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays <= 0) {
    return { label: 'Refreshed recently', tone: 'bg-emerald-100 text-emerald-700' };
  }

  if (ageDays >= 7) {
    return {
      label: `Refreshed ${ageDays} day${ageDays === 1 ? '' : 's'} ago`,
      tone: 'bg-amber-100 text-amber-700',
    };
  }

  return {
    label: `Refreshed ${ageDays} day${ageDays === 1 ? '' : 's'} ago`,
    tone: 'bg-blue-100 text-blue-700',
  };
};

const isStaleRefresh = (draft: ProcurementDraft): boolean => {
  if (!draft.intelligenceRefreshedAt) return false;
  const ageDays = Math.floor((Date.now() - draft.intelligenceRefreshedAt) / (1000 * 60 * 60 * 24));
  return ageDays >= 7;
};

const hasVendorIssues = (draft: ProcurementDraft): boolean =>
  draft.items.some(
    (item) =>
      item.vendorIntelligence?.riskSignals.includes('stale_price') ||
      item.vendorIntelligence?.riskSignals.includes('cheaper_alternative') ||
      item.vendorIntelligence?.riskSignals.includes('bundle_opportunity')
  );

const hasNoOffer = (draft: ProcurementDraft): boolean =>
  draft.items.some(
    (item) =>
      item.vendorIntelligence?.riskSignals.includes('no_offer') ||
      item.vendorIntelligence?.riskSignals.includes('unmatched_requirement')
  );

const hasManualNote = (draft: ProcurementDraft): boolean => Boolean(draft.manualAnnotation?.note?.trim());

const getRefreshAgeDays = (draft: ProcurementDraft): number | null => {
  if (!draft.intelligenceRefreshedAt) return null;
  return Math.floor((Date.now() - draft.intelligenceRefreshedAt) / (1000 * 60 * 60 * 24));
};

const getTrendLabel = (delta: number): string => {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
};

const getTrendTone = (delta: number): string => {
  if (delta > 0) return 'text-rose-700';
  if (delta < 0) return 'text-emerald-700';
  return 'text-slate-600';
};

const getProcurementModeLabel = (mode: ProcurementMode) => titleCase(mode);

const summarizeRefreshChanges = (draft: ProcurementDraft): string[] => {
  const summary = draft.lastRefreshSummary;
  if (!summary || !draft.intelligenceRefreshedAt) {
    return [];
  }

  const changes: string[] = [];
  if (summary.optimizationChangedItemCount > 0) {
    changes.push(`Optimization changed on ${summary.optimizationChangedItemCount} item${summary.optimizationChangedItemCount === 1 ? '' : 's'}`);
  }
  if (summary.vendorChangedItemCount > 0) {
    changes.push(`Vendor signals changed on ${summary.vendorChangedItemCount} item${summary.vendorChangedItemCount === 1 ? '' : 's'}`);
  }
  if (summary.reviewGuidanceAddedCount > 0) {
    changes.push(`${summary.reviewGuidanceAddedCount} review guidance item${summary.reviewGuidanceAddedCount === 1 ? '' : 's'} added`);
  }
  if (summary.reviewGuidanceRemovedCount > 0) {
    changes.push(`${summary.reviewGuidanceRemovedCount} review guidance item${summary.reviewGuidanceRemovedCount === 1 ? '' : 's'} removed`);
  }
  if (summary.noOfferItemDelta !== 0) {
    changes.push(
      summary.noOfferItemDelta > 0
        ? `${summary.noOfferItemDelta} more no-offer item${summary.noOfferItemDelta === 1 ? '' : 's'}`
        : `${Math.abs(summary.noOfferItemDelta)} fewer no-offer item${Math.abs(summary.noOfferItemDelta) === 1 ? '' : 's'}`
    );
  }

  if (changes.length === 0) {
    changes.push('No intelligence changes detected on the last refresh');
  }

  return changes;
};

const summarizePackStrategy = (draft: ProcurementDraft): string | null => {
  const optimizedItems = draft.items.filter((item) => item.optimization);
  if (optimizedItems.length === 0) {
    return null;
  }

  const totalSelections = optimizedItems.reduce(
    (sum, item) => sum + (item.optimization?.recommendedPacks.length || 0),
    0
  );
  const totalCoverage = optimizedItems.reduce(
    (sum, item) => sum + (item.optimization?.estimatedCoverageQuantity || 0),
    0
  );

  return `${optimizedItems.length} optimized item${optimizedItems.length === 1 ? '' : 's'} across ${totalSelections} recommended pack selection${totalSelections === 1 ? '' : 's'} covering ${totalCoverage.toFixed(1)} units.`;
};

const summarizeTradeoff = (draft: ProcurementDraft): string | null => {
  const optimizedItems = draft.items.filter((item) => item.optimization);
  if (optimizedItems.length === 0) {
    return null;
  }

  const estimatedCost = optimizedItems.reduce(
    (sum, item) => sum + (item.optimization?.estimatedTotalCost || 0),
    0
  );
  const estimatedWaste = optimizedItems.reduce(
    (sum, item) => sum + (item.optimization?.estimatedWasteQuantity || 0),
    0
  );

  return `Estimated optimized cost $${estimatedCost.toFixed(2)} with ${estimatedWaste.toFixed(1)} units of projected waste.`;
};

const collectOptimizationSignals = (draft: ProcurementDraft): ProcurementOptimizationSignal[] =>
  Array.from(
    new Set(
      draft.items.flatMap((item) => item.optimization?.signals || [])
    )
  );

const collectVendorSignals = (draft: ProcurementDraft): ProcurementVendorRiskSignal[] =>
  Array.from(
    new Set(
      draft.items.flatMap((item) => item.vendorIntelligence?.riskSignals || [])
    )
  );

const summarizeVendorInsight = (draft: ProcurementDraft): string | null => {
  const vendorItems = draft.items.filter((item) => item.vendorIntelligence?.selectedOffer);
  if (vendorItems.length === 0) {
    return null;
  }

  const staleCount = vendorItems.filter(
    (item) => item.vendorIntelligence?.selectedOffer?.freshnessLabel === 'Stale'
  ).length;
  const cheaperAlternativeCount = draft.items.filter((item) =>
    item.vendorIntelligence?.riskSignals.includes('cheaper_alternative')
  ).length;

  return `${vendorItems.length} item${vendorItems.length === 1 ? '' : 's'} have selected vendor guidance${staleCount > 0 ? `, including ${staleCount} stale offer${staleCount === 1 ? '' : 's'}` : ''}${cheaperAlternativeCount > 0 ? ` and ${cheaperAlternativeCount} cheaper alternative signal${cheaperAlternativeCount === 1 ? '' : 's'}` : ''}.`;
};

const getReviewGuidanceEntries = (draft: ProcurementDraft) =>
  draft.items.flatMap((item) =>
    (item.reviewGuidance || []).map((entry) => ({
      itemDescription: item.itemDescription,
      entry,
    }))
  );

const getOptimizationStats = (draft: ProcurementDraft) => {
  const optimizedItems = draft.items.filter((item) => item.optimization);
  return {
    optimizedCount: optimizedItems.length,
    estimatedCost: optimizedItems.reduce((sum, item) => sum + (item.optimization?.estimatedTotalCost || 0), 0),
    projectedWaste: optimizedItems.reduce((sum, item) => sum + (item.optimization?.estimatedWasteQuantity || 0), 0),
  };
};

const getReviewNeededCount = (draft: ProcurementDraft): number =>
  draft.items.filter((item) => (item.reviewGuidance?.length || 0) > 0).length;

const getNoOfferCount = (draft: ProcurementDraft): number =>
  draft.items.filter(
    (item) =>
      item.vendorIntelligence?.riskSignals.includes('no_offer') ||
      item.vendorIntelligence?.riskSignals.includes('unmatched_requirement')
  ).length;

const getRefreshAgeSortValue = (draft: ProcurementDraft): number => {
  const age = getRefreshAgeDays(draft);
  return age === null ? Number.POSITIVE_INFINITY : age;
};

const getDraftGroupLabel = (draft: ProcurementDraft): string => {
  if (getReviewNeededCount(draft) > 0) {
    return 'Needs Review';
  }
  if (isStaleRefresh(draft)) {
    return 'Stale Refresh';
  }
  if (hasManualNote(draft)) {
    return 'Has Manual Note';
  }
  if (hasNoOffer(draft) || hasVendorIssues(draft)) {
    return 'No Offer / Vendor Issues';
  }
  return 'Other Drafts';
};

const getVendorStats = (draft: ProcurementDraft) => {
  const vendorItems = draft.items.filter((item) => item.vendorIntelligence?.selectedOffer);
  const staleCount = vendorItems.filter(
    (item) => item.vendorIntelligence?.selectedOffer?.freshnessLabel === 'Stale'
  ).length;
  const cheaperAlternativeCount = draft.items.filter((item) =>
    item.vendorIntelligence?.riskSignals.includes('cheaper_alternative')
  ).length;
  const bundleCount = draft.items.filter((item) =>
    item.vendorIntelligence?.riskSignals.includes('bundle_opportunity')
  ).length;
  const unmatchedCount = draft.items.filter((item) =>
    item.vendorIntelligence?.riskSignals.includes('no_offer') ||
    item.vendorIntelligence?.riskSignals.includes('unmatched_requirement')
  ).length;

  return {
    selectedOfferCount: vendorItems.length,
    staleCount,
    cheaperAlternativeCount,
    bundleCount,
    unmatchedCount,
  };
};

export const ProcurementWorkspace: React.FC<ProcurementWorkspaceProps> = ({
  focusedUnitId = null,
  initialFocus = 'all',
  focusedRequirementId = null,
  focusedRequirementIds = [],
  originContextLabel = null,
  arrivalContext = null,
  onClearUnitFocus,
  onOpenInspectionScope,
}) => {
  const { org, role, permissions, user } = useAppContext();
  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [drafts, setDrafts] = useState<ProcurementDraft[]>([]);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('inspection');
  const [activeMode, setActiveMode] = useState<ProcurementMode>('selection');
  const [statusFilter, setStatusFilter] = useState<MaterialRequirementStatus | 'all'>('all');
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('all');
  const [draftSort, setDraftSort] = useState<DraftSort>('most_stale');
  const [draftGrouping, setDraftGrouping] = useState<DraftGrouping>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [exportingDraftId, setExportingDraftId] = useState<string | null>(null);
  const [isExportingMaintenanceSnapshot, setIsExportingMaintenanceSnapshot] = useState(false);
  const [refreshingDraftId, setRefreshingDraftId] = useState<string | null>(null);
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [savingAnnotationDraftId, setSavingAnnotationDraftId] = useState<string | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<Record<string, string>>({});
  const [assignmentSelections, setAssignmentSelections] = useState<Record<string, string>>({});
  const [correctionRouteSelections, setCorrectionRouteSelections] = useState<Record<string, MaterialCorrectionRoute>>({});
  const [vendorCompletionEvidence, setVendorCompletionEvidence] = useState<Record<string, { note: string; details: string }>>({});
  const [highlightedRequirementIds, setHighlightedRequirementIds] = useState<string[]>([]);
  const [visibleArrivalContext, setVisibleArrivalContext] = useState(arrivalContext);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshAnalyticsSnapshot, setRefreshAnalyticsSnapshot] = useState<{
    previous?: ProcurementRefreshAnalyticsSnapshot;
    current?: ProcurementRefreshAnalyticsSnapshot;
    ledger?: ProcurementRefreshLedgerEntry[];
  }>({});
  const [matchCandidates, setMatchCandidates] = useState<Record<string, MaterialRequirementMatchCandidate[]>>({});
  const [selectedRequirementForComparison, setSelectedRequirementForComparison] = useState<MaterialRequirement | null>(null);
  const requirementRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const canManageProcurement = AuthPolicyService.canActivateProcurement(role, permissions);
  const canViewProcurement = AuthPolicyService.canAccessView(permissions, 'procurement');
  const isVendorView = role === 'vendor';
  const canManageAssignments = AuthPolicyService.canManageVendorAssignments(role, permissions);
  const canManageVerification = AuthPolicyService.canManageProcurementVerification(role, permissions);
  const canManageCloseoutExceptions = AuthPolicyService.canManageCloseoutExceptions(role, permissions);
  const canPerformVendorActions = AuthPolicyService.canPerformVendorActions(role, permissions);
  const vendorDirectory = useMemo(() => buildVendorDirectory(org?.name), [org?.name]);

  const loadData = async () => {
    if (!org) return;
    setIsLoading(true);
    try {
      const [loadedRequirements, loadedInspections, loadedUnits, loadedDrafts] = await Promise.all([
        MaterialRequirementService.listRequirements(org.id),
        InspectionService.listInspections(org.id),
        UnitService.listUnits(org.id),
        ProcurementDraftService.listDrafts(org.id),
      ]);
      setRequirements(loadedRequirements);
      setInspections(loadedInspections);
      setUnits(loadedUnits.filter((unit) => unit.status !== 'archived'));
      setDrafts(loadedDrafts);
      setAssignmentSelections(
        Object.fromEntries(
          loadedRequirements.map((requirement) => [requirement.id, requirement.assignedVendorUserId || vendorDirectory[0]?.userId || ''])
        )
      );
      setCorrectionRouteSelections(
        Object.fromEntries(
          loadedRequirements.map((requirement) => [
            requirement.id,
            requirement.correctionRoute || MaterialRequirementService.getSuggestedCorrectionRoute(requirement),
          ])
        )
      );
      setVendorCompletionEvidence((current) =>
        Object.fromEntries(
          loadedRequirements.map((requirement) => [
            requirement.id,
            {
              note: requirement.vendorCompletionNote || current[requirement.id]?.note || '',
              details: requirement.vendorCompletionDetails || current[requirement.id]?.details || '',
            },
          ])
        )
      );
      setDraftAnnotations(
        Object.fromEntries(loadedDrafts.map((draft) => [draft.id, draft.manualAnnotation?.note || '']))
      );
      const candidateEntries = await Promise.all(
        loadedRequirements.map(async (requirement) => [
          requirement.id,
          await MaterialMatchingService.getCandidates(org.id, requirement),
        ] as const)
      );
      setMatchCandidates(Object.fromEntries(candidateEntries));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (org) {
      void loadData();
    }
  }, [org?.id, vendorDirectory]);

  useEffect(() => {
    if (isVendorView) return;
    if (initialFocus === 'all') return;
    setGroupBy('status');
  }, [initialFocus, isVendorView]);


  useEffect(() => {
    if (!org || drafts.length === 0) {
      if (drafts.length === 0) {
        setRefreshAnalyticsSnapshot({});
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      const snapshot = await ProcurementRefreshAnalyticsService.captureSnapshot(org.id, drafts);
      if (!cancelled) {
        setRefreshAnalyticsSnapshot(snapshot);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [org?.id, drafts]);

  useEffect(() => {
    if (!org || !isVendorView) return;
    ClientLoggerService.info('Vendor procurement surface loaded.', {
      category: 'procurement',
      eventType: 'procurement_vendor_surface.loaded',
      route: window.location.pathname || '/procurement',
      screen: 'ProcurementWorkspace',
      contextIds: {
        orgId: org.id,
        userId: user?.id,
      },
      metadata: {
        assignedRequirementCount: requirements.filter((requirement) =>
          ['activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '') &&
          requirement.assignedVendorUserId === user?.id
        ).length,
      },
    });
  }, [isVendorView, org, requirements, user?.id]);

  const inspectionLookup = useMemo(
    () => Object.fromEntries(inspections.map((inspection) => [inspection.id, inspection])),
    [inspections]
  );

  const unitLookup = useMemo(
    () => Object.fromEntries(units.map((unit) => [unit.id, unit])),
    [units]
  );

  const contextRequirements = useMemo(
    () =>
      focusedUnitId && !isVendorView
        ? requirements.filter((requirement) => inspectionLookup[requirement.inspectionId]?.unitId === focusedUnitId)
        : requirements,
    [focusedUnitId, inspectionLookup, isVendorView, requirements]
  );

  const filteredRequirements = useMemo(
    () =>
      contextRequirements
        .filter((requirement) => {
          if (isVendorView) {
            return (
              ['activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '') &&
              Boolean(requirement.selectedMatch) &&
              requirement.assignedVendorUserId === user?.id &&
              requirement.verificationStatus !== 'verified'
            );
          }
          return true;
        })
        .filter((requirement) => (statusFilter === 'all' ? true : requirement.status === statusFilter)),
    [contextRequirements, isVendorView, statusFilter, user?.id]
  );

  const matchesMode = (requirement: MaterialRequirement, mode: ProcurementMode): boolean => {
    const procurementState = requirement.procurementState || 'scoped_only';
    const vendorActionState = requirement.vendorActionState || 'unassigned';
    const verificationStatus = requirement.verificationStatus || 'pending';
    const closeoutIssueState = requirement.closeoutIssueState || 'none';
    const isCompleted = procurementState === 'fulfilled' || verificationStatus === 'verified';

    switch (mode) {
      case 'selection':
        return !isCompleted && closeoutIssueState === 'none' && (
          procurementState === 'scoped_only' ||
          procurementState === 'ready_for_procurement' ||
          !requirement.selectedMatch
        );
      case 'assignment':
        return !isCompleted &&
          closeoutIssueState === 'none' &&
          Boolean(requirement.selectedMatch) &&
          ['activated', 'ordered', 'fulfilled'].includes(procurementState) &&
          !requirement.assignedVendorUserId;
      case 'vendor':
        return !isCompleted &&
          closeoutIssueState === 'none' &&
          ['assigned', 'acknowledged', 'in_progress'].includes(vendorActionState);
      case 'receiving':
        return closeoutIssueState === 'none' &&
          vendorActionState === 'completed' &&
          verificationStatus === 'pending';
      case 'verification':
        return closeoutIssueState === 'none' && verificationStatus === 'received';
      case 'exceptions':
        return closeoutIssueState !== 'none';
      case 'completed':
        return isCompleted && closeoutIssueState === 'none';
      default:
        return true;
    }
  };

  const internalModeCounts = useMemo(
    () => ({
      selection: filteredRequirements.filter((requirement) => matchesMode(requirement, 'selection')).length,
      assignment: filteredRequirements.filter((requirement) => matchesMode(requirement, 'assignment')).length,
      vendor: filteredRequirements.filter((requirement) => matchesMode(requirement, 'vendor')).length,
      receiving: filteredRequirements.filter((requirement) => matchesMode(requirement, 'receiving')).length,
      verification: filteredRequirements.filter((requirement) => matchesMode(requirement, 'verification')).length,
      exceptions: filteredRequirements.filter((requirement) => matchesMode(requirement, 'exceptions')).length,
      completed: filteredRequirements.filter((requirement) => matchesMode(requirement, 'completed')).length,
    }),
    [filteredRequirements]
  );

  const suggestedMode = useMemo<ProcurementMode>(() => {
    if (isVendorView) return 'vendor';
    if (initialFocus === 'verification') {
      return internalModeCounts.verification > 0 ? 'verification' : internalModeCounts.exceptions > 0 ? 'exceptions' : 'receiving';
    }
    if (initialFocus === 'receiving') {
      return internalModeCounts.receiving > 0 ? 'receiving' : internalModeCounts.verification > 0 ? 'verification' : 'exceptions';
    }
    if (initialFocus === 'vendor') {
      return 'vendor';
    }
    if (initialFocus === 'procurement') {
      if (internalModeCounts.selection > 0) return 'selection';
      if (internalModeCounts.assignment > 0) return 'assignment';
      if (internalModeCounts.vendor > 0) return 'vendor';
      return 'completed';
    }
    if (internalModeCounts.exceptions > 0) return 'exceptions';
    if (internalModeCounts.receiving > 0) return 'receiving';
    if (internalModeCounts.verification > 0) return 'verification';
    if (internalModeCounts.assignment > 0) return 'assignment';
    if (internalModeCounts.selection > 0) return 'selection';
    if (internalModeCounts.vendor > 0) return 'vendor';
    return 'completed';
  }, [initialFocus, internalModeCounts, isVendorView]);

  useEffect(() => {
    if (isVendorView) return;
    setActiveMode((current) => {
      if (initialFocus !== 'all') return suggestedMode;
      if (internalModeCounts[current] > 0) return current;
      return suggestedMode;
    });
  }, [initialFocus, internalModeCounts, isVendorView, suggestedMode]);

  const prioritizedRequirements = useMemo(() => {
    const modeFilteredRequirements = isVendorView
      ? filteredRequirements
      : filteredRequirements.filter((requirement) => matchesMode(requirement, activeMode));

    if (isVendorView) return modeFilteredRequirements;
    if (initialFocus === 'all') return modeFilteredRequirements;
    const getPriority = (requirement: MaterialRequirement) => {
      if (initialFocus === 'verification') {
        if ((requirement.closeoutIssueState || 'none') === 'verification_failed') return 0;
        if ((requirement.closeoutIssueState || 'none') === 'rework_required') return 1;
        if ((requirement.closeoutIssueState || 'none') === 'partial_receipt') return 2;
        if (requirement.verificationStatus === 'received') return 3;
        if (requirement.vendorActionState === 'completed' && (requirement.verificationStatus || 'pending') === 'pending') return 4;
        return 5;
      }
      if (initialFocus === 'receiving') {
        if (requirement.vendorActionState === 'completed' && (requirement.verificationStatus || 'pending') === 'pending') return 0;
        if (requirement.verificationStatus === 'received') return 1;
        return 2;
      }
      if (initialFocus === 'vendor') {
        if (['assigned', 'acknowledged', 'in_progress'].includes(requirement.vendorActionState || 'unassigned')) return 0;
        return 1;
      }
      if (initialFocus === 'procurement') {
        if (['ready_for_procurement', 'activated', 'ordered'].includes(requirement.procurementState || 'scoped_only')) return 0;
        return 1;
      }
      return 0;
    };

    return [...modeFilteredRequirements].sort((a, b) => {
      const byPriority = getPriority(a) - getPriority(b);
      if (byPriority !== 0) return byPriority;
      return b.updatedAt - a.updatedAt;
    });
  }, [activeMode, filteredRequirements, initialFocus, isVendorView]);

  const groupedRequirements = useMemo(() => {
    const groups = new Map<string, MaterialRequirement[]>();
    for (const requirement of prioritizedRequirements) {
      const key =
        groupBy === 'inspection'
          ? inspectionLookup[requirement.inspectionId]?.title || requirement.inspectionId
          : groupBy === 'category'
            ? titleCase(requirement.category)
            : titleCase(requirement.status);

      const existing = groups.get(key) || [];
      existing.push(requirement);
      groups.set(key, existing);
    }
    return [...groups.entries()];
  }, [groupBy, inspectionLookup, prioritizedRequirements]);

  useEffect(() => {
    const nextHighlightedIds = Array.from(new Set([focusedRequirementId, ...(focusedRequirementIds || [])].filter(Boolean))) as string[];
    if (nextHighlightedIds.length === 0) return;
    setHighlightedRequirementIds(nextHighlightedIds);
    const target = requirementRowRefs.current[nextHighlightedIds[0]];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timeout = window.setTimeout(() => {
      setHighlightedRequirementIds((current) =>
        current.every((id) => nextHighlightedIds.includes(id)) ? [] : current
      );
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [focusedRequirementId, focusedRequirementIds, groupedRequirements]);

  useEffect(() => {
    setVisibleArrivalContext(arrivalContext);
    if (!arrivalContext) return;
    const timeout = window.setTimeout(() => {
      setVisibleArrivalContext((current) => (current === arrivalContext ? null : current));
    }, 9000);
    return () => window.clearTimeout(timeout);
  }, [arrivalContext]);

  const activationSummary = useMemo(
    () => ({
      scopedOnly: contextRequirements.filter((requirement) => (requirement.procurementState || 'scoped_only') === 'scoped_only').length,
      readyForProcurement: contextRequirements.filter((requirement) => requirement.procurementState === 'ready_for_procurement').length,
      activated: contextRequirements.filter((requirement) => requirement.procurementState === 'activated').length,
      ordered: contextRequirements.filter((requirement) => requirement.procurementState === 'ordered').length,
      missingSelection: contextRequirements.filter(
        (requirement) =>
          ['ready_for_procurement', 'activated'].includes(requirement.procurementState || '') && !requirement.selectedMatch
      ).length,
      assigned: contextRequirements.filter((requirement) => requirement.vendorActionState === 'assigned').length,
      acknowledged: contextRequirements.filter((requirement) => requirement.vendorActionState === 'acknowledged').length,
      inProgress: contextRequirements.filter((requirement) => requirement.vendorActionState === 'in_progress').length,
      completed: contextRequirements.filter((requirement) => requirement.vendorActionState === 'completed').length,
      pendingReceiving: contextRequirements.filter(
        (requirement) =>
          requirement.vendorActionState === 'completed' && (requirement.verificationStatus || 'pending') === 'pending'
      ).length,
      pendingVerification: contextRequirements.filter((requirement) => requirement.verificationStatus === 'received').length,
      verified: contextRequirements.filter((requirement) => requirement.verificationStatus === 'verified').length,
      unassignedActivated: contextRequirements.filter(
        (requirement) =>
          ['activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '') && !requirement.assignedVendorUserId
      ).length,
    }),
    [contextRequirements]
  );

  const vendorQueueSummary = useMemo(
    () => ({
      assigned: filteredRequirements.filter((requirement) => requirement.vendorActionState === 'assigned').length,
      acknowledged: filteredRequirements.filter((requirement) => requirement.vendorActionState === 'acknowledged').length,
      inProgress: filteredRequirements.filter((requirement) => requirement.vendorActionState === 'in_progress').length,
      completed: filteredRequirements.filter((requirement) => requirement.vendorActionState === 'completed').length,
    }),
    [filteredRequirements]
  );

  const vendorQueueGroups = useMemo(
    () =>
      ([
        ['assigned', 'Needs Acknowledgement'],
        ['acknowledged', 'Acknowledged'],
        ['in_progress', 'In Progress'],
        ['completed', 'Completed Waiting on Internal Closeout'],
      ] as Array<[MaterialVendorActionState, string]>)
        .map(([state, label]) => ({
          state,
          label,
          requirements: filteredRequirements.filter((requirement) => (requirement.vendorActionState || 'unassigned') === state),
        }))
        .filter((group) => group.requirements.length > 0),
    [filteredRequirements]
  );

  const vendorGuidance = useMemo(() => {
    if (!isVendorView) return null;
    if (vendorQueueSummary.assigned > 0) {
      return {
        title: 'Start with newly assigned work',
        detail: `${vendorQueueSummary.assigned} item${vendorQueueSummary.assigned === 1 ? '' : 's'} still need acknowledgement before execution starts.`,
      };
    }
    if (vendorQueueSummary.acknowledged > 0) {
      return {
        title: 'Move acknowledged work into execution',
        detail: `${vendorQueueSummary.acknowledged} accepted item${vendorQueueSummary.acknowledged === 1 ? '' : 's'} are ready to be marked in progress.`,
      };
    }
    if (vendorQueueSummary.inProgress > 0) {
      return {
        title: 'Finish active vendor work',
        detail: `${vendorQueueSummary.inProgress} item${vendorQueueSummary.inProgress === 1 ? '' : 's'} are currently in progress and should be marked completed when done.`,
      };
    }
    if (vendorQueueSummary.completed > 0) {
      return {
        title: 'Completed work is now waiting on internal closeout',
        detail: `${vendorQueueSummary.completed} item${vendorQueueSummary.completed === 1 ? '' : 's'} are done on the vendor side and now wait for internal receiving or verification.`,
      };
    }
    return {
      title: 'No vendor work is assigned right now',
      detail: 'Internal users still need to assign activated work before anything appears here.',
    };
  }, [isVendorView, vendorQueueSummary]);

  const receivingSummary = useMemo(
    () => ({
      pendingReceiving: contextRequirements.filter(
        (requirement) =>
          requirement.vendorActionState === 'completed' && (requirement.verificationStatus || 'pending') === 'pending'
      ).length,
      pendingVerification: contextRequirements.filter((requirement) => requirement.verificationStatus === 'received').length,
      fulfilled: contextRequirements.filter(
        (requirement) =>
          requirement.procurementState === 'fulfilled' || requirement.verificationStatus === 'verified'
      ).length,
      failedVerification: contextRequirements.filter((requirement) => requirement.closeoutIssueState === 'verification_failed').length,
      reworkRequired: contextRequirements.filter((requirement) => requirement.closeoutIssueState === 'rework_required').length,
    }),
    [contextRequirements]
  );

  const modeCards = useMemo(
    () =>
      ([
        ['selection', 'Needs Selection', internalModeCounts.selection, 'Reviewed and scoped items that still need a selected procurement product or promotion.'],
        ['assignment', 'Needs Assignment', internalModeCounts.assignment, 'Activated items with a selected product that are still waiting on vendor assignment.'],
        ['vendor', 'Vendor In Progress', internalModeCounts.vendor, 'Assigned work that is now in vendor hands and needs execution follow-through.'],
        ['receiving', 'Pending Receiving', internalModeCounts.receiving, 'Vendor-completed work that still needs internal receiving.'],
        ['verification', 'Pending Verification', internalModeCounts.verification, 'Received work waiting on internal verification and closeout.'],
        ['exceptions', 'Exceptions / Rework', internalModeCounts.exceptions, 'Verification failures, partial receipts, and reopened rework paths needing intervention.'],
        ['completed', 'Completed / Fulfilled', internalModeCounts.completed, 'Closed requirements kept available for confirmation and context.'],
      ] as Array<[ProcurementMode, string, number, string]>).map(([mode, label, count, description]) => ({
        mode,
        label,
        count,
        description,
      })),
    [internalModeCounts]
  );

  const activeModeCard = useMemo(
    () => modeCards.find((entry) => entry.mode === activeMode) || modeCards[0],
    [activeMode, modeCards]
  );

  const activeQueueVendorEvidence = useMemo(
    () =>
      contextRequirements.filter(
        (requirement) => Boolean(requirement.vendorCompletionNote || requirement.vendorCompletionDetails)
      ),
    [contextRequirements]
  );

  const portfolioSummary = useMemo<ProcurementPortfolioSummary | undefined>(
    () => ProcurementPortfolioSummaryService.buildFromDrafts(drafts),
    [drafts]
  );

  const refreshHealthSummary = useMemo(
    () => ({
      neverRefreshedCount: drafts.filter((draft) => !draft.intelligenceRefreshedAt).length,
      staleRefreshCount: drafts.filter(isStaleRefresh).length,
      needsReviewCount: drafts.filter((draft) => draft.items.some((item) => (item.reviewGuidance?.length || 0) > 0)).length,
      noOfferCount: drafts.filter(hasNoOffer).length,
      vendorIssuesCount: drafts.filter(hasVendorIssues).length,
      staleAndNeedsReviewCount: drafts.filter(
        (draft) => isStaleRefresh(draft) && draft.items.some((item) => (item.reviewGuidance?.length || 0) > 0)
      ).length,
      manualNoteCount: drafts.filter(hasManualNote).length,
    }),
    [drafts]
  );

  const refreshAgingSummary = useMemo(() => {
    const refreshedDrafts = drafts
      .map((draft) => ({
        draft,
        ageDays: getRefreshAgeDays(draft),
      }))
      .filter((entry): entry is { draft: ProcurementDraft; ageDays: number } => entry.ageDays !== null);

    const zeroToSixCount = refreshedDrafts.filter((entry) => entry.ageDays <= 6).length;
    const sevenToThirteenCount = refreshedDrafts.filter((entry) => entry.ageDays >= 7 && entry.ageDays <= 13).length;
    const fourteenPlusCount = refreshedDrafts.filter((entry) => entry.ageDays >= 14).length;
    const oldestStaleDraft = refreshedDrafts
      .filter((entry) => entry.ageDays >= 7)
      .sort((a, b) => b.ageDays - a.ageDays)[0];
    const stalestDrafts = refreshedDrafts
      .filter((entry) => entry.ageDays >= 14)
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 3)
      .map((entry) => `${entry.draft.name} (${entry.ageDays}d)`);

    return {
      neverRefreshedCount: drafts.filter((draft) => !draft.intelligenceRefreshedAt).length,
      zeroToSixCount,
      sevenToThirteenCount,
      fourteenPlusCount,
      oldestStaleDraftAgeDays: oldestStaleDraft?.ageDays,
      oldestStaleDraftName: oldestStaleDraft?.draft.name,
      stalestDrafts,
    };
  }, [drafts]);

  const refreshTrendSummary = useMemo(() => {
    const previous = refreshAnalyticsSnapshot.previous;
    const current = refreshAnalyticsSnapshot.current;
    if (!previous || !current) {
      return undefined;
    }

    return {
      staleDelta: current.staleRefreshCount - previous.staleRefreshCount,
      neverRefreshedDelta: current.neverRefreshedCount - previous.neverRefreshedCount,
      needsReviewDelta: current.needsReviewCount - previous.needsReviewCount,
    };
  }, [refreshAnalyticsSnapshot]);

  const refreshLedgerSummary = useMemo(() => {
    const ledger = refreshAnalyticsSnapshot.ledger || [];
    if (ledger.length === 0) {
      return undefined;
    }

    const latest = ledger[0];
    const oldest = ledger[ledger.length - 1];

    return {
      entries: ledger.slice(0, 5),
      multiSnapshotDelta: {
        stale: latest.staleRefreshCount - oldest.staleRefreshCount,
        neverRefreshed: latest.neverRefreshedCount - oldest.neverRefreshedCount,
        needsReview: latest.needsReviewCount - oldest.needsReviewCount,
      },
    };
  }, [refreshAnalyticsSnapshot]);

  const maintenanceDigest = useMemo<ProcurementMaintenanceDigest | undefined>(
    () => ProcurementMaintenanceDigestService.buildFromLedger(refreshAnalyticsSnapshot.ledger || []),
    [refreshAnalyticsSnapshot]
  );

  const filteredDrafts = useMemo(() => {
    switch (draftFilter) {
      case 'needs_review':
        return drafts.filter((draft) => draft.items.some((item) => (item.reviewGuidance?.length || 0) > 0));
      case 'never_refreshed':
        return drafts.filter((draft) => !draft.intelligenceRefreshedAt);
      case 'stale_refresh':
        return drafts.filter(isStaleRefresh);
      case 'no_offer':
        return drafts.filter(hasNoOffer);
      case 'vendor_issues':
        return drafts.filter(hasVendorIssues);
      case 'has_manual_note':
        return drafts.filter(hasManualNote);
      case 'no_manual_note':
        return drafts.filter((draft) => !hasManualNote(draft));
      case 'all':
      default:
        return drafts;
    }
  }, [draftFilter, drafts]);

  const sortedDrafts = useMemo(() => {
    const nextDrafts = [...filteredDrafts];

    nextDrafts.sort((left, right) => {
      switch (draftSort) {
        case 'most_review_needed':
          return getReviewNeededCount(right) - getReviewNeededCount(left) || right.updatedAt - left.updatedAt;
        case 'highest_no_offer':
          return getNoOfferCount(right) - getNoOfferCount(left) || right.updatedAt - left.updatedAt;
        case 'highest_optimized_cost':
          return getOptimizationStats(right).estimatedCost - getOptimizationStats(left).estimatedCost || right.updatedAt - left.updatedAt;
        case 'most_recently_refreshed':
          return (right.intelligenceRefreshedAt || 0) - (left.intelligenceRefreshedAt || 0) || right.updatedAt - left.updatedAt;
        case 'least_recently_refreshed':
          return getRefreshAgeSortValue(right) - getRefreshAgeSortValue(left) || right.updatedAt - left.updatedAt;
        case 'most_stale':
        default:
          return getRefreshAgeSortValue(right) - getRefreshAgeSortValue(left) || right.updatedAt - left.updatedAt;
      }
    });

    return nextDrafts;
  }, [draftFilter, draftSort, filteredDrafts]);

  const groupedDrafts = useMemo(() => {
    if (draftGrouping === 'none') {
      return [{ label: 'All Drafts', drafts: sortedDrafts }];
    }

    const groups = new Map<string, ProcurementDraft[]>();
    for (const draft of sortedDrafts) {
      const label = getDraftGroupLabel(draft);
      groups.set(label, [...(groups.get(label) || []), draft]);
    }

    const order = ['Needs Review', 'Stale Refresh', 'Has Manual Note', 'No Offer / Vendor Issues', 'Other Drafts'];
    return order
      .map((label) => ({ label, drafts: groups.get(label) || [] }))
      .filter((group) => group.drafts.length > 0);
  }, [draftGrouping, sortedDrafts]);

  const handleToggleRequirement = (requirementId: string) => {
    setSelectedRequirementIds((current) =>
      current.includes(requirementId)
        ? current.filter((id) => id !== requirementId)
        : [...current, requirementId]
    );
  };

  const handleToggleGroup = (groupRequirements: MaterialRequirement[]) => {
    const allSelected = groupRequirements.every((requirement) => selectedRequirementIds.includes(requirement.id));
    if (allSelected) {
      setSelectedRequirementIds((current) =>
        current.filter((id) => !groupRequirements.some((requirement) => requirement.id === id))
      );
      return;
    }

    setSelectedRequirementIds((current) => [
      ...new Set([...current, ...groupRequirements.map((requirement) => requirement.id)]),
    ]);
  };

  const handleCreateDraft = async () => {
    if (!org || !canManageProcurement) return;
    const selectedRequirements = requirements.filter((requirement) => selectedRequirementIds.includes(requirement.id));
    if (selectedRequirements.length === 0) {
      setMessage('Select at least one material requirement first.');
      return;
    }
    if (selectedRequirements.some((requirement) => requirement.procurementState !== 'activated')) {
      setMessage('Activate selected material requirements before creating a procurement draft.');
      return;
    }

    setIsCreatingDraft(true);
    setMessage(null);
    try {
      const draft = await ProcurementDraftService.createFromRequirements({
        orgId: org.id,
        name: `Requirement Basket ${new Date().toLocaleDateString()}`,
        requirements: selectedRequirements,
      });

      await Promise.all(
        selectedRequirements.map((requirement) =>
          MaterialRequirementService.updateRequirement(
            org.id,
            {
              ...requirement,
              status: 'planned',
              procurementState: 'activated',
              procurementActivatedAt: requirement.procurementActivatedAt || Date.now(),
              procurementActivatedByUserId: requirement.procurementActivatedByUserId || user?.id,
            },
            user?.id || 'system'
          )
        )
      );

      setMessage(`Created procurement draft "${draft.name}" from ${selectedRequirements.length} requirements.`);
      setSelectedRequirementIds([]);
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to create procurement draft.');
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleRequirementStatusChange = async (requirement: MaterialRequirement, status: MaterialRequirementStatus) => {
    if (!org || !canManageProcurement) return;
    try {
      const procurementState =
        status === 'fulfilled'
          ? 'fulfilled'
          : status === 'ordered'
            ? 'ordered'
            : requirement.procurementState;
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          status,
          procurementState,
        },
        user?.id || 'system'
      );
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to update requirement status.');
    }
  };

  const handleSelectMatch = async (
    requirement: MaterialRequirement,
    candidate: MaterialRequirementMatchCandidate
  ) => {
    if (!org || !canManageProcurement) return;
    try {
      const selection: SelectedProcurementOption = {
        catalogItemId: candidate.catalogItemId,
        catalogItemName: candidate.catalogItemName,
        optionId: candidate.optionId,
        optionName: candidate.optionName,
        category: candidate.category,
        unit: candidate.unit,
        vendor: candidate.vendor,
        sku: candidate.sku,
        modelNumber: candidate.modelNumber,
        price: candidate.price,
        confidenceScore: candidate.confidenceScore,
        confidenceBand: candidate.confidenceBand,
        rationale: candidate.rationale,
        selectedAt: Date.now(),
      };

      const validated = await MaterialMatchingService.validateSelectedCandidate(org.id, selection);
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          selectedMatch: validated,
          status: requirement.status === 'draft' ? 'reviewed' : requirement.status,
        },
        user?.id || 'system'
      );
      await MaterialMatchingService.rememberSelection(org.id, requirement, validated);
      setMessage(`Selected "${validated.optionName}" for ${requirement.itemDescription}.`);
      ClientLoggerService.info('Procurement product selected for material requirement.', {
        category: 'procurement',
        eventType: 'procurement_activation.product_selected',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          unitId: undefined,
        },
        metadata: {
          materialRequirementId: requirement.id,
          catalogItemId: validated.catalogItemId,
          optionId: validated.optionId,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to select match.');
    }
  };

  const handleClearMatch = async (requirement: MaterialRequirement) => {
    if (!org || !canManageProcurement) return;
    try {
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          selectedMatch: undefined,
          procurementState:
            requirement.procurementState === 'activated' || requirement.procurementState === 'ordered'
              ? 'ready_for_procurement'
              : requirement.procurementState,
        },
        user?.id || 'system'
      );
      setMessage(`Cleared selected match for ${requirement.itemDescription}.`);
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to clear match.');
    }
  };

  const handleMarkReadyForProcurement = async (requirement: MaterialRequirement) => {
    if (!org || !canManageProcurement) return;
    try {
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          status: requirement.status === 'draft' ? 'reviewed' : requirement.status,
          procurementState: 'ready_for_procurement',
          procurementReadyAt: requirement.procurementReadyAt || Date.now(),
        },
        user?.id || 'system'
      );
      setMessage(`Marked ${requirement.itemDescription} ready for procurement.`);
      ClientLoggerService.info('Material requirement marked ready for procurement.', {
        category: 'procurement',
        eventType: 'procurement_activation.ready',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
        },
        metadata: {
          materialRequirementId: requirement.id,
          hasSelectedMatch: Boolean(requirement.selectedMatch),
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to mark requirement ready for procurement.');
    }
  };

  const handleActivateRequirement = async (requirement: MaterialRequirement) => {
    if (!org || !canManageProcurement) return;
    if (!requirement.selectedMatch) {
      setMessage('Select a procurement product before activating this requirement.');
      return;
    }

    try {
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          status: ['draft', 'reviewed'].includes(requirement.status) ? 'planned' : requirement.status,
          procurementState: 'activated',
          procurementReadyAt: requirement.procurementReadyAt || Date.now(),
          procurementActivatedAt: Date.now(),
          procurementActivatedByUserId: user?.id,
        },
        user?.id || 'system'
      );
      setMessage(`Activated ${requirement.itemDescription} for procurement.`);
      ClientLoggerService.info('Material requirement activated for procurement.', {
        category: 'procurement',
        eventType: 'procurement_activation.activated',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
        },
        metadata: {
          materialRequirementId: requirement.id,
          catalogItemId: requirement.selectedMatch.catalogItemId,
          optionId: requirement.selectedMatch.optionId,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to activate procurement requirement.');
    }
  };

  const handleAssignmentSelectionChange = (requirementId: string, vendorUserId: string) => {
    setAssignmentSelections((current) => ({
      ...current,
      [requirementId]: vendorUserId,
    }));
  };

  const handleCorrectionRouteSelectionChange = (
    requirementId: string,
    correctionRoute: MaterialCorrectionRoute
  ) => {
    setCorrectionRouteSelections((current) => ({
      ...current,
      [requirementId]: correctionRoute,
    }));
  };

  const handleVendorCompletionEvidenceChange = (
    requirementId: string,
    field: 'note' | 'details',
    value: string
  ) => {
    setVendorCompletionEvidence((current) => ({
      ...current,
      [requirementId]: {
        note: current[requirementId]?.note || '',
        details: current[requirementId]?.details || '',
        [field]: value,
      },
    }));
  };

  const handleAssignVendor = async (requirement: MaterialRequirement) => {
    if (!org || !canManageAssignments) return;
    const selectedVendorUserId = assignmentSelections[requirement.id];
    const vendor = vendorDirectory.find((entry) => entry.userId === selectedVendorUserId);

    if (!vendor) {
      setMessage('Choose a vendor before assigning this procurement item.');
      return;
    }

    try {
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          assignedVendorUserId: vendor.userId,
          assignedVendorDisplayName: vendor.displayName,
          procurementAssignedAt: Date.now(),
          procurementAssignedByUserId: user?.id,
          vendorActionState: 'assigned',
        },
        user?.id || 'system'
      );
      setMessage(`Assigned ${requirement.itemDescription} to ${vendor.displayName}.`);
      ClientLoggerService.info('Procurement item assigned to vendor.', {
        category: 'procurement',
        eventType: 'procurement_assignment.assigned',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          userId: user?.id,
        },
        metadata: {
          materialRequirementId: requirement.id,
          assignedVendorUserId: vendor.userId,
          assignedVendorDisplayName: vendor.displayName,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to assign vendor.');
    }
  };

  const handleUnassignVendor = async (requirement: MaterialRequirement) => {
    if (!org || !canManageAssignments) return;
    try {
      await MaterialRequirementService.updateRequirement(
        org.id,
        {
          ...requirement,
          assignedVendorUserId: undefined,
          assignedVendorDisplayName: undefined,
          procurementAssignedAt: undefined,
          procurementAssignedByUserId: undefined,
          vendorActionState: 'unassigned',
        },
        user?.id || 'system'
      );
      setMessage(`Unassigned vendor from ${requirement.itemDescription}.`);
      ClientLoggerService.info('Procurement item unassigned from vendor.', {
        category: 'procurement',
        eventType: 'procurement_assignment.unassigned',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          userId: user?.id,
        },
        metadata: {
          materialRequirementId: requirement.id,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to unassign vendor.');
    }
  };

  const handleVendorActionStateChange = async (
    requirement: MaterialRequirement,
    nextVendorActionState: MaterialVendorActionState
  ) => {
    if (!org) return;

    const isInternalAssignmentAction = canManageAssignments;
    const isAssignedVendor = canPerformVendorActions && requirement.assignedVendorUserId === user?.id;
    if (!isInternalAssignmentAction && !isAssignedVendor) {
      setMessage('You do not have permission to update vendor action state for this item.');
      return;
    }

    try {
      const vendorEvidence = vendorCompletionEvidence[requirement.id];
      if (nextVendorActionState === 'completed') {
        await MaterialRequirementService.markVendorCompleted(org.id, requirement, user?.id || 'system', {
          note: vendorEvidence?.note,
          details: vendorEvidence?.details,
        });
      } else {
        await MaterialRequirementService.updateVendorActionState(org.id, requirement, nextVendorActionState, user?.id || 'system');
      }
      setMessage(
        nextVendorActionState === 'completed'
          ? `${requirement.itemDescription} marked completed${vendorEvidence?.note?.trim() || vendorEvidence?.details?.trim() ? ' with vendor completion details captured' : ''}. It now waits on internal receiving or verification.`
          : nextVendorActionState === 'in_progress'
            ? `${requirement.itemDescription} marked in progress. Continue execution until the assigned work is done.`
            : nextVendorActionState === 'acknowledged'
              ? `${requirement.itemDescription} acknowledged. Mark it in progress when you begin work.`
              : `${vendorActionStateLabel(nextVendorActionState)} set for ${requirement.itemDescription}.`
      );
      ClientLoggerService.info('Vendor action state updated.', {
        category: 'procurement',
        eventType: 'procurement_assignment.vendor_action_updated',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          userId: user?.id,
        },
        metadata: {
          materialRequirementId: requirement.id,
          assignedVendorUserId: requirement.assignedVendorUserId,
          nextVendorActionState,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to update vendor action state.');
    }
  };

  const handleMarkReceived = async (requirement: MaterialRequirement) => {
    if (!org || !canManageVerification) return;
    try {
      await MaterialRequirementService.markReceived(org.id, requirement, user?.id || 'system');
      setMessage(`${requirement.itemDescription} received into internal closeout. Review the vendor completion context and verify it when ready.`);
      ClientLoggerService.info('Procurement item marked received.', {
        category: 'procurement',
        eventType: 'procurement_receiving.received',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          userId: user?.id,
        },
        metadata: {
          materialRequirementId: requirement.id,
          vendorActionState: requirement.vendorActionState,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to mark requirement received.');
    }
  };

  const handleMarkVerified = async (requirement: MaterialRequirement) => {
    if (!org || !canManageVerification) return;
    try {
      await MaterialRequirementService.markVerified(org.id, requirement, user?.id || 'system');
      setMessage(`${requirement.itemDescription} verified and moved into fulfilled closeout. This item now supports confident unit completion.`);
      ClientLoggerService.info('Procurement item verified and fulfilled.', {
        category: 'procurement',
        eventType: 'procurement_receiving.verified',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          userId: user?.id,
        },
        metadata: {
          materialRequirementId: requirement.id,
          procurementState: requirement.procurementState,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to verify received requirement.');
    }
  };

  const handleMarkVerificationFailed = async (
    requirement: MaterialRequirement,
    correctionRoute: MaterialCorrectionRoute
  ) => {
    if (!org || !canManageCloseoutExceptions) return;
    try {
      await MaterialRequirementService.markVerificationFailed(
        org.id,
        requirement,
        user?.id || 'system',
        `Verification failed during internal closeout review. Route correction through ${titleCase(correctionRoute)}.`,
        correctionRoute
      );
      setMessage(`Verification failed for ${requirement.itemDescription}. It now routes back through ${correctionRouteLabel(correctionRoute)} for corrective action.`);
      ClientLoggerService.info('Procurement verification failure recorded.', {
        category: 'procurement',
        eventType: 'procurement_receiving.verification_failed',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          userId: user?.id,
        },
        metadata: {
          materialRequirementId: requirement.id,
          verificationStatus: requirement.verificationStatus,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to record verification failure.');
    }
  };

  const handleReopenForRework = async (
    requirement: MaterialRequirement,
    correctionRoute: MaterialCorrectionRoute
  ) => {
    if (!org || !canManageCloseoutExceptions) return;
    try {
      await MaterialRequirementService.reopenForRework(
        org.id,
        requirement,
        user?.id || 'system',
        `Requirement reopened for rework after closeout issue review. Route correction through ${titleCase(correctionRoute)}.`,
        correctionRoute
      );
      setMessage(`Reopened ${requirement.itemDescription} for rework. It now returns through ${correctionRouteLabel(correctionRoute)} instead of staying in closeout.`);
      ClientLoggerService.info('Procurement requirement reopened for rework.', {
        category: 'procurement',
        eventType: 'procurement_receiving.reopened_for_rework',
        route: window.location.pathname || '/procurement',
        screen: 'ProcurementWorkspace',
        contextIds: {
          orgId: org.id,
          inspectionId: requirement.inspectionId,
          userId: user?.id,
        },
        metadata: {
          materialRequirementId: requirement.id,
          closeoutIssueState: requirement.closeoutIssueState,
        },
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to reopen requirement for rework.');
    }
  };

  const handleExportDraft = (draft: ProcurementDraft) => {
    try {
      setExportingDraftId(draft.id);
      ProcurementExportService.downloadDraftCsv(draft);
      setMessage(`Exported "${draft.name}" to CSV.`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to export procurement draft.');
    } finally {
      setExportingDraftId(null);
    }
  };

  const handleRefreshDraft = async (draft: ProcurementDraft) => {
    if (!org) return;
    setRefreshingDraftId(draft.id);
    setMessage(null);
    try {
      const refreshed = await ProcurementDraftService.refreshIntelligence(org.id, draft.id);
      setMessage(
        `Refreshed intelligence for "${refreshed.name}" using the current optimization, vendor, and review rules.`
      );
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to refresh procurement intelligence.');
    } finally {
      setRefreshingDraftId(null);
    }
  };

  const handleBulkRefresh = async () => {
    if (!org) return;
    if (filteredDrafts.length === 0) {
      setMessage('No procurement drafts match the current draft filter.');
      return;
    }

    setIsBulkRefreshing(true);
    setMessage(null);
    try {
      const refreshed = await ProcurementDraftService.refreshMany(
        org.id,
        filteredDrafts.map((draft) => draft.id)
      );
      setMessage(
        `Refreshed ${refreshed.length} draft${refreshed.length === 1 ? '' : 's'} for the current "${titleCase(draftFilter)}" filter.`
      );
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to bulk refresh procurement drafts.');
    } finally {
      setIsBulkRefreshing(false);
    }
  };

  const handleExportMaintenanceSnapshot = () => {
    setIsExportingMaintenanceSnapshot(true);
    try {
      ProcurementMaintenanceSnapshotExportService.downloadSnapshot({
        exportedAt: Date.now(),
        drafts,
        portfolioSummary,
        refreshHealthSummary,
        maintenanceDigest,
        recentLedgerEntries: (refreshAnalyticsSnapshot.ledger || []).slice(0, 5),
      });
      setMessage('Exported procurement maintenance snapshot.');
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to export maintenance snapshot.');
    } finally {
      setIsExportingMaintenanceSnapshot(false);
    }
  };

  const handleAnnotationChange = (draftId: string, value: string) => {
    setDraftAnnotations((current) => ({
      ...current,
      [draftId]: value,
    }));
  };

  const handleSaveAnnotation = async (draft: ProcurementDraft, nextNote?: string) => {
    if (!org) return;
    setSavingAnnotationDraftId(draft.id);
    setMessage(null);
    try {
      const updated = await ProcurementDraftService.updateManualAnnotation(
        org.id,
        draft.id,
        nextNote ?? draftAnnotations[draft.id] ?? ''
      );
      setDraftAnnotations((current) => ({
        ...current,
        [draft.id]: updated.manualAnnotation?.note || '',
      }));
      setMessage(
        updated.manualAnnotation
          ? `Saved manual maintenance note for "${updated.name}".`
          : `Cleared manual maintenance note for "${updated.name}".`
      );
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to save manual maintenance note.');
    } finally {
      setSavingAnnotationDraftId(null);
    }
  };

  const renderBadge = (label: string, tone: string) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${tone}`}>
      <AlertTriangle size={12} />
      {label}
    </span>
  );

  if (!canViewProcurement) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Procurement access is unavailable for the current local session.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Procurement Workspace</h1>
          <p className="text-slate-500">
            {isVendorView
              ? 'Review activated procurement items only. Internal scope and portfolio surfaces remain restricted.'
              : 'Promote reviewed material requirements into procurement without duplicating scope state.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as MaterialRequirementStatus | 'all')}
            className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm"
          >
            <option value="all">All statuses</option>
            {MATERIAL_REQUIREMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
          {!isVendorView ? (
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm"
            >
              <option value="inspection">Group by inspection</option>
              <option value="category">Group by category</option>
              <option value="status">Group by status</option>
            </select>
          ) : null}
          {canManageProcurement ? (
            <button
              onClick={() => void handleCreateDraft()}
              disabled={isCreatingDraft}
              className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isCreatingDraft ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
              Create Procurement Draft
            </button>
          ) : null}
        </div>
      </div>

      {focusedUnitId && !isVendorView ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <div>
            Unit context is active. Procurement is focused on one unit and opens directly into the {activeModeCard.label.toLowerCase()} queue first.
          </div>
          {onClearUnitFocus ? (
            <button
              type="button"
              onClick={onClearUnitFocus}
              className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-800 transition hover:border-blue-300"
            >
              Show all units
            </button>
          ) : null}
        </div>
      ) : null}

      {originContextLabel && !isVendorView ? (
        <div
          data-testid="procurement-origin-context"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <div className="font-semibold">Why you landed here</div>
          <div className="mt-1">{originContextLabel}</div>
        </div>
      ) : null}

      {visibleArrivalContext && !isVendorView ? (
        <div
          data-testid="procurement-focused-arrival"
          className={`rounded-2xl border px-4 py-3 text-sm ${
            visibleArrivalContext.outcome === 'queued'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-blue-200 bg-blue-50 text-blue-900'
          }`}
        >
          <div className="font-semibold">
            {visibleArrivalContext.outcome === 'queued'
              ? 'Focused submission queued locally'
              : 'Focused submission arrived in Procurement'}
          </div>
          <div className="mt-1">
            {visibleArrivalContext.unitName} • {visibleArrivalContext.itemCount} item
            {visibleArrivalContext.itemCount === 1 ? '' : 's'} • ${visibleArrivalContext.estimatedTotal.toFixed(2)}
          </div>
          <div className="mt-1">
            {visibleArrivalContext.outcome === 'queued'
              ? 'The work is already available locally in this queue and will sync when the device reconnects.'
              : 'These materials are now in the procurement flow and ready for review.'}
          </div>
          <div className="mt-1 font-medium">{visibleArrivalContext.nextStep}</div>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>
      ) : null}

      {!isVendorView ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Execution Modes</div>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">Open one operational queue at a time.</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Selection, assignment, vendor follow-through, receiving, verification, and exceptions stay on the same material records.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{activeModeCard.label}</div>
                <div className="mt-1">{activeModeCard.count} item{activeModeCard.count === 1 ? '' : 's'} are currently in this queue.</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-7">
              {modeCards.map((card) => (
                <button
                  key={card.mode}
                  type="button"
                  data-testid={`procurement-mode-${card.mode}`}
                  onClick={() => setActiveMode(card.mode)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    activeMode === card.mode
                      ? `${modeTone[card.mode]} ring-2 ring-lowes-blue`
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide opacity-80">{card.label}</div>
                  <div className="mt-2 text-2xl font-semibold">{card.count}</div>
                  <div className="mt-1 text-xs leading-5 opacity-80">{card.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${modeTone[activeMode]}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide opacity-80">Current Queue</div>
                <div className="mt-1 text-lg font-semibold">{activeModeCard.label}</div>
                <div className="mt-1 text-sm opacity-90">{activeModeCard.description}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-white/70 px-3 py-2">
                  <div className="uppercase tracking-wide text-slate-500">Needs selection</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{internalModeCounts.selection}</div>
                </div>
                <div className="rounded-xl bg-white/70 px-3 py-2">
                  <div className="uppercase tracking-wide text-slate-500">Needs assignment</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{internalModeCounts.assignment}</div>
                </div>
                <div className="rounded-xl bg-white/70 px-3 py-2">
                  <div className="uppercase tracking-wide text-slate-500">Pending receiving</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{internalModeCounts.receiving}</div>
                </div>
                <div className="rounded-xl bg-white/70 px-3 py-2">
                  <div className="uppercase tracking-wide text-slate-500">Exceptions</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{internalModeCounts.exceptions}</div>
                </div>
              </div>
            </div>
          </div>

          {activeQueueVendorEvidence.length > 0 ? (
            <div
              data-testid="procurement-vendor-evidence-banner"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            >
              <div className="font-semibold">
                {activeQueueVendorEvidence.length} vendor-completed item{activeQueueVendorEvidence.length === 1 ? '' : 's'} in the current procurement context include completion evidence.
              </div>
              <div className="mt-1">
                {activeQueueVendorEvidence[0].vendorCompletionNote
                  ? `Latest note: ${activeQueueVendorEvidence[0].vendorCompletionNote}`
                  : 'Completion details are available for internal receiving or verification review.'}
              </div>
              {activeQueueVendorEvidence[0].vendorCompletionDetails ? (
                <div className="mt-1 text-emerald-800">
                  Details: {activeQueueVendorEvidence[0].vendorCompletionDetails}
                </div>
              ) : null}
            </div>
          ) : null}

          {['receiving', 'verification', 'exceptions'].includes(activeMode) ? (
            <div
              data-testid="procurement-closeout-guidance"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
            >
              <div className="font-semibold text-slate-900">
                {activeMode === 'receiving'
                  ? 'Receive vendor-completed work after a quick evidence review.'
                  : activeMode === 'verification'
                    ? 'Verify received work only after the vendor completion context and condition check hold up.'
                    : 'Use fail or reroute actions when normal closeout no longer matches the real condition of the work.'}
              </div>
              <div className="mt-1">
                {activeMode === 'receiving'
                  ? 'Receiving confirms the vendor handoff and keeps the item inside internal closeout until verification is done.'
                  : activeMode === 'verification'
                    ? 'Verification closes the loop. If the work does not hold up, fail or reroute it instead of forcing closeout.'
                    : 'Exceptions move the item back through vendor, procurement, or scope based on the correction route.'}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Ready for Procurement</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activationSummary.readyForProcurement}</div>
              <div className="mt-1 text-xs text-slate-500">Reviewed requirements waiting on product selection.</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Unassigned Activated</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{activationSummary.unassignedActivated}</div>
              <div className="mt-1 text-xs text-slate-500">Selected and activated work still waiting on vendor assignment.</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Pending Verification</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{receivingSummary.pendingVerification}</div>
              <div className="mt-1 text-xs text-slate-500">Received work that still needs closeout confirmation.</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Verified / Fulfilled</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{receivingSummary.fulfilled}</div>
              <div className="mt-1 text-xs text-slate-500">Closed work kept visible for reassurance, not as the primary queue.</div>
            </div>
          </div>
        </>
      ) : null}

      {isVendorView ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Vendor Action Queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Only assigned vendor work appears here. Internal procurement, receiving, verification, and correction controls remain hidden.
            </p>
          </div>
          {vendorGuidance ? (
            <div
              data-testid="vendor-queue-guidance"
              className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
            >
              <div className="font-semibold">{vendorGuidance.title}</div>
              <div className="mt-1">{vendorGuidance.detail}</div>
            </div>
          ) : null}
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">Assigned</div>
              <div className="mt-2 text-xl font-semibold text-amber-900">{vendorQueueSummary.assigned}</div>
              <div className="mt-1 text-xs text-amber-800">Ready for acknowledgement.</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs uppercase tracking-wide text-blue-700">Acknowledged</div>
              <div className="mt-2 text-xl font-semibold text-blue-900">{vendorQueueSummary.acknowledged}</div>
              <div className="mt-1 text-xs text-blue-800">Accepted and waiting to start.</div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <div className="text-xs uppercase tracking-wide text-violet-700">In Progress</div>
              <div className="mt-2 text-xl font-semibold text-violet-900">{vendorQueueSummary.inProgress}</div>
              <div className="mt-1 text-xs text-violet-800">Active vendor execution work.</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Completed</div>
              <div className="mt-2 text-xl font-semibold text-emerald-900">{vendorQueueSummary.completed}</div>
              <div className="mt-1 text-xs text-emerald-800">Waiting on internal receiving or verification.</div>
            </div>
          </div>
          {filteredRequirements.length === 0 ? (
            <div
              data-testid="vendor-queue-empty-state"
              className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500"
            >
              {vendorQueueSummary.completed > 0
                ? 'Your visible vendor work is already completed and is now waiting on internal receiving or verification.'
                : 'No assigned procurement items are available yet. Internal users still need to assign vendor-ready work before anything appears here.'}
            </div>
          ) : (
            <div className="space-y-4">
              {vendorQueueGroups.map((group) => (
                <div key={group.state} className="space-y-3">
                  <div className="rounded-xl bg-slate-100 px-3 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {group.label} ({group.requirements.length})
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {vendorGroupGuide[group.state].description}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {group.requirements.map((requirement) => (
                      <div
                        key={requirement.id}
                        data-testid={`vendor-queue-item-${requirement.id}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="font-semibold text-slate-900">{requirement.itemDescription}</div>
                            <div className="mt-1 text-sm font-medium text-slate-700">
                              {unitLookup[inspectionLookup[requirement.inspectionId]?.unitId || '']?.name || 'Unknown unit'}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              {requirement.quantity} {requirement.unit} • {titleCase(requirement.category)} •{' '}
                              {inspectionLookup[requirement.inspectionId]?.title || requirement.inspectionId}
                            </div>
                            <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                              <div className="font-semibold text-slate-800">{vendorStateGuide[requirement.vendorActionState || 'unassigned'].label}</div>
                              <div className="mt-1">{vendorStateGuide[requirement.vendorActionState || 'unassigned'].summary}</div>
                              <div className="mt-1 text-slate-500">
                                Next: {vendorStateGuide[requirement.vendorActionState || 'unassigned'].nextAction}
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className={`rounded-full px-2 py-1 font-medium ${procurementStateTone[requirement.procurementState || 'scoped_only']}`}>
                                {procurementStateLabel(requirement.procurementState)}
                              </span>
                              <span className={`rounded-full px-2 py-1 font-medium ${vendorActionStateTone[requirement.vendorActionState || 'unassigned']}`}>
                                {vendorActionStateLabel(requirement.vendorActionState)}
                              </span>
                              <span className={`rounded-full px-2 py-1 font-medium ${verificationStatusTone[requirement.verificationStatus || 'pending']}`}>
                                {verificationStatusLabel(requirement.verificationStatus)}
                              </span>
                              {requirement.selectedMatch ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                                  Selected: {requirement.selectedMatch.optionName}
                                </span>
                              ) : null}
                              {requirement.assignedVendorDisplayName ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                                  Assigned to {requirement.assignedVendorDisplayName}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {requirement.roomLabel ? `${requirement.roomLabel} • ` : ''}
                              Task {requirement.repairTaskId}
                              {requirement.sourceFindingId ? ` • Finding ${requirement.sourceFindingId}` : ''}
                            </div>
                            {(requirement.vendorCompletionNote || requirement.vendorCompletionDetails) ? (
                              <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                                <div className="font-semibold text-slate-800">Submitted completion details</div>
                                {requirement.vendorCompletionNote ? (
                                  <div className="mt-1">Note: {requirement.vendorCompletionNote}</div>
                                ) : null}
                                {requirement.vendorCompletionDetails ? (
                                  <div className="mt-1">Details: {requirement.vendorCompletionDetails}</div>
                                ) : null}
                              </div>
                            ) : null}
                            {(requirement.vendorActionState || 'unassigned') === 'completed' ? (
                              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                Vendor work is complete. Internal users now handle receiving and verification before final closeout.
                              </div>
                            ) : null}
                          </div>
                          <div className="text-sm text-slate-600">
                            {requirement.selectedMatch ? (
                              <div>
                                <div className="font-medium text-slate-800">{requirement.selectedMatch.catalogItemName}</div>
                                <div className="text-xs text-slate-500">
                                  {requirement.selectedMatch.vendor || 'No vendor'} • {requirement.selectedMatch.optionName}
                                  {typeof requirement.selectedMatch.price === 'number'
                                    ? ` • $${requirement.selectedMatch.price.toFixed(2)}`
                                    : ''}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Selected procurement product for this assigned work.
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500">No procurement product selected.</div>
                            )}
                            {(requirement.vendorActionState || 'unassigned') !== 'completed' ? (
                              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completion note (optional)</div>
                                <input
                                  type="text"
                                  value={vendorCompletionEvidence[requirement.id]?.note || ''}
                                  onChange={(event) => handleVendorCompletionEvidenceChange(requirement.id, 'note', event.target.value)}
                                  placeholder="Replaced fixture and confirmed operation"
                                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                />
                                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Completion details (optional)</div>
                                <textarea
                                  value={vendorCompletionEvidence[requirement.id]?.details || ''}
                                  onChange={(event) => handleVendorCompletionEvidenceChange(requirement.id, 'details', event.target.value)}
                                  placeholder="Brief closeout details for the internal receiving and verification review."
                                  rows={2}
                                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                />
                                <div className="mt-2 text-xs text-slate-500">
                                  These details are captured when you mark the item completed and then shown to internal users during receiving and verification.
                                </div>
                              </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void handleVendorActionStateChange(requirement, 'acknowledged')}
                                aria-label={`Acknowledge ${requirement.itemDescription}`}
                                disabled={!canPerformVendorActions || requirement.vendorActionState === 'acknowledged' || requirement.vendorActionState === 'in_progress' || requirement.vendorActionState === 'completed'}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                              >
                                Acknowledge
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleVendorActionStateChange(requirement, 'in_progress')}
                                aria-label={`Mark ${requirement.itemDescription} in progress`}
                                disabled={!canPerformVendorActions || requirement.vendorActionState === 'in_progress' || requirement.vendorActionState === 'completed'}
                                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                              >
                                Mark In Progress
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleVendorActionStateChange(requirement, 'completed')}
                                aria-label={`Mark ${requirement.itemDescription} completed`}
                                disabled={!canPerformVendorActions || requirement.vendorActionState === 'completed'}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                Mark Completed
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!isVendorView ? (
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Primary Queue</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{activeModeCard.label}</div>
                <div className="mt-1 text-sm text-slate-500">{activeModeCard.description}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{prioritizedRequirements.length} matching requirement{prioritizedRequirements.length === 1 ? '' : 's'}</span>
                <span>•</span>
                <span>{focusedUnitId ? 'Unit-focused context active' : 'Portfolio-wide queue'}</span>
              </div>
            </div>
          </div>
          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 flex items-center justify-center">
              <Loader2 className="animate-spin text-lowes-blue" size={28} />
            </div>
          ) : groupedRequirements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              No material requirements match the current queue.
            </div>
          ) : (
            groupedRequirements.map(([groupName, groupRequirements]) => (
              <div key={groupName} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="font-semibold text-slate-800">{groupName}</div>
                    <div className="text-xs text-slate-500">{groupRequirements.length} requirements</div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={groupRequirements.every((requirement) => selectedRequirementIds.includes(requirement.id))}
                      onChange={() => handleToggleGroup(groupRequirements)}
                    />
                    Select group
                  </label>
                </div>
                <div className="divide-y divide-slate-100">
                  {groupRequirements.map((requirement) => (
                    <div
                      key={requirement.id}
                      data-testid={`procurement-requirement-${requirement.id}`}
                      ref={(node) => {
                        requirementRowRefs.current[requirement.id] = node;
                      }}
                      className={`p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between ${
                        highlightedRequirementIds.includes(requirement.id) ? 'bg-blue-50 ring-2 ring-inset ring-blue-200' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {canManageProcurement ? (
                          <input
                            type="checkbox"
                            checked={selectedRequirementIds.includes(requirement.id)}
                            onChange={() => handleToggleRequirement(requirement.id)}
                            className="mt-1"
                          />
                        ) : null}
                        <div>
                          <div className="font-medium text-slate-800">{requirement.itemDescription}</div>
                          <div className="text-sm text-slate-500 mt-1">
                            {requirement.quantity} {requirement.unit} • {titleCase(requirement.category)} •{' '}
                            {inspectionLookup[requirement.inspectionId]?.title || requirement.inspectionId}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {requirement.roomLabel ? `${requirement.roomLabel} • ` : ''}
                            Task {requirement.repairTaskId}
                            {requirement.sourceFindingId ? ` • Finding ${requirement.sourceFindingId}` : ''}
                          </div>
                          {requirement.notes ? <div className="text-xs text-slate-500 mt-2">{requirement.notes}</div> : null}
                          {(requirement.vendorCompletionNote || requirement.vendorCompletionDetails) ? (
                            <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                              <div className="font-semibold">Vendor completion evidence</div>
                              {requirement.vendorCompletionNote ? (
                                <div className="mt-1">Note: {requirement.vendorCompletionNote}</div>
                              ) : null}
                              {requirement.vendorCompletionDetails ? (
                                <div className="mt-1">Details: {requirement.vendorCompletionDetails}</div>
                              ) : null}
                            </div>
                          ) : null}
                          <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${getCloseoutGuidance(requirement).tone}`}>
                            <div className="font-semibold">{getCloseoutGuidance(requirement).label}</div>
                            <div className="mt-1">{getCloseoutGuidance(requirement).detail}</div>
                            <div className="mt-1 opacity-90">Next: {getCloseoutGuidance(requirement).nextAction}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className={`rounded-full px-2 py-1 font-medium ${procurementStateTone[requirement.procurementState || 'scoped_only']}`}>
                              {procurementStateLabel(requirement.procurementState)}
                            </span>
                            <span className={`rounded-full px-2 py-1 font-medium ${vendorActionStateTone[requirement.vendorActionState || 'unassigned']}`}>
                              {vendorActionStateLabel(requirement.vendorActionState)}
                            </span>
                            <span className={`rounded-full px-2 py-1 font-medium ${verificationStatusTone[requirement.verificationStatus || 'pending']}`}>
                              {verificationStatusLabel(requirement.verificationStatus)}
                            </span>
                            {(requirement.closeoutIssueState || 'none') !== 'none' ? (
                              <span className={`rounded-full px-2 py-1 font-medium ${closeoutIssueStateTone[requirement.closeoutIssueState || 'none']}`}>
                                {closeoutIssueStateLabel(requirement.closeoutIssueState)}
                              </span>
                            ) : null}
                            {requirement.selectedMatch ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                                Selected for procurement: {requirement.selectedMatch.optionName} ({requirement.selectedMatch.confidenceBand})
                              </span>
                            ) : (matchCandidates[requirement.id]?.[0] ? (
                              <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
                                Suggested only: {matchCandidates[requirement.id][0].optionName} ({matchCandidates[requirement.id][0].confidenceBand})
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">No strong suggestion yet</span>
                            ))}
                            {requirement.procurementReadyAt ? (
                              <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                                Ready {new Date(requirement.procurementReadyAt).toLocaleDateString()}
                              </span>
                            ) : null}
                            {requirement.procurementActivatedAt ? (
                              <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                                Activated {new Date(requirement.procurementActivatedAt).toLocaleDateString()}
                              </span>
                            ) : null}
                            {requirement.assignedVendorDisplayName ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                Assigned to {requirement.assignedVendorDisplayName}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 space-y-1 text-xs text-slate-500">
                            {formatTimestamp(requirement.vendorCompletedAt) ? (
                              <div>
                                Completed by vendor {formatTimestamp(requirement.vendorCompletedAt)}
                                {requirement.assignedVendorDisplayName ? ` • ${requirement.assignedVendorDisplayName}` : ''}
                              </div>
                            ) : null}
                            {formatTimestamp(requirement.receivedAt) ? (
                              <div>
                                Received internally {formatTimestamp(requirement.receivedAt)}
                                {requirement.receivedByUserId ? ` • ${requirement.receivedByUserId}` : ''}
                              </div>
                            ) : null}
                            {formatTimestamp(requirement.verifiedAt) ? (
                              <div>
                                Verified internally {formatTimestamp(requirement.verifiedAt)}
                                {requirement.verifiedByUserId ? ` • ${requirement.verifiedByUserId}` : ''}
                              </div>
                            ) : null}
                            {(requirement.closeoutIssueState || 'none') !== 'none' ? (
                              <div className="text-rose-700">
                                {closeoutIssueStateLabel(requirement.closeoutIssueState)} {formatTimestamp(requirement.closeoutIssueAt) || ''}
                                {requirement.closeoutIssueByUserId ? ` • ${requirement.closeoutIssueByUserId}` : ''}
                                {requirement.closeoutIssueNotes ? ` • ${requirement.closeoutIssueNotes}` : ''}
                              </div>
                            ) : null}
                            {requirement.correctionRoute ? (
                              <div className="mt-1">
                                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${correctionRouteTone[requirement.correctionRoute]}`}>
                                  Correct via {correctionRouteLabel(requirement.correctionRoute)}
                                </span>
                              </div>
                            ) : null}
                            {formatTimestamp(requirement.reopenedAt) ? (
                              <div className="text-violet-700">
                                Reopened {formatTimestamp(requirement.reopenedAt)}
                                {requirement.reopenedByUserId ? ` • ${requirement.reopenedByUserId}` : ''}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-stretch gap-3 md:items-end">
                        {canManageProcurement ? (
                          <>
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => void handleMarkReadyForProcurement(requirement)}
                                aria-label={`Mark ready for procurement ${requirement.itemDescription}`}
                                disabled={['ready_for_procurement', 'activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '')}
                                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                              >
                                Ready
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedRequirementForComparison(requirement)}
                                aria-label={`Compare procurement matches for ${requirement.itemDescription}`}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                              >
                                <Sparkles size={14} />
                                Compare
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleActivateRequirement(requirement)}
                                aria-label={`Activate procurement for ${requirement.itemDescription}`}
                                disabled={!requirement.selectedMatch || ['activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '')}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                              >
                                Activate
                              </button>
                            </div>
                            <div className="grid gap-2 md:min-w-[280px]">
                              <label className="text-xs font-medium text-slate-500">Assigned vendor</label>
                              <select
                                aria-label={`Assign vendor for ${requirement.itemDescription}`}
                                value={assignmentSelections[requirement.id] || ''}
                                onChange={(event) => handleAssignmentSelectionChange(requirement.id, event.target.value)}
                                disabled={!['activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '') || !requirement.selectedMatch}
                                className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm disabled:opacity-50"
                              >
                                <option value="">Select vendor</option>
                                {vendorDirectory.map((vendor) => (
                                  <option key={vendor.userId} value={vendor.userId}>
                                    {vendor.displayName}
                                  </option>
                                ))}
                              </select>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleAssignVendor(requirement)}
                                  aria-label={`${requirement.assignedVendorUserId ? 'Reassign' : 'Assign'} vendor for ${requirement.itemDescription}`}
                                  disabled={!['activated', 'ordered', 'fulfilled'].includes(requirement.procurementState || '') || !requirement.selectedMatch || !(assignmentSelections[requirement.id] || '')}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                >
                                  {requirement.assignedVendorUserId ? 'Reassign Vendor' : 'Assign Vendor'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUnassignVendor(requirement)}
                                  aria-label={`Unassign vendor from ${requirement.itemDescription}`}
                                  disabled={!requirement.assignedVendorUserId}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                >
                                  Unassign
                                </button>
                              </div>
                              {requirement.procurementAssignedAt ? (
                                <div className="text-xs text-slate-400">
                                  Assigned {new Date(requirement.procurementAssignedAt).toLocaleString()}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400">
                                  Assignment requires an activated item with a selected procurement product.
                                </div>
                              )}
                            </div>
                            <div className="grid gap-2 md:min-w-[280px]">
                              <label className="text-xs font-medium text-slate-500">Correction route</label>
                              <select
                                aria-label={`Correction route for ${requirement.itemDescription}`}
                                value={
                                  correctionRouteSelections[requirement.id] ||
                                  requirement.correctionRoute ||
                                  MaterialRequirementService.getSuggestedCorrectionRoute(requirement)
                                }
                                onChange={(event) =>
                                  handleCorrectionRouteSelectionChange(
                                    requirement.id,
                                    event.target.value as MaterialCorrectionRoute
                                  )
                                }
                                disabled={!canManageCloseoutExceptions}
                                className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm disabled:opacity-50"
                              >
                                <option value="vendor">Vendor</option>
                                <option value="procurement">Procurement</option>
                                <option value="scope">Scope</option>
                              </select>
                              <div className="text-xs text-slate-400">
                                Choose where this requirement should go next if closeout fails or rework is required.
                              </div>
                              {(
                                (correctionRouteSelections[requirement.id] || requirement.correctionRoute) === 'scope' &&
                                onOpenInspectionScope
                              ) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenInspectionScope(
                                      requirement.inspectionId,
                                      'materials',
                                      'Opened from Procurement • Scope Correction',
                                      {
                                        entityType: 'material',
                                        entityId: requirement.id,
                                        originLabel: 'Opened from Procurement • Scope Correction',
                                      }
                                    )
                                  }
                                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
                                >
                                  Open Scope Correction
                                </button>
                              ) : null}
                            </div>
                            <div className="grid gap-2 md:min-w-[280px]">
                              <label className="text-xs font-medium text-slate-500">Receiving and verification</label>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleMarkReceived(requirement)}
                                  disabled={!canManageVerification || requirement.vendorActionState !== 'completed' || ['received', 'verified'].includes(requirement.verificationStatus || 'pending')}
                                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  Receive into Closeout
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleMarkVerified(requirement)}
                                  disabled={!canManageVerification || (requirement.verificationStatus || 'pending') !== 'received'}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  Verify and Close
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleMarkVerificationFailed(
                                      requirement,
                                      correctionRouteSelections[requirement.id] ||
                                        requirement.correctionRoute ||
                                        MaterialRequirementService.getSuggestedCorrectionRoute(requirement)
                                    )
                                  }
                                  disabled={!canManageCloseoutExceptions || !['received', 'verified'].includes(requirement.verificationStatus || 'pending')}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                >
                                  Fail and Reroute
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleReopenForRework(
                                      requirement,
                                      correctionRouteSelections[requirement.id] ||
                                        requirement.correctionRoute ||
                                        MaterialRequirementService.getSuggestedCorrectionRoute(requirement)
                                    )
                                  }
                                  disabled={!canManageCloseoutExceptions || !(['received', 'verified'].includes(requirement.verificationStatus || 'pending') || requirement.procurementState === 'fulfilled' || (requirement.closeoutIssueState || 'none') !== 'none')}
                                  className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                                >
                                  Reopen and Route
                                </button>
                              </div>
                              <div className="text-xs text-slate-400">
                                {(requirement.closeoutIssueState || 'none') === 'verification_failed'
                                  ? `Verification failed. Correct this through ${correctionRouteLabel(correctionRouteSelections[requirement.id] || requirement.correctionRoute || MaterialRequirementService.getSuggestedCorrectionRoute(requirement))}.`
                                  : (requirement.closeoutIssueState || 'none') === 'rework_required'
                                    ? `This requirement has been reopened and routed back through ${correctionRouteLabel(correctionRouteSelections[requirement.id] || requirement.correctionRoute || MaterialRequirementService.getSuggestedCorrectionRoute(requirement))}.`
                                    : (requirement.verificationStatus || 'pending') === 'pending'
                                      ? 'Receiving is available only after the assigned vendor marks the work completed.'
                                      : (requirement.verificationStatus || 'pending') === 'received'
                                        ? 'Verification closes the loop and marks this requirement fulfilled.'
                                        : 'Verification complete. Procurement is fully closed for this requirement.'}
                              </div>
                            </div>
                          </>
                        ) : null}
                        <select
                          value={requirement.status}
                          onChange={(event) =>
                            void handleRequirementStatusChange(
                              requirement,
                              event.target.value as MaterialRequirementStatus
                            )
                          }
                          disabled={!canManageProcurement}
                          className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm"
                        >
                          {MATERIAL_REQUIREMENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {titleCase(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-4">
          {portfolioSummary ? (
            <details className="rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-800">
                <ClipboardList size={18} className="text-slate-600" />
                Portfolio Summary
              </summary>
              <div className="mt-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Drafts</div>
                  <div className="text-sm font-semibold text-slate-800">{portfolioSummary.draftCount}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Review Needed</div>
                  <div className="text-sm font-semibold text-slate-800">{portfolioSummary.draftCountWithReviewNeeded}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Optimized Items</div>
                  <div className="text-sm font-semibold text-slate-800">{portfolioSummary.optimizedItemCount}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">No-Offer Items</div>
                  <div className="text-sm font-semibold text-slate-800">{portfolioSummary.unmatchedOrNoOfferCount}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Estimated Optimized Cost</div>
                  <div className="text-sm font-semibold text-slate-800">${portfolioSummary.estimatedOptimizedCost.toFixed(2)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Projected Waste</div>
                  <div className="text-sm font-semibold text-slate-800">{portfolioSummary.projectedWasteQuantity.toFixed(1)} units</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {portfolioSummary.draftCountWithStaleVendorData > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700">
                    <AlertTriangle size={12} />
                    {portfolioSummary.draftCountWithStaleVendorData} draft{portfolioSummary.draftCountWithStaleVendorData === 1 ? '' : 's'} with stale vendor data
                  </span>
                ) : null}
                {portfolioSummary.draftCountWithBundleOpportunities > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">
                    <AlertTriangle size={12} />
                    {portfolioSummary.draftCountWithBundleOpportunities} draft{portfolioSummary.draftCountWithBundleOpportunities === 1 ? '' : 's'} with bundle opportunities
                  </span>
                ) : null}
                {portfolioSummary.draftCountWithCheaperAlternatives > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                    <AlertTriangle size={12} />
                    {portfolioSummary.draftCountWithCheaperAlternatives} draft{portfolioSummary.draftCountWithCheaperAlternatives === 1 ? '' : 's'} with cheaper alternatives
                  </span>
                ) : null}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                Roll-up reflects the current local procurement drafts and their deterministic optimization, vendor, and review-guidance data.
              </div>
              </div>
            </details>
          ) : null}

          {drafts.length > 0 ? (
            <details className="rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="flex list-none items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-slate-600" />
                  <span className="font-semibold text-slate-800">Refresh Health</span>
                </div>
                <span className="text-xs text-slate-500">Secondary insight</span>
              </summary>
              <div className="mt-4">
              <div className="flex items-center justify-end gap-3 mb-4">
                <button
                  type="button"
                  onClick={handleExportMaintenanceSnapshot}
                  disabled={isExportingMaintenanceSnapshot}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  {isExportingMaintenanceSnapshot ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Export Snapshot
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['never_refreshed', 'Never Refreshed', refreshHealthSummary.neverRefreshedCount, 'bg-slate-100 text-slate-700'],
                  ['stale_refresh', 'Stale Refresh', refreshHealthSummary.staleRefreshCount, 'bg-amber-100 text-amber-700'],
                  ['needs_review', 'Needs Review', refreshHealthSummary.needsReviewCount, 'bg-orange-100 text-orange-700'],
                  ['no_offer', 'No Offer', refreshHealthSummary.noOfferCount, 'bg-rose-100 text-rose-700'],
                  ['vendor_issues', 'Vendor Issues', refreshHealthSummary.vendorIssuesCount, 'bg-blue-100 text-blue-700'],
                  ['has_manual_note', 'Has Manual Note', refreshHealthSummary.manualNoteCount, 'bg-violet-100 text-violet-700'],
                ] as Array<[DraftFilter, string, number, string]>).map(([filterValue, label, count, tone]) => (
                  <button
                    key={filterValue}
                    type="button"
                    onClick={() => setDraftFilter(filterValue)}
                    className={`rounded-lg px-3 py-2 text-left transition-colors ${tone} ${
                      draftFilter === filterValue ? 'ring-2 ring-lowes-blue' : ''
                    }`}
                  >
                    <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
                    <div className="text-base font-semibold">{count}</div>
                  </button>
                ))}
              </div>
              {refreshHealthSummary.staleAndNeedsReviewCount > 0 ? (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {refreshHealthSummary.staleAndNeedsReviewCount} draft{refreshHealthSummary.staleAndNeedsReviewCount === 1 ? '' : 's'} are both stale and review-needed.
                </div>
              ) : null}
              <div className="mt-3 text-xs text-slate-500">
                Tap a summary tile to apply the matching draft filter.
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Refresh Aging
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">0-6 Days</div>
                    <div className="text-sm font-semibold text-slate-800">{refreshAgingSummary.zeroToSixCount}</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-amber-700">7-13 Days</div>
                    <div className="text-sm font-semibold text-amber-800">{refreshAgingSummary.sevenToThirteenCount}</div>
                  </div>
                  <div className="rounded-lg bg-rose-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-rose-700">14+ Days</div>
                    <div className="text-sm font-semibold text-rose-800">{refreshAgingSummary.fourteenPlusCount}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Never Refreshed</div>
                    <div className="text-sm font-semibold text-slate-800">{refreshAgingSummary.neverRefreshedCount}</div>
                  </div>
                </div>
                {typeof refreshAgingSummary.oldestStaleDraftAgeDays === 'number' ? (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Oldest stale draft: {refreshAgingSummary.oldestStaleDraftName} ({refreshAgingSummary.oldestStaleDraftAgeDays} day{refreshAgingSummary.oldestStaleDraftAgeDays === 1 ? '' : 's'})
                  </div>
                ) : null}
                {refreshAgingSummary.stalestDrafts.length > 0 ? (
                  <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    Stalest 14+ day drafts: {refreshAgingSummary.stalestDrafts.join(', ')}
                  </div>
                ) : null}
              </div>

              {refreshTrendSummary ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Trend vs Previous Snapshot
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Stale Drafts</div>
                      <div className="text-sm font-semibold text-slate-800">{getTrendLabel(refreshTrendSummary.staleDelta)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Never Refreshed</div>
                      <div className="text-sm font-semibold text-slate-800">{getTrendLabel(refreshTrendSummary.neverRefreshedDelta)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Needs Review</div>
                      <div className="text-sm font-semibold text-slate-800">{getTrendLabel(refreshTrendSummary.needsReviewDelta)}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    Trend compares the current local refresh-health snapshot with the previous workspace snapshot.
                  </div>
                </div>
              ) : null}
              {refreshLedgerSummary ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recent History
                  </div>
                  <div className="mt-2 space-y-2">
                    {refreshLedgerSummary.entries.map((entry) => (
                      <div key={entry.capturedAt} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <div className="font-medium text-slate-800">
                          {new Date(entry.capturedAt).toLocaleString()}
                        </div>
                        <div className="mt-1">
                          Stale {entry.staleRefreshCount} • Never refreshed {entry.neverRefreshedCount} • Needs review {entry.needsReviewCount} • No offer {entry.noOfferCount} • Vendor issues {entry.vendorIssuesCount}
                        </div>
                        {typeof entry.oldestStaleAgeDays === 'number' ? (
                          <div className="mt-1 text-slate-500">
                            Oldest stale age {entry.oldestStaleAgeDays} day{entry.oldestStaleAgeDays === 1 ? '' : 's'}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                    <div className="font-medium text-slate-700">Across recent snapshots</div>
                    <div className={`mt-1 ${getTrendTone(refreshLedgerSummary.multiSnapshotDelta.stale)}`}>
                      Stale drafts {getTrendLabel(refreshLedgerSummary.multiSnapshotDelta.stale)}
                    </div>
                    <div className={`mt-1 ${getTrendTone(refreshLedgerSummary.multiSnapshotDelta.neverRefreshed)}`}>
                      Never refreshed {getTrendLabel(refreshLedgerSummary.multiSnapshotDelta.neverRefreshed)}
                    </div>
                    <div className={`mt-1 ${getTrendTone(refreshLedgerSummary.multiSnapshotDelta.needsReview)}`}>
                      Needs review {getTrendLabel(refreshLedgerSummary.multiSnapshotDelta.needsReview)}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    History is local-only and capped to the most recent 12 refresh-health snapshots.
                  </div>
                </div>
              ) : null}
              {maintenanceDigest ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Weekly Maintenance Digest
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                        maintenanceDigest.label === 'improving'
                          ? 'bg-emerald-100 text-emerald-700'
                          : maintenanceDigest.label === 'worsening'
                            ? 'bg-rose-100 text-rose-700'
                            : maintenanceDigest.label === 'mixed'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {titleCase(maintenanceDigest.label)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Based on the most recent {maintenanceDigest.windowSize} ledger snapshot{maintenanceDigest.windowSize === 1 ? '' : 's'}.
                  </div>
                  <div className="mt-3 space-y-2">
                    {maintenanceDigest.metrics.map((metric) => (
                      <div key={metric.label} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <span className="font-medium text-slate-800">{metric.label}:</span> {metric.summary}
                      </div>
                    ))}
                  </div>
                  {maintenanceDigest.oldestStaleAgeSummary ? (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <span className="font-medium text-slate-800">Oldest stale age:</span> {maintenanceDigest.oldestStaleAgeSummary}
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
            </details>
          ) : null}

          <details className="rounded-2xl border border-slate-200 bg-white p-5">
            <summary className="flex list-none items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-slate-600" />
                <span className="font-semibold text-slate-800">Procurement Drafts</span>
              </div>
              <span className="text-xs text-slate-500">Maintenance and export tools</span>
            </summary>
            <div className="mt-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-xs text-slate-500">
                Use drafts for maintenance and export support after the main execution queues are under control.
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={draftSort}
                  onChange={(event) => setDraftSort(event.target.value as DraftSort)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                >
                  <option value="most_stale">Most stale first</option>
                  <option value="most_review_needed">Most review-needed first</option>
                  <option value="highest_no_offer">Highest no-offer pressure</option>
                  <option value="highest_optimized_cost">Highest optimized cost</option>
                  <option value="most_recently_refreshed">Most recently refreshed</option>
                  <option value="least_recently_refreshed">Least recently refreshed</option>
                </select>
                <select
                  value={draftGrouping}
                  onChange={(event) => setDraftGrouping(event.target.value as DraftGrouping)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                >
                  <option value="none">No grouping</option>
                  <option value="triage">Triage grouping</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleBulkRefresh()}
                  disabled={isBulkRefreshing || filteredDrafts.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  {isBulkRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Refresh Filtered
                </button>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {([
                ['all', 'All'],
                ['needs_review', 'Needs Review'],
                ['never_refreshed', 'Never Refreshed'],
                ['stale_refresh', 'Stale Refresh'],
                ['no_offer', 'No Offer'],
                ['vendor_issues', 'Vendor Issues'],
                ['has_manual_note', 'Has Manual Note'],
                ['no_manual_note', 'No Manual Note'],
              ] as Array<[DraftFilter, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDraftFilter(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    draftFilter === value
                      ? 'bg-lowes-blue text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mb-4 text-xs text-slate-500">
              Showing {filteredDrafts.length} of {drafts.length} draft{drafts.length === 1 ? '' : 's'}.
            </div>
            {drafts.length === 0 ? (
              <div className="text-sm text-slate-500">No procurement drafts created yet.</div>
            ) : filteredDrafts.length === 0 ? (
              <div className="text-sm text-slate-500">No procurement drafts match the current filter.</div>
            ) : (
              <div className="space-y-3">
                {groupedDrafts.map((group) => (
                  <div key={group.label} className="space-y-3">
                    {draftGrouping === 'triage' ? (
                      <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {group.label} ({group.drafts.length})
                      </div>
                    ) : null}
                    {group.drafts.map((draft) => (
                      <div key={draft.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        {(() => {
                      const optimizationSummary = summarizePackStrategy(draft);
                      const tradeoffSummary = summarizeTradeoff(draft);
                      const vendorSummary = summarizeVendorInsight(draft);
                      const optimizationSignals = collectOptimizationSignals(draft);
                      const vendorSignals = collectVendorSignals(draft);
                      const reviewGuidanceEntries = getReviewGuidanceEntries(draft);
                      const optimizationStats = getOptimizationStats(draft);
                      const vendorStats = getVendorStats(draft);
                      const refreshRecency = getRefreshRecency(draft.intelligenceRefreshedAt);
                      const refreshChanges = summarizeRefreshChanges(draft);

                        return (
                          <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-slate-800">{draft.name}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRefreshDraft(draft)}
                          disabled={refreshingDraftId === draft.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {refreshingDraftId === draft.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportDraft(draft)}
                          disabled={exportingDraftId === draft.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {exportingDraftId === draft.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                          Export Draft
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      {draft.itemCount} items • {titleCase(draft.status)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {hasManualNote(draft) ? (
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-medium text-violet-700">
                          Has Manual Note
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                          No Manual Note
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      {draft.items.filter((item) => item.selectedMatch).length} matched •{' '}
                      {draft.items.filter((item) => !item.selectedMatch).length} unmatched
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      {new Date(draft.updatedAt).toLocaleString()}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${refreshRecency.tone}`}>
                        {refreshRecency.label}
                      </span>
                      {draft.intelligenceRefreshedAt ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                          Last refresh {new Date(draft.intelligenceRefreshedAt).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                    {draft.intelligenceRefreshedAt ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Last Refresh Result
                        </div>
                        <div className="mt-2 space-y-2">
                          {refreshChanges.map((change) => (
                            <div key={change} className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              {change}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Manual Maintenance Note
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Manual ops context only. This note does not affect computed procurement intelligence.
                          </div>
                        </div>
                        {draft.manualAnnotation?.updatedAt ? (
                          <div className="text-[11px] text-slate-400">
                            Updated {new Date(draft.manualAnnotation.updatedAt).toLocaleString()}
                          </div>
                        ) : null}
                      </div>
                      <textarea
                        value={draftAnnotations[draft.id] || ''}
                        onChange={(event) => handleAnnotationChange(draft.id, event.target.value)}
                        placeholder="Add a short manual ops note for this draft..."
                        className="mt-3 min-h-[88px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-lowes-blue focus:ring-2 focus:ring-lowes-blue/20"
                      />
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveAnnotation(draft)}
                          disabled={savingAnnotationDraftId === draft.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {savingAnnotationDraftId === draft.id ? <Loader2 size={14} className="animate-spin" /> : null}
                          Save Note
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleAnnotationChange(draft.id, '');
                            void handleSaveAnnotation(draft, '');
                          }}
                          disabled={savingAnnotationDraftId === draft.id || !(draftAnnotations[draft.id] || draft.manualAnnotation?.note)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Clear Note
                        </button>
                      </div>
                    </div>
                    {optimizationSummary ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Optimization Summary
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Optimized</div>
                            <div className="text-sm font-semibold text-slate-800">{optimizationStats.optimizedCount} items</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Estimated Cost</div>
                            <div className="text-sm font-semibold text-slate-800">${optimizationStats.estimatedCost.toFixed(2)}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Projected Waste</div>
                            <div className="text-sm font-semibold text-slate-800">{optimizationStats.projectedWaste.toFixed(1)} units</div>
                          </div>
                        </div>
                        <div className="text-sm text-slate-700 mt-3">
                          {optimizationSummary}
                        </div>
                        {tradeoffSummary ? (
                          <div className="text-xs text-slate-500 mt-1">
                            {tradeoffSummary}
                          </div>
                        ) : null}
                        {optimizationSignals.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {optimizationSignals.map((signal) => (
                              <span
                                key={signal}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${optimizationSignalTone[signal]}`}
                              >
                                <AlertTriangle size={12} />
                                {titleCase(signal)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          {draft.items
                            .filter((item) => item.optimization)
                            .slice(0, 2)
                            .map((item) => (
                              <div key={item.id} className="rounded-md bg-slate-50 px-3 py-2">
                                <div className="text-xs font-medium text-slate-700">{item.itemDescription}</div>
                                <div className="text-xs text-slate-500 mt-1">
                                  {item.optimization?.recommendedPacks
                                    .map((selection) => `${selection.packCount} x ${selection.optionName}`)
                                    .join(' + ') || 'No pack recommendation'}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : null}
                    {vendorSummary ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Vendor Intelligence
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Selected Offers</div>
                            <div className="text-sm font-semibold text-slate-800">{vendorStats.selectedOfferCount}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Stale</div>
                            <div className="text-sm font-semibold text-slate-800">{vendorStats.staleCount}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheaper Alt</div>
                            <div className="text-sm font-semibold text-slate-800">{vendorStats.cheaperAlternativeCount}</div>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Bundle Ops</div>
                            <div className="text-sm font-semibold text-slate-800">{vendorStats.bundleCount}</div>
                          </div>
                        </div>
                        <div className="text-sm text-slate-700 mt-3">
                          {vendorSummary}
                        </div>
                        {vendorSignals.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {vendorSignals.map((signal) => (
                              <span
                                key={signal}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${vendorSignalTone[signal]}`}
                              >
                                <AlertTriangle size={12} />
                                {titleCase(signal)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          {draft.items
                            .filter((item) => item.vendorIntelligence?.selectedOffer || item.vendorIntelligence?.riskSignals.length)
                            .slice(0, 2)
                            .map((item) => (
                              <div key={item.id} className="rounded-md bg-slate-50 px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-xs font-medium text-slate-700">{item.itemDescription}</div>
                                  {item.vendorIntelligence?.selectedOffer?.freshnessLabel ? (
                                    <span
                                      className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                        freshnessTone[item.vendorIntelligence.selectedOffer.freshnessLabel] || 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {item.vendorIntelligence.selectedOffer.freshnessLabel}
                                    </span>
                                  ) : null}
                                </div>
                                {item.vendorIntelligence?.selectedOffer ? (
                                  <div className="text-xs text-slate-500 mt-1">
                                    {item.vendorIntelligence.selectedOffer.optionName}
                                    {typeof item.vendorIntelligence.selectedOffer.price === 'number'
                                      ? ` • $${item.vendorIntelligence.selectedOffer.price.toFixed(2)}`
                                      : ''}
                                    {` • ${titleCase(item.vendorIntelligence.selectedOffer.confidenceBand)} confidence`}
                                  </div>
                                ) : null}
                                {item.vendorIntelligence?.cheapestAlternative ? (
                                  <div className="text-xs text-amber-700 mt-1">
                                    Cheaper alternative: {item.vendorIntelligence.cheapestAlternative.optionName}
                                    {typeof item.vendorIntelligence.cheapestAlternative.price === 'number'
                                      ? ` • $${item.vendorIntelligence.cheapestAlternative.price.toFixed(2)}`
                                      : ''}
                                  </div>
                                ) : null}
                                {item.vendorIntelligence?.bundleSuggestion ? (
                                  <div className="text-xs text-emerald-700 mt-1">
                                    Bundle opportunity: {item.vendorIntelligence.bundleSuggestion.companionCount} companion item{item.vendorIntelligence.bundleSuggestion.companionCount === 1 ? '' : 's'} with {item.vendorIntelligence.bundleSuggestion.triggerName}
                                  </div>
                                ) : null}
                                {!item.vendorIntelligence?.selectedOffer && item.vendorIntelligence?.riskSignals.length ? (
                                  <div className="text-xs text-rose-700 mt-1">
                                    No vendor offer selected for this requirement.
                                  </div>
                                ) : null}
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : null}
                    {reviewGuidanceEntries.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                          Attention Needed
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Array.from(new Set(reviewGuidanceEntries.map(({ entry }) => entry.code))).map((code) =>
                            renderBadge(titleCase(code), reviewGuidanceTone[code])
                          )}
                        </div>
                        <div className="mt-3 space-y-2">
                          {reviewGuidanceEntries.slice(0, 4).map(({ itemDescription, entry }) => (
                            <div key={`${itemDescription}-${entry.code}`} className="rounded-md bg-white px-3 py-2 text-xs text-amber-900">
                              <div className="font-medium text-slate-800">{entry.title}</div>
                              <div className="mt-1 text-slate-600">{itemDescription}: {entry.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                          </>
                        );
                      })()}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            </div>
          </details>
        </div>
      </div>
      ) : null}

      <MaterialMatchComparisonModal
        isOpen={Boolean(selectedRequirementForComparison)}
        requirement={selectedRequirementForComparison}
        candidates={
          selectedRequirementForComparison
            ? matchCandidates[selectedRequirementForComparison.id] || []
            : []
        }
        onClose={() => setSelectedRequirementForComparison(null)}
        onSelect={(candidate) => {
          if (!selectedRequirementForComparison) return;
          void handleSelectMatch(selectedRequirementForComparison, candidate);
        }}
        onClear={() => {
          if (!selectedRequirementForComparison) return;
          void handleClearMatch(selectedRequirementForComparison);
        }}
      />
    </div>
  );
};
