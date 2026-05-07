export type ProcurementDraftStatus =
  | 'draft'
  | 'planned'
  | 'quoted'
  | 'ordered'
  | 'fulfilled'
  | 'canceled';

export type ProcurementBundleId =
  | 'paint-turnover'
  | 'blinds-replacement'
  | 'bathroom-refresh'
  | 'electrical-refresh'
  | 'lvp-flooring'
  | 'carpet-replacement'
  | 'door-hardware';
export type ProcurementBundleQuantityStrategy = 'per_unit' | 'per_room' | 'per_item' | 'sqft' | 'manual';
export type ProcurementProductResolutionMethod =
  | 'exact_category'
  | 'alias'
  | 'fallback_category'
  | 'manual_needed';
export type ProcurementDraftRecommendationAttachmentState =
  | 'recommended'
  | 'attached'
  | 'manual_needed';

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

export interface ProcurementBundleLine {
  id: string;
  category: string;
  label: string;
  quantityStrategy: ProcurementBundleQuantityStrategy;
  defaultQuantity?: number;
  notes?: string;
  lowesCategory?: string;
}

export interface ProcurementBundleDefinition {
  id: ProcurementBundleId;
  label: string;
  description: string;
  triggerTemplateItemIds?: string[];
  triggerLowesCategories?: string[];
  preferredProductTier?: 'high' | 'mid' | 'low';
  lines: ProcurementBundleLine[];
}

export interface ResolvedProcurementBundleLine {
  id: string;
  category: string;
  label: string;
  quantity: number | null;
  quantityStrategy: ProcurementBundleQuantityStrategy;
  notes?: string;
  lowesCategory?: string;
}

export interface ResolvedProcurementBundle {
  id: ProcurementBundleId;
  label: string;
  description: string;
  sourceInspectionId: string;
  sourceGeneratedItemIds: string[];
  sourceRequirementIds: string[];
  sourceRepairTaskIds: string[];
  preferredProductTier?: 'high' | 'mid' | 'low';
  lines: ResolvedProcurementBundleLine[];
}

export interface ProcurementProductAlternate {
  productId: string;
  productLabel: string;
  optionId?: string;
  optionLabel: string;
  sku?: string;
  vendor?: string;
  price?: number;
  unit: string;
  reason: string;
}

export interface ResolvedProcurementProductRecommendation {
  id: string;
  bundleId: ProcurementBundleId;
  bundleLabel: string;
  bundleLineId: string;
  bundleLineLabel: string;
  sourceInspectionId: string;
  sourceGeneratedItemIds: string[];
  sourceRequirementIds: string[];
  preferredProductTier?: 'high' | 'mid' | 'low';
  resolutionMethod: ProcurementProductResolutionMethod;
  confidenceBand: MatchConfidenceBand;
  status: 'resolved' | 'manual_needed';
  lowesCategory?: string;
  recommendedProductId?: string;
  recommendedProductLabel?: string;
  recommendedOptionId?: string;
  recommendedOptionLabel?: string;
  recommendedSku?: string;
  recommendedVendor?: string;
  quantity: number | null;
  unit: string;
  estimatedUnitPrice?: number;
  estimatedLineCost?: number;
  optimization?: ProcurementOptimization;
  alternates: ProcurementProductAlternate[];
  rationale: string[];
}

export interface ProcurementDraftRecommendationAttachment {
  id: string;
  draftId: string;
  recommendationId: string;
  bundleId: ProcurementBundleId;
  bundleLineId: string;
  productId: string | null;
  productLabel: string | null;
  quantity: number | null;
  unit?: string;
  attachmentState: ProcurementDraftRecommendationAttachmentState;
  sourceRequirementIds?: string[];
  sourceGeneratedItemIds?: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProcurementDraftPromotedLine {
  id: string;
  draftId: string;
  recommendationId: string;
  bundleId: ProcurementBundleId;
  bundleLineId: string;
  productId: string | null;
  optionId?: string | null;
  vendorId?: string | null;
  skuCode?: string | null;
  label: string;
  quantity: number | null;
  unit?: string;
  estimatedUnitPrice?: number | null;
  estimatedLineCost?: number | null;
  optimization?: ProcurementOptimization;
  sourceRequirementIds: string[];
  sourceGeneratedItemIds: string[];
  notes?: string;
  promotionState: 'draft_line';
  createdAt: number;
  updatedAt: number;
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
  bundleIds?: ProcurementBundleId[];
}

export interface ProcurementDraft {
  id: string;
  orgId: string;
  name: string;
  status: ProcurementDraftStatus;
  itemCount: number;
  sourceRequirementIds: string[];
  items: ProcurementDraftItem[];
  bundleSuggestions?: ResolvedProcurementBundle[];
  bundleProductRecommendations?: ResolvedProcurementProductRecommendation[];
  recommendationAttachments?: ProcurementDraftRecommendationAttachment[];
  promotedLines?: ProcurementDraftPromotedLine[];
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
