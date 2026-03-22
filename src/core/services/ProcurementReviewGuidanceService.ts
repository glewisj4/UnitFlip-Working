import { ProcurementDraftItem, ProcurementReviewGuidance } from '../models/procurement';

const createGuidance = (
  code: ProcurementReviewGuidance['code'],
  title: string,
  detail: string,
  source: ProcurementReviewGuidance['source']
): ProcurementReviewGuidance => ({
  code,
  title,
  detail,
  source,
});

export const ProcurementReviewGuidanceService = {
  buildForDraftItem(item: ProcurementDraftItem): ProcurementReviewGuidance[] {
    const guidance: ProcurementReviewGuidance[] = [];

    if (item.selectedMatch && ['loose', 'manual'].includes(item.selectedMatch.confidenceBand)) {
      guidance.push(
        createGuidance(
          'low_confidence_match',
          'Review recommended: low confidence match',
          `${item.itemDescription} is using a ${item.selectedMatch.confidenceBand} confidence match.`,
          'match'
        )
      );
    }

    if (
      (item.selectedMatch && typeof item.selectedMatch.price !== 'number') ||
      (item.vendorIntelligence?.selectedOffer && typeof item.vendorIntelligence.selectedOffer.price !== 'number')
    ) {
      guidance.push(
        createGuidance(
          'missing_pricing',
          'Review recommended: pricing is incomplete',
          `${item.itemDescription} does not have complete pricing on the selected match or vendor offer.`,
          'vendor'
        )
      );
    }

    if (item.vendorIntelligence?.selectedOffer?.freshnessLabel === 'Stale') {
      guidance.push(
        createGuidance(
          'stale_vendor_data',
          'Review recommended: vendor data is stale',
          `${item.itemDescription} is using vendor data marked as stale.`,
          'vendor'
        )
      );
    }

    if (
      item.vendorIntelligence?.riskSignals.includes('no_offer') ||
      item.vendorIntelligence?.riskSignals.includes('unmatched_requirement')
    ) {
      guidance.push(
        createGuidance(
          'no_offer_available',
          'Review recommended: no offer available',
          `${item.itemDescription} does not currently have a selected vendor offer for procurement.`,
          'vendor'
        )
      );
    }

    if (item.optimization?.signals.includes('overbuy_risk')) {
      guidance.push(
        createGuidance(
          'overbuy_risk',
          'Review recommended: overbuy risk',
          `${item.itemDescription} has projected overbuy risk in the current pack recommendation.`,
          'optimization'
        )
      );
    }

    if (item.vendorIntelligence?.riskSignals.includes('cheaper_alternative')) {
      const alternative = item.vendorIntelligence.cheapestAlternative;
      guidance.push(
        createGuidance(
          'cheaper_alternative_available',
          'Review recommended: cheaper alternative available',
          `${item.itemDescription} has a lower-cost alternative${alternative?.optionName ? ` (${alternative.optionName})` : ''}.`,
          'vendor'
        )
      );
    }

    if (item.vendorIntelligence?.riskSignals.includes('bundle_opportunity') && item.vendorIntelligence.bundleSuggestion) {
      guidance.push(
        createGuidance(
          'bundle_review',
          'Review recommended: bundle opportunity',
          `${item.itemDescription} may benefit from bundling with ${item.vendorIntelligence.bundleSuggestion.triggerName}.`,
          'vendor'
        )
      );
    }

    return guidance;
  },
};
