import { CatalogItem, ProductOption, Tier } from '../models/types';
import { Inspection } from '../models/inspections';
import {
  ProcurementProductResolutionMethod,
  ResolvedProcurementBundle,
  ResolvedProcurementProductRecommendation,
} from '../models/procurement';
import { GeneratedInspectionItem, TurnoverPresetProductTier } from '../models/templates';
import { CatalogService } from './CatalogService';
import { ProcurementOptimizationService } from './ProcurementOptimizationService';

type ResolutionMatchType = Exclude<ProcurementProductResolutionMethod, 'manual_needed'>;

type BundleSourceContext = {
  generatedItems: GeneratedInspectionItem[];
  preferredTier?: TurnoverPresetProductTier;
  preferredReplaceOption?: string;
};

type ScoredCatalogMatch = {
  item: CatalogItem;
  option: ProductOption;
  score: number;
  matchType: ResolutionMatchType;
  reasons: string[];
};

const normalize = (value?: string | null) =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (...values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .flatMap((value) => normalize(value).split(/\s+/))
        .map((token) => token.trim())
        .filter((token) => token.length > 1)
    )
  );

const flattenInspectionItems = (inspection?: Inspection | null): GeneratedInspectionItem[] =>
  inspection?.generatedSections?.flatMap((section) => section.items) ||
  inspection?.generatedItems ||
  [];

const createFallbackOption = (item: CatalogItem): ProductOption => ({
  id: `fallback:${item.id}`,
  name: item.title || item.name,
  price: item.defaultPrice ?? item.actualCost ?? 0,
  sku: item.itemNumber || item.id,
  tier: item.defaultTier || Tier.STANDARD,
  brand: item.vendor || item.brand,
  modelNumber: item.modelNumber,
});

const getCatalogOptions = (item: CatalogItem): ProductOption[] =>
  item.options && item.options.length > 0 ? item.options : [createFallbackOption(item)];

const LOWES_CATEGORY_ALIASES: Record<string, string[]> = {
  'paint & drywall': ['paint', 'drywall', 'patch', 'primer', 'joint compound', 'caulk'],
  'blinds & window shades': ['blinds', 'window coverings', 'shade', 'mounting hardware'],
  'bathroom fixtures': ['bathroom', 'faucet', 'toilet', 'shower', 'sink', 'fixture'],
  'bathroom accessories': ['bath accessory', 'bath hardware', 'towel bar', 'toilet paper holder'],
  electrical: ['outlet', 'switch', 'cover plate', 'faceplate', 'device cover', 'lighting'],
  flooring: ['lvp', 'vinyl plank', 'carpet', 'pad', 'underlayment', 'transition'],
  'doors & windows': ['door hardware', 'passage knob', 'lever', 'lockset', 'door accessory'],
};

const FALLBACK_CATEGORY_ALIASES: Record<string, string[]> = {
  paint: ['paint & drywall', 'interior finishes', 'paint'],
  window_coverings: ['blinds & window shades', 'windows & coverings'],
  bathroom: ['bathroom fixtures', 'bathroom accessories', 'bath fans', 'toilets', 'bathroom sinks', 'bathtubs & showers'],
  electrical: ['electrical', 'electrical & lighting', 'switches & outlets'],
  flooring: ['flooring'],
  finish: ['doors & windows', 'hardware'],
};

const METHOD_CONFIDENCE: Record<ResolutionMatchType, ResolvedProcurementProductRecommendation['confidenceBand']> = {
  exact_category: 'exact',
  alias: 'close',
  fallback_category: 'loose',
};

const PRESET_TIER_TO_CATALOG: Record<TurnoverPresetProductTier, Tier> = {
  high: Tier.PREMIUM,
  mid: Tier.STANDARD,
  low: Tier.BUDGET,
};

const collectCatalogCategoryTokens = (item: CatalogItem): string[] =>
  tokenize(
    item.title,
    item.name,
    item.categoryName,
    item.category,
    item.topLevelCategory,
    item.subcategory,
    ...(item.tags || []),
    ...(item.functionalTags || [])
  );

const matchesExactCategory = (item: CatalogItem, lowesCategory?: string) => {
  const target = normalize(lowesCategory);
  if (!target) return false;
  const fields = [
    item.categoryName,
    item.category,
    item.topLevelCategory,
    item.subcategory,
  ]
    .map((value) => normalize(value))
    .filter(Boolean);
  return fields.some((value) => value === target);
};

const matchesAliasCategory = (item: CatalogItem, lineLabel: string, lowesCategory?: string) => {
  const targetCategory = normalize(lowesCategory);
  const aliases = new Set([
    ...(LOWES_CATEGORY_ALIASES[targetCategory] || []),
    ...tokenize(lineLabel, lowesCategory),
  ]);
  if (aliases.size === 0) return false;
  const itemTokens = new Set(collectCatalogCategoryTokens(item));
  return Array.from(aliases).some((alias) => itemTokens.has(normalize(alias)));
};

const matchesFallbackCategory = (item: CatalogItem, category: string) => {
  const aliases = FALLBACK_CATEGORY_ALIASES[normalize(category)] || [];
  if (aliases.length === 0) return false;
  const itemTokens = new Set(collectCatalogCategoryTokens(item));
  return aliases.some((alias) => itemTokens.has(normalize(alias)));
};

const getBundleSourceContext = (
  bundle: ResolvedProcurementBundle,
  inspectionMap: Map<string, Inspection>
): BundleSourceContext => {
  const inspection = inspectionMap.get(bundle.sourceInspectionId);
  const generatedItems = flattenInspectionItems(inspection).filter((item) =>
    bundle.sourceGeneratedItemIds.includes(item.id)
  );
  const preferredTier =
    generatedItems.find((item) => item.preferredProductTier)?.preferredProductTier ||
    bundle.preferredProductTier;
  const preferredReplaceOption = generatedItems.find((item) => item.preferredReplaceOption)?.preferredReplaceOption;
  return {
    generatedItems,
    preferredTier,
    preferredReplaceOption,
  };
};

const scoreTier = (item: CatalogItem, preferredTier?: TurnoverPresetProductTier) => {
  if (!preferredTier) return 0;
  const targetTier = PRESET_TIER_TO_CATALOG[preferredTier];
  const itemTier = item.defaultTier || item.options?.[0]?.tier;
  if (!itemTier) return 0;
  if (itemTier === targetTier) return 20;
  if (
    (targetTier === Tier.PREMIUM && itemTier === Tier.STANDARD) ||
    (targetTier === Tier.STANDARD && (itemTier === Tier.PREMIUM || itemTier === Tier.BUDGET)) ||
    (targetTier === Tier.BUDGET && itemTier === Tier.STANDARD)
  ) {
    return 10;
  }
  return 0;
};

const scoreReplacePreference = (item: CatalogItem, preferredReplaceOption?: string) => {
  if (!preferredReplaceOption) return 0;
  const haystack = normalize(
    `${item.title} ${item.name} ${item.description || ''} ${(item.tags || []).join(' ')} ${(item.functionalTags || []).join(' ')} ${item.equivalentGroup || ''}`
  );
  const tokens = tokenize(preferredReplaceOption);
  const overlap = tokens.filter((token) => haystack.includes(token)).length;
  return overlap * 6;
};

const buildAlternateReason = (
  candidate: ScoredCatalogMatch,
  primary: ScoredCatalogMatch
) => {
  if (candidate.item.equivalentGroup && candidate.item.equivalentGroup === primary.item.equivalentGroup) {
    return 'Equivalent group alternate';
  }
  if ((candidate.item.defaultTier || candidate.option.tier) !== (primary.item.defaultTier || primary.option.tier)) {
    return 'Different tier alternative';
  }
  return 'Same category fallback';
};

const buildLineRecommendation = (
  bundle: ResolvedProcurementBundle,
  line: ResolvedProcurementBundle['lines'][number],
  sourceContext: BundleSourceContext,
  catalogItems: CatalogItem[]
): ResolvedProcurementProductRecommendation => {
  const activeItems = catalogItems.filter((item) => item.isActive !== false);
  const scoredMatches: ScoredCatalogMatch[] = activeItems.flatMap((item) => {
    const matchType: ResolutionMatchType | null =
      matchesExactCategory(item, line.lowesCategory)
        ? 'exact_category'
        : matchesAliasCategory(item, line.label, line.lowesCategory)
          ? 'alias'
          : matchesFallbackCategory(item, line.category)
            ? 'fallback_category'
            : null;

    if (!matchType) {
      return [];
    }

    const baseScore =
      matchType === 'exact_category' ? 120 : matchType === 'alias' ? 85 : 55;
    const tierScore = scoreTier(item, sourceContext.preferredTier);
    const replacePreferenceScore = scoreReplacePreference(item, sourceContext.preferredReplaceOption);
    const scoredOptions = getCatalogOptions(item).map((option) => ({
      item,
      option,
      score:
        baseScore +
        tierScore +
        replacePreferenceScore +
        (typeof option.price === 'number' && option.price > 0 ? 4 : 0),
      matchType,
      reasons: [
        matchType === 'exact_category'
          ? `Exact category match on ${line.lowesCategory || line.category}.`
          : matchType === 'alias'
            ? `Alias match for ${line.label}.`
            : `Fallback category match for ${line.category}.`,
        sourceContext.preferredTier ? `Preferred tier: ${sourceContext.preferredTier}.` : '',
        sourceContext.preferredReplaceOption ? `Replace preference: ${sourceContext.preferredReplaceOption}.` : '',
      ].filter(Boolean),
    }));

    return scoredOptions;
  });

  scoredMatches.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return (left.option.price ?? Number.MAX_SAFE_INTEGER) - (right.option.price ?? Number.MAX_SAFE_INTEGER);
  });

  const primary = scoredMatches[0];
  if (!primary) {
    return {
      id: `${bundle.id}:${line.id}`,
      bundleId: bundle.id,
      bundleLabel: bundle.label,
      bundleLineId: line.id,
      bundleLineLabel: line.label,
      sourceInspectionId: bundle.sourceInspectionId,
      sourceGeneratedItemIds: bundle.sourceGeneratedItemIds,
      sourceRequirementIds: bundle.sourceRequirementIds,
      preferredProductTier: sourceContext.preferredTier,
      resolutionMethod: 'manual_needed',
      confidenceBand: 'manual',
      status: 'manual_needed',
      lowesCategory: line.lowesCategory,
      quantity: line.quantity,
      unit: line.lowesCategory || line.label,
      alternates: [],
      rationale: ['No safe catalog category match was found. Manual product review is required.'],
    };
  }

  const optimization =
    line.quantity && line.quantity > 0
      ? ProcurementOptimizationService.optimizeQuantity(
          line.quantity,
          primary.item.unit || 'ea',
          getCatalogOptions(primary.item).map((option) => ({
            catalogItemId: primary.item.id,
            catalogItemName: primary.item.name,
            optionId: option.id,
            optionName: option.name,
            unit: primary.item.unit || 'ea',
            price: option.price,
          })),
          [
            `Bundle line: ${line.label}.`,
            `Bundle source: ${bundle.label}.`,
          ]
        )
      : undefined;

  const alternates = scoredMatches
    .filter((candidate) => candidate.item.id !== primary.item.id)
    .reduce<typeof scoredMatches>((accumulator, candidate) => {
      if (accumulator.some((entry) => entry.item.id === candidate.item.id)) {
        return accumulator;
      }
      if (accumulator.length >= 3) {
        return accumulator;
      }
      accumulator.push(candidate);
      return accumulator;
    }, [])
    .map((candidate) => ({
      productId: candidate.item.id,
      productLabel: candidate.item.title || candidate.item.name,
      optionId: candidate.option.id,
      optionLabel: candidate.option.name,
      sku: candidate.option.sku,
      vendor: candidate.option.brand || candidate.item.vendor,
      price: candidate.option.price,
      unit: candidate.item.unit || 'ea',
      reason: buildAlternateReason(candidate, primary),
    }));

  return {
    id: `${bundle.id}:${line.id}`,
    bundleId: bundle.id,
    bundleLabel: bundle.label,
    bundleLineId: line.id,
    bundleLineLabel: line.label,
    sourceInspectionId: bundle.sourceInspectionId,
    sourceGeneratedItemIds: bundle.sourceGeneratedItemIds,
    sourceRequirementIds: bundle.sourceRequirementIds,
    preferredProductTier: sourceContext.preferredTier,
    resolutionMethod: primary.matchType,
    confidenceBand: METHOD_CONFIDENCE[primary.matchType],
    status: 'resolved',
    lowesCategory: line.lowesCategory,
    recommendedProductId: primary.item.id,
    recommendedProductLabel: primary.item.title || primary.item.name,
    recommendedOptionId: primary.option.id,
    recommendedOptionLabel: primary.option.name,
    recommendedSku: primary.option.sku,
    recommendedVendor: primary.option.brand || primary.item.vendor,
    quantity: line.quantity,
    unit: primary.item.unit || 'ea',
    estimatedUnitPrice: primary.option.price ?? primary.item.defaultPrice,
    estimatedLineCost:
      optimization?.estimatedTotalCost ??
      (typeof primary.option.price === 'number' && typeof line.quantity === 'number'
        ? primary.option.price * line.quantity
        : undefined),
    optimization,
    alternates,
    rationale: primary.reasons,
  };
};

export const ProcurementProductResolutionService = {
  async resolveForBundles(params: {
    orgId: string;
    bundles: ResolvedProcurementBundle[];
    inspections?: Inspection[];
  }): Promise<ResolvedProcurementProductRecommendation[]> {
    const catalogItems = await CatalogService.getItems(params.orgId);
    return this.resolveForBundlesFromCatalog({
      catalogItems,
      bundles: params.bundles,
      inspections: params.inspections,
    });
  },

  resolveForBundlesFromCatalog(params: {
    catalogItems: CatalogItem[];
    bundles: ResolvedProcurementBundle[];
    inspections?: Inspection[];
  }): ResolvedProcurementProductRecommendation[] {
    if (!params.bundles.length || !params.catalogItems.length) {
      return [];
    }

    const inspectionMap = new Map((params.inspections || []).map((inspection) => [inspection.id, inspection]));
    return params.bundles.flatMap((bundle) => {
      const sourceContext = getBundleSourceContext(bundle, inspectionMap);
      return bundle.lines.map((line) =>
        buildLineRecommendation(bundle, line, sourceContext, params.catalogItems)
      );
    });
  },
};
