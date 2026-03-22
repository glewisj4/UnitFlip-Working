export type ProcurementDraftStatus =
  | 'draft'
  | 'planned'
  | 'quoted'
  | 'ordered'
  | 'fulfilled'
  | 'canceled';

export type MatchConfidenceBand = 'exact' | 'close' | 'loose' | 'manual';
export type ProcurementOptimizationSignal =
  | 'better_pack_size_available'
  | 'combine_with_other_units'
  | 'high_quantity_item'
  | 'overbuy_risk';
export type ProcurementOfferFreshnessLabel = 'Fresh' | 'Recent' | 'Stale';
export type ProcurementVendorRiskSignal =
  | 'no_offer'
  | 'cheaper_alternative'
  | 'stale_price'
  | 'bundle_opportunity'
  | 'unmatched_requirement';
export type ProcurementReviewGuidanceCode =
  | 'low_confidence_match'
  | 'missing_pricing'
  | 'stale_vendor_data'
  | 'no_offer_available'
  | 'overbuy_risk'
  | 'cheaper_alternative_available'
  | 'bundle_review';

export interface MaterialRequirementMatchCandidate {
  catalogItemId: string;
  catalogItemName: string;
  optionId?: string;
  optionName: string;
  category?: string;
  unit: string;
  vendor?: string;
  sku?: string;
  modelNumber?: string;
  price?: number;
  confidenceScore: number;
  confidenceBand: MatchConfidenceBand;
  rationale: string[];
  metadata?: Record<string, unknown>;
}

export interface SelectedProcurementOption {
  catalogItemId: string;
  catalogItemName: string;
  optionId?: string;
  optionName: string;
  category?: string;
  unit: string;
  vendor?: string;
  sku?: string;
  modelNumber?: string;
  price?: number;
  confidenceScore: number;
  confidenceBand: MatchConfidenceBand;
  rationale: string[];
  selectedAt: number;
}

export interface MaterialMatchingPreference {
  id: string;
  orgId: string;
  key: string;
  catalogItemId: string;
  optionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProcurementPackSelection {
  optionId?: string;
  optionName: string;
  packQuantity: number;
  packUnit: string;
  packCount: number;
  unitPrice: number;
  lineCost: number;
}

export interface ProcurementOptimization {
  requiredQuantity: number;
  requiredUnit: string;
  estimatedCoverageQuantity: number;
  estimatedWasteQuantity: number;
  estimatedTotalCost: number;
  rationale: string[];
  recommendedPacks: ProcurementPackSelection[];
  signals: ProcurementOptimizationSignal[];
}

export interface ProcurementBundleSuggestionSummary {
  triggerCatalogItemId: string;
  triggerName: string;
  companionCount: number;
}

export interface ProcurementVendorOfferInsight {
  catalogItemId: string;
  catalogItemName: string;
  optionId?: string;
  optionName: string;
  vendor?: string;
  price?: number;
  unit: string;
  confidenceScore: number;
  confidenceBand: MatchConfidenceBand;
  freshnessLabel: ProcurementOfferFreshnessLabel;
  rationale: string[];
}

export interface ProcurementVendorIntelligence {
  matchedCatalogItemName?: string;
  selectedOffer?: ProcurementVendorOfferInsight;
  cheapestAlternative?: {
    optionName: string;
    price?: number;
  };
  bundleSuggestion?: ProcurementBundleSuggestionSummary;
  riskSignals: ProcurementVendorRiskSignal[];
  reviewNeeded: boolean;
}

export interface ProcurementReviewGuidance {
  code: ProcurementReviewGuidanceCode;
  title: string;
  detail: string;
  source: 'match' | 'vendor' | 'optimization';
}

export interface ProcurementDraftItem {
  id: string;
  materialRequirementId: string;
  inspectionId: string;
  repairTaskId?: string;
  findingId?: string;
  generatedSectionId?: string;
  generatedItemId?: string;
  roomLabel?: string;
  category: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  notes?: string;
  selectedMatch?: SelectedProcurementOption;
  optimization?: ProcurementOptimization;
  vendorIntelligence?: ProcurementVendorIntelligence;
  reviewGuidance?: ProcurementReviewGuidance[];
}

export interface ProcurementDraft {
  id: string;
  orgId: string;
  name: string;
  status: ProcurementDraftStatus;
  itemCount: number;
  sourceRequirementIds: string[];
  items: ProcurementDraftItem[];
  createdAt: number;
  updatedAt: number;
  intelligenceRefreshedAt?: number;
  lastRefreshSummary?: ProcurementDraftRefreshSummary;
  manualAnnotation?: ProcurementManualAnnotation;
}

export interface ProcurementPortfolioSummary {
  draftCount: number;
  draftCountWithReviewNeeded: number;
  optimizedItemCount: number;
  estimatedOptimizedCost: number;
  projectedWasteQuantity: number;
  unmatchedOrNoOfferCount: number;
  draftCountWithStaleVendorData: number;
  draftCountWithBundleOpportunities: number;
  draftCountWithCheaperAlternatives: number;
}

export interface ProcurementDraftRefreshSummary {
  optimizationChangedItemCount: number;
  vendorChangedItemCount: number;
  reviewGuidanceAddedCount: number;
  reviewGuidanceRemovedCount: number;
  noOfferItemDelta: number;
}

export interface ProcurementManualAnnotation {
  note: string;
  updatedAt: number;
}

export interface ProcurementRefreshAnalyticsSnapshot {
  capturedAt: number;
  neverRefreshedCount: number;
  staleRefreshCount: number;
  needsReviewCount: number;
}

export interface ProcurementRefreshLedgerEntry extends ProcurementRefreshAnalyticsSnapshot {
  noOfferCount: number;
  vendorIssuesCount: number;
  oldestStaleAgeDays?: number;
}

export interface ProcurementMaintenanceDigestMetric {
  label: string;
  delta: number;
  summary: string;
}

export interface ProcurementMaintenanceDigest {
  label: 'improving' | 'mixed' | 'worsening' | 'stable';
  windowSize: number;
  metrics: ProcurementMaintenanceDigestMetric[];
  oldestStaleAgeSummary?: string;
}
