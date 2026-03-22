import { ProcurementDraft, ProcurementPortfolioSummary } from '../models/procurement';

export const ProcurementPortfolioSummaryService = {
  buildFromDrafts(drafts: ProcurementDraft[]): ProcurementPortfolioSummary | undefined {
    if (drafts.length === 0) {
      return undefined;
    }

    return {
      draftCount: drafts.length,
      draftCountWithReviewNeeded: drafts.filter((draft) =>
        draft.items.some((item) => (item.reviewGuidance?.length || 0) > 0)
      ).length,
      optimizedItemCount: drafts.reduce(
        (sum, draft) => sum + draft.items.filter((item) => item.optimization).length,
        0
      ),
      estimatedOptimizedCost: drafts.reduce(
        (sum, draft) =>
          sum + draft.items.reduce((itemSum, item) => itemSum + (item.optimization?.estimatedTotalCost || 0), 0),
        0
      ),
      projectedWasteQuantity: drafts.reduce(
        (sum, draft) =>
          sum + draft.items.reduce((itemSum, item) => itemSum + (item.optimization?.estimatedWasteQuantity || 0), 0),
        0
      ),
      unmatchedOrNoOfferCount: drafts.reduce(
        (sum, draft) =>
          sum +
          draft.items.filter(
            (item) =>
              item.vendorIntelligence?.riskSignals.includes('no_offer') ||
              item.vendorIntelligence?.riskSignals.includes('unmatched_requirement')
          ).length,
        0
      ),
      draftCountWithStaleVendorData: drafts.filter((draft) =>
        draft.items.some((item) => item.vendorIntelligence?.selectedOffer?.freshnessLabel === 'Stale')
      ).length,
      draftCountWithBundleOpportunities: drafts.filter((draft) =>
        draft.items.some((item) => item.vendorIntelligence?.riskSignals.includes('bundle_opportunity'))
      ).length,
      draftCountWithCheaperAlternatives: drafts.filter((draft) =>
        draft.items.some((item) => item.vendorIntelligence?.riskSignals.includes('cheaper_alternative'))
      ).length,
    };
  },
};
