import { CatalogItem } from '../models/types';
import { MaterialRequirement } from '../models/operations';
import {
  MaterialRequirementMatchCandidate,
  ProcurementBundleSuggestionSummary,
  ProcurementOfferFreshnessLabel,
  ProcurementVendorIntelligence,
  ProcurementVendorOfferInsight,
  ProcurementVendorRiskSignal,
} from '../models/procurement';
import { BundleRuleService } from './BundleRuleService';
import { CatalogService } from './CatalogService';

const getFreshnessLabel = (updatedAt: number): ProcurementOfferFreshnessLabel => {
  const ageDays = Math.floor((Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) return 'Fresh';
  if (ageDays <= 30) return 'Recent';
  return 'Stale';
};

const createOfferInsight = (
  candidate: MaterialRequirementMatchCandidate,
  item: CatalogItem | undefined
): ProcurementVendorOfferInsight => ({
  catalogItemId: candidate.catalogItemId,
  catalogItemName: candidate.catalogItemName,
  optionId: candidate.optionId,
  optionName: candidate.optionName,
  vendor: candidate.vendor,
  price: candidate.price,
  unit: candidate.unit,
  confidenceScore: candidate.confidenceScore,
  confidenceBand: candidate.confidenceBand,
  freshnessLabel: getFreshnessLabel(item?.updatedAt || 0),
  rationale: candidate.rationale,
});

const buildBundleSuggestion = async (
  orgId: string,
  matchedItem: CatalogItem | undefined
): Promise<ProcurementBundleSuggestionSummary | undefined> => {
  if (!matchedItem) {
    return undefined;
  }

  const rule = await BundleRuleService.getRuleByTrigger(orgId, matchedItem.id);
  if (!rule) {
    return undefined;
  }

  return {
    triggerCatalogItemId: matchedItem.id,
    triggerName: matchedItem.name,
    companionCount: rule.companions.length,
  };
};

export const ProcurementVendorIntelligenceService = {
  async buildForRequirement(
    orgId: string,
    requirement: MaterialRequirement,
    candidates: MaterialRequirementMatchCandidate[]
  ): Promise<ProcurementVendorIntelligence> {
    if (candidates.length === 0) {
      return {
        riskSignals: ['no_offer', 'unmatched_requirement'],
        reviewNeeded: true,
      };
    }

    const catalogItems = await CatalogService.getItems(orgId);
    const itemById = new Map(catalogItems.map((item) => [item.id, item]));

    const selectedCandidate =
      candidates.find(
        (candidate) =>
          candidate.catalogItemId === requirement.selectedMatch?.catalogItemId &&
          candidate.optionId === requirement.selectedMatch?.optionId
      ) || candidates[0];

    const selectedItem = itemById.get(selectedCandidate.catalogItemId);
    const selectedOffer = createOfferInsight(selectedCandidate, selectedItem);
    const bundleSuggestion = await buildBundleSuggestion(orgId, selectedItem);

    const cheaperAlternative = candidates.find((candidate) => {
      if (candidate.catalogItemId === selectedCandidate.catalogItemId && candidate.optionId === selectedCandidate.optionId) {
        return false;
      }
      if (typeof candidate.price !== 'number' || typeof selectedCandidate.price !== 'number') {
        return false;
      }
      return candidate.price < selectedCandidate.price;
    });

    const riskSignals: ProcurementVendorRiskSignal[] = [];
    if (!requirement.selectedMatch) {
      riskSignals.push('unmatched_requirement');
    }
    if (selectedOffer.freshnessLabel === 'Stale') {
      riskSignals.push('stale_price');
    }
    if (cheaperAlternative) {
      riskSignals.push('cheaper_alternative');
    }
    if (bundleSuggestion) {
      riskSignals.push('bundle_opportunity');
    }

    return {
      matchedCatalogItemName: selectedItem?.name || selectedCandidate.catalogItemName,
      selectedOffer,
      cheapestAlternative: cheaperAlternative
        ? {
            optionName: cheaperAlternative.optionName,
            price: cheaperAlternative.price,
          }
        : undefined,
      bundleSuggestion,
      riskSignals,
      reviewNeeded:
        selectedOffer.confidenceBand === 'manual' ||
        riskSignals.includes('unmatched_requirement'),
    };
  },
};
