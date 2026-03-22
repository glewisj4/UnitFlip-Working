import { CatalogItem, ProductOption } from '../models/types';
import { MaterialRequirement } from '../models/operations';
import {
  MaterialMatchingPreference,
  MaterialRequirementMatchCandidate,
  SelectedProcurementOption,
} from '../models/procurement';
import { CatalogService } from './CatalogService';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { createPrefixedId } from '../../services/storage';

const PREFERENCE_KEY_PREFIX = 'unitflip_material_match_preferences_v1:';
const adapter = createLocalDbAdapter();

const TERM_ALIASES: Record<string, string[]> = {
  'interior paint': ['paint', 'wall paint', 'white interior paint', 'primer paint'],
  'outlet cover': ['cover plate', 'wall plate', 'switch plate', 'outlet plate'],
  caulk: ['sealant', 'kitchen bath sealant', 'bath sealant', 'silicone'],
  'trash bags': ['contractor bags', 'trash bag', 'contractor trash bags'],
  'joint compound': ['spackle', 'patch compound', 'drywall mud'],
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const expandAliases = (value: string): string[] => {
  const normalized = normalize(value);
  const expanded = [normalized];

  for (const [canonical, aliases] of Object.entries(TERM_ALIASES)) {
    const normalizedAliases = [canonical, ...aliases].map((alias) => normalize(alias));
    if (normalizedAliases.some((alias) => normalized.includes(alias))) {
      expanded.push(...normalizedAliases);
    }
  }

  return Array.from(new Set(expanded.filter(Boolean)));
};

const toTokens = (value: string): string[] =>
  expandAliases(value)
    .flatMap((entry) => entry.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

const intersectionSize = (left: string[], right: string[]) => {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
};

const buildRequirementText = (requirement: MaterialRequirement): string =>
  [
    requirement.itemDescription,
    requirement.category,
    requirement.notes || '',
    requirement.roomLabel || '',
  ]
    .filter(Boolean)
    .join(' ');

const getPreferenceKey = (requirement: MaterialRequirement): string =>
  `${normalize(requirement.category)}|${normalize(requirement.itemDescription)}`;

const getStoreKey = (orgId: string) => `${PREFERENCE_KEY_PREFIX}${orgId}`;

const confidenceBandFromScore = (score: number): MaterialRequirementMatchCandidate['confidenceBand'] => {
  if (score >= 90) return 'exact';
  if (score >= 70) return 'close';
  if (score >= 45) return 'loose';
  return 'manual';
};

const createCandidateFromOption = (
  item: CatalogItem,
  option: ProductOption,
  score: number,
  rationale: string[]
): MaterialRequirementMatchCandidate => ({
  catalogItemId: item.id,
  catalogItemName: item.name,
  optionId: option.id,
  optionName: option.name,
  category: item.categoryName || item.category,
  unit: item.unit,
  vendor: option.brand,
  sku: option.sku,
  modelNumber: option.modelNumber,
  price: option.price,
  confidenceScore: score,
  confidenceBand: confidenceBandFromScore(score),
  rationale,
});

const buildCandidateRationale = (params: {
  overlap: number;
  categoryMatch: boolean;
  unitMatch: boolean;
  preferenceBoost: boolean;
  currentSelectionBoost: boolean;
  optionOverlap: number;
}): string[] => {
  const rationale: string[] = [];

  if (params.overlap > 0) {
    rationale.push(`Keyword and alias overlap on ${params.overlap} term${params.overlap === 1 ? '' : 's'}`);
  }
  if (params.categoryMatch) {
    rationale.push('Category alignment');
  }
  if (params.unitMatch) {
    rationale.push('Unit compatibility');
  }
  if (params.preferenceBoost) {
    rationale.push('Previously selected match');
  }
  if (params.currentSelectionBoost) {
    rationale.push('Matches current requirement selection');
  }
  if (params.optionOverlap > 0) {
    rationale.push('Option label alignment');
  }
  if (rationale.length === 0) {
    rationale.push('Manual fallback candidate');
  }

  return rationale;
};

export const MaterialMatchingService = {
  async listPreferences(orgId: string): Promise<MaterialMatchingPreference[]> {
    return (await adapter.getItem<MaterialMatchingPreference[]>(getStoreKey(orgId))) || [];
  },

  async rememberSelection(orgId: string, requirement: MaterialRequirement, selected: SelectedProcurementOption): Promise<void> {
    const preferences = await this.listPreferences(orgId);
    const key = getPreferenceKey(requirement);
    const existing = preferences.find((preference) => preference.key === key);
    const now = Date.now();

    const nextPreference: MaterialMatchingPreference = existing
      ? {
          ...existing,
          catalogItemId: selected.catalogItemId,
          optionId: selected.optionId,
          updatedAt: now,
        }
      : {
          id: createPrefixedId('match_pref_'),
          orgId,
          key,
          catalogItemId: selected.catalogItemId,
          optionId: selected.optionId,
          createdAt: now,
          updatedAt: now,
        };

    const next = existing
      ? preferences.map((preference) => (preference.id === existing.id ? nextPreference : preference))
      : [...preferences, nextPreference];

    await adapter.setItem(getStoreKey(orgId), next);
  },

  async getCandidates(orgId: string, requirement: MaterialRequirement): Promise<MaterialRequirementMatchCandidate[]> {
    const [catalogItems, preferences] = await Promise.all([
      CatalogService.getItems(orgId),
      this.listPreferences(orgId),
    ]);
    const requirementTokens = toTokens(buildRequirementText(requirement));
    const requirementCategory = normalize(requirement.category);
    const preference = preferences.find((entry) => entry.key === getPreferenceKey(requirement));

    const candidates = catalogItems.flatMap((item) => {
      const itemTokens = toTokens(
        `${item.name} ${item.description || ''} ${item.categoryName || item.category || ''} ${(item.tags || []).join(' ')}`
      );
      const overlap = intersectionSize(requirementTokens, itemTokens);
      const titleSimilarity =
        requirementTokens.length === 0 ? 0 : Math.round((overlap / requirementTokens.length) * 60);
      const categoryMatch =
        normalize(item.categoryName || item.category || '').includes(requirementCategory) ||
        requirementCategory.includes(normalize(item.categoryName || item.category || ''))
          ? 20
          : 0;
      const unitMatch = normalize(item.unit) === normalize(requirement.unit) ? 10 : 0;
      const preferenceBoost = preference?.catalogItemId === item.id ? 20 : 0;
      const currentSelectionBoost =
        requirement.selectedMatch?.catalogItemId === item.id ? 12 : 0;
      const baseScore = Math.min(
        100,
        titleSimilarity + categoryMatch + unitMatch + preferenceBoost + currentSelectionBoost
      );

      return item.options.map((option) => {
        const optionTokens = toTokens(
          `${option.name} ${option.brand || ''} ${option.modelNumber || ''} ${option.sku || ''}`
        );
        const optionOverlap = intersectionSize(requirementTokens, optionTokens);
        const optionBonus = Math.min(15, optionOverlap * 6);
        const selectedOptionBoost =
          requirement.selectedMatch?.catalogItemId === item.id &&
          requirement.selectedMatch.optionId === option.id
            ? 10
            : 0;
        const score = Math.min(100, baseScore + optionBonus + selectedOptionBoost);

        if (score < 20) {
          return null;
        }

        const rationale = buildCandidateRationale({
          overlap,
          categoryMatch: categoryMatch > 0,
          unitMatch: unitMatch > 0,
          preferenceBoost: preferenceBoost > 0,
          currentSelectionBoost: currentSelectionBoost > 0 || selectedOptionBoost > 0,
          optionOverlap,
        });

        return createCandidateFromOption(item, option, score, rationale);
      });
    });

    return candidates
      .filter((candidate): candidate is MaterialRequirementMatchCandidate => Boolean(candidate))
      .sort((left, right) => {
        if (right.confidenceScore !== left.confidenceScore) {
          return right.confidenceScore - left.confidenceScore;
        }
        return (left.price || Number.MAX_SAFE_INTEGER) - (right.price || Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 5);
  },

  async validateSelectedCandidate(
    orgId: string,
    selected: SelectedProcurementOption
  ): Promise<SelectedProcurementOption> {
    const item = await CatalogService.getItem(orgId, selected.catalogItemId);
    if (!item) {
      throw new Error('The selected catalog item no longer exists.');
    }

    const option = item.options.find((entry) => entry.id === selected.optionId) || item.options[0];
    if (!option) {
      throw new Error('The selected product option is no longer available.');
    }

    return {
      ...selected,
      catalogItemName: item.name,
      optionId: option.id,
      optionName: option.name,
      category: item.categoryName || item.category,
      unit: item.unit,
      vendor: option.brand,
      sku: option.sku,
      modelNumber: option.modelNumber,
      price: option.price,
    };
  },
};
