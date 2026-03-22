import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, Download, Loader2, RefreshCw, ShoppingCart, Sparkles } from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { Inspection } from '../core/models/inspections';
import { MaterialRequirement, MATERIAL_REQUIREMENT_STATUSES, MaterialRequirementStatus } from '../core/models/operations';
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
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { MaterialMatchingService } from '../core/services/MaterialMatchingService';
import { ProcurementDraftService } from '../core/services/ProcurementDraftService';
import { ProcurementExportService } from '../core/services/ProcurementExportService';
import { ProcurementMaintenanceSnapshotExportService } from '../core/services/ProcurementMaintenanceSnapshotExportService';
import { ProcurementMaintenanceDigestService } from '../core/services/ProcurementMaintenanceDigestService';
import { ProcurementRefreshAnalyticsService } from '../core/services/ProcurementRefreshAnalyticsService';
import { ProcurementPortfolioSummaryService } from '../core/services/ProcurementPortfolioSummaryService';
import { MaterialMatchComparisonModal } from './MaterialMatchComparisonModal';

type GroupBy = 'inspection' | 'category' | 'status';
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

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

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

export const ProcurementWorkspace: React.FC = () => {
  const { org } = useAppContext();
  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [drafts, setDrafts] = useState<ProcurementDraft[]>([]);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('inspection');
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
  const [message, setMessage] = useState<string | null>(null);
  const [refreshAnalyticsSnapshot, setRefreshAnalyticsSnapshot] = useState<{
    previous?: ProcurementRefreshAnalyticsSnapshot;
    current?: ProcurementRefreshAnalyticsSnapshot;
    ledger?: ProcurementRefreshLedgerEntry[];
  }>({});
  const [matchCandidates, setMatchCandidates] = useState<Record<string, MaterialRequirementMatchCandidate[]>>({});
  const [selectedRequirementForComparison, setSelectedRequirementForComparison] = useState<MaterialRequirement | null>(null);

  const loadData = async () => {
    if (!org) return;
    setIsLoading(true);
    try {
      const [loadedRequirements, loadedInspections, loadedDrafts] = await Promise.all([
        MaterialRequirementService.listRequirements(org.id),
        InspectionService.listInspections(org.id),
        ProcurementDraftService.listDrafts(org.id),
      ]);
      setRequirements(loadedRequirements);
      setInspections(loadedInspections);
      setDrafts(loadedDrafts);
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
  }, [org?.id]);

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

  const inspectionLookup = useMemo(
    () => Object.fromEntries(inspections.map((inspection) => [inspection.id, inspection])),
    [inspections]
  );

  const filteredRequirements = useMemo(
    () =>
      requirements.filter((requirement) => (statusFilter === 'all' ? true : requirement.status === statusFilter)),
    [requirements, statusFilter]
  );

  const groupedRequirements = useMemo(() => {
    const groups = new Map<string, MaterialRequirement[]>();
    for (const requirement of filteredRequirements) {
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
  }, [filteredRequirements, groupBy, inspectionLookup]);

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
    if (!org) return;
    const selectedRequirements = requirements.filter((requirement) => selectedRequirementIds.includes(requirement.id));
    if (selectedRequirements.length === 0) {
      setMessage('Select at least one material requirement first.');
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
            { ...requirement, status: 'planned' },
            'system'
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
    if (!org) return;
    try {
      await MaterialRequirementService.updateRequirement(org.id, { ...requirement, status }, 'system');
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
    if (!org) return;
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
        { ...requirement, selectedMatch: validated, status: requirement.status === 'draft' ? 'reviewed' : requirement.status },
        'system'
      );
      await MaterialMatchingService.rememberSelection(org.id, requirement, validated);
      setMessage(`Selected "${validated.optionName}" for ${requirement.itemDescription}.`);
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to select match.');
    }
  };

  const handleClearMatch = async (requirement: MaterialRequirement) => {
    if (!org) return;
    try {
      await MaterialRequirementService.updateRequirement(org.id, { ...requirement, selectedMatch: undefined }, 'system');
      setMessage(`Cleared selected match for ${requirement.itemDescription}.`);
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to clear match.');
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Procurement Workspace</h1>
          <p className="text-slate-500">Review material requirements, group demand, and seed procurement drafts.</p>
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
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
            className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm"
          >
            <option value="inspection">Group by inspection</option>
            <option value="category">Group by category</option>
            <option value="status">Group by status</option>
          </select>
          <button
            onClick={() => void handleCreateDraft()}
            disabled={isCreatingDraft}
            className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isCreatingDraft ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
            Seed Procurement Draft
          </button>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 flex items-center justify-center">
              <Loader2 className="animate-spin text-lowes-blue" size={28} />
            </div>
          ) : groupedRequirements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              No material requirements match the current filter.
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
                    <div key={requirement.id} className="p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRequirementIds.includes(requirement.id)}
                          onChange={() => handleToggleRequirement(requirement.id)}
                          className="mt-1"
                        />
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
                          <div className="mt-2 text-xs">
                            {requirement.selectedMatch ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                                Selected: {requirement.selectedMatch.optionName} ({requirement.selectedMatch.confidenceBand})
                              </span>
                            ) : (matchCandidates[requirement.id]?.[0] ? (
                              <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
                                Suggested: {matchCandidates[requirement.id][0].optionName} ({matchCandidates[requirement.id][0].confidenceBand})
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">No strong match</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedRequirementForComparison(requirement)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                        >
                          <Sparkles size={14} />
                          Compare
                        </button>
                        <select
                          value={requirement.status}
                          onChange={(event) =>
                            void handleRequirementStatusChange(
                              requirement,
                              event.target.value as MaterialRequirementStatus
                            )
                          }
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
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList size={18} className="text-slate-600" />
                <h2 className="font-semibold text-slate-800">Portfolio Summary</h2>
              </div>
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
          ) : null}

          {drafts.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-slate-600" />
                  <h2 className="font-semibold text-slate-800">Refresh Health</h2>
                </div>
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
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-slate-600" />
                <h2 className="font-semibold text-slate-800">Procurement Drafts</h2>
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
        </div>
      </div>

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
