import { InspectionCaptureDraft } from './InspectionCaptureParserService';
import { CatalogItem } from '../models/types';

type RecommendationRule = {
  id: string;
  keywords: string[];
  topLevelCategory: string;
  subcategory?: string;
  functionalTags: string[];
  equivalentGroup?: string;
};

export interface ProductRecommendationContext {
  sourceType: 'finding' | 'task' | 'draft' | 'material_requirement';
  label: string;
  rawText?: string;
  notes?: string;
  kind?: InspectionCaptureDraft['kind'];
  roomLabel?: string;
  roomType?: string;
  category?: string;
  trade?: string;
  unitFavoriteProductIds?: string[];
}

export interface RecommendedProduct {
  item: CatalogItem;
  score: number;
  reasons: string[];
  matchedTags: string[];
  isFavorite: boolean;
}

export interface ProductRecommendationResult {
  suggestedProducts: RecommendedProduct[];
  alternateProducts: RecommendedProduct[];
  inferredTopLevelCategory?: string;
  inferredSubcategory?: string;
  inferredEquivalentGroup?: string;
  inferredFunctionalTags: string[];
  noMatchReason?: string;
}

const RULES: RecommendationRule[] = [
  {
    id: 'replace_faucet',
    keywords: ['faucet', 'sink fixture', 'bathroom sink'],
    topLevelCategory: 'Plumbing',
    subcategory: 'Faucets & Fixtures',
    functionalTags: ['task:replace_faucet'],
    equivalentGroup: 'bathroom_sink_faucet_standard',
  },
  {
    id: 'replace_outlet',
    keywords: ['outlet', 'receptacle', 'socket'],
    topLevelCategory: 'Electrical & Lighting',
    subcategory: 'Switches & Outlets',
    functionalTags: ['task:replace_outlet'],
    equivalentGroup: 'duplex_outlet_standard_white',
  },
  {
    id: 'install_blinds',
    keywords: ['blind', 'blinds', 'shade', 'window covering'],
    topLevelCategory: 'Windows & Coverings',
    subcategory: 'Blinds & Shades',
    functionalTags: ['task:install_blinds'],
    equivalentGroup: 'blind_white_35x64_standard',
  },
  {
    id: 'replace_detector_battery',
    keywords: ['smoke detector', 'smoke alarm', 'detector battery', 'alarm battery'],
    topLevelCategory: 'Electrical & Lighting',
    subcategory: 'Bulbs & Drivers',
    functionalTags: ['task:replace_detector_battery'],
    equivalentGroup: 'smoke_detector_standard_battery',
  },
  {
    id: 'paint_touchup',
    keywords: ['paint', 'touch up', 'touch-up', 'scuff', 'wall touchup'],
    topLevelCategory: 'Interior Finishes',
    subcategory: 'Paint & Primers',
    functionalTags: ['task:paint_touchup'],
    equivalentGroup: 'interior_wall_paint_touchup_neutral',
  },
  {
    id: 'patch_drywall',
    keywords: ['drywall', 'patch', 'wall hole', 'wall damage'],
    topLevelCategory: 'Interior Finishes',
    subcategory: 'Wall Repair',
    functionalTags: ['task:patch_drywall'],
    equivalentGroup: 'drywall_patch_standard',
  },
  {
    id: 'replace_filter',
    keywords: ['air filter', 'hvac filter', 'filter'],
    topLevelCategory: 'Appliances',
    subcategory: 'Small Replacement Parts',
    functionalTags: ['task:replace_filter'],
    equivalentGroup: 'hvac_filter_standard',
  },
];

const ROOM_TAG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\bbath(room)?\b/i, tag: 'room:bathroom' },
  { pattern: /\bkitchen\b/i, tag: 'room:kitchen' },
  { pattern: /\bbed(room)?\b/i, tag: 'room:bedroom' },
  { pattern: /\bliving\b/i, tag: 'room:living_room' },
  { pattern: /\bhall\b/i, tag: 'room:hallway' },
];

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const normalize = (value?: string) => (value || '').trim().toLowerCase();

const includesKeyword = (text: string, keyword: string) => text.includes(keyword.toLowerCase());

const buildReasonList = (params: {
  item: CatalogItem;
  matchedTags: string[];
  favorite: boolean;
  inferredEquivalentGroup?: string;
  inferredTopLevelCategory?: string;
  inferredSubcategory?: string;
  roomTags: string[];
}): string[] => {
  const reasons: string[] = [];

  if (params.favorite) {
    reasons.push('Favorite for this unit');
  }

  if (params.inferredEquivalentGroup && params.item.equivalentGroup === params.inferredEquivalentGroup) {
    reasons.push(`Same alternate group: ${params.inferredEquivalentGroup}`);
  }

  params.matchedTags.forEach((tag) => {
    reasons.push(`Matched tag: ${tag}`);
  });

  if (params.inferredSubcategory && params.item.subcategory === params.inferredSubcategory) {
    reasons.push(`Matches subcategory: ${params.inferredSubcategory}`);
  } else if (params.inferredTopLevelCategory && params.item.topLevelCategory === params.inferredTopLevelCategory) {
    reasons.push(`Matches category: ${params.inferredTopLevelCategory}`);
  }

  const matchedRoomTag = params.roomTags.find((tag) => params.item.functionalTags?.includes(tag));
  if (matchedRoomTag) {
    reasons.push(`Matches ${matchedRoomTag.replace('room:', '').replace(/_/g, ' ')}`);
  }

  return unique(reasons).slice(0, 3);
};

export class ProductRecommendationService {
  static recommendProducts(
    catalogItems: CatalogItem[],
    context: ProductRecommendationContext
  ): ProductRecommendationResult {
    const sourceText = normalize(
      [
        context.label,
        context.rawText,
        context.notes,
        context.category,
        context.trade,
        context.roomLabel,
        context.roomType,
      ]
        .filter(Boolean)
        .join(' ')
    );

    const matchedRule =
      RULES.find((rule) => rule.keywords.some((keyword) => includesKeyword(sourceText, keyword))) ||
      (context.trade
        ? RULES.find((rule) => rule.functionalTags.some((tag) => normalize(tag).includes(normalize(context.trade))))
        : undefined);

    const roomTags = ROOM_TAG_PATTERNS.filter(
      ({ pattern }) => pattern.test(context.roomLabel || '') || pattern.test(context.roomType || '') || pattern.test(sourceText)
    ).map(({ tag }) => tag);

    const inferredFunctionalTags = unique([...(matchedRule?.functionalTags || []), ...roomTags]);
    const inferredTopLevelCategory = matchedRule?.topLevelCategory;
    const inferredSubcategory = matchedRule?.subcategory;
    const inferredEquivalentGroup = matchedRule?.equivalentGroup;
    const favoriteIds = new Set(context.unitFavoriteProductIds || []);

    const scored = catalogItems
      .map((item) => {
        let score = 0;
        const matchedTags = (item.functionalTags || []).filter((tag) => inferredFunctionalTags.includes(tag));
        const favorite = favoriteIds.has(item.id);
        const hasEquivalentGroupMatch = Boolean(inferredEquivalentGroup && item.equivalentGroup === inferredEquivalentGroup);
        const hasSubcategoryMatch = Boolean(inferredSubcategory && item.subcategory === inferredSubcategory);
        const hasTopLevelCategoryMatch = Boolean(inferredTopLevelCategory && item.topLevelCategory === inferredTopLevelCategory);
        const hasRoomMatch = roomTags.some((tag) => item.functionalTags?.includes(tag));
        const relevanceSignalCount =
          (hasEquivalentGroupMatch ? 1 : 0) +
          (hasSubcategoryMatch ? 1 : 0) +
          (hasTopLevelCategoryMatch ? 1 : 0) +
          (matchedTags.length > 0 ? 1 : 0) +
          (hasRoomMatch ? 1 : 0);

        if (favorite) score += 45;
        if (hasEquivalentGroupMatch) score += 80;
        if (hasSubcategoryMatch) score += 25;
        if (hasTopLevelCategoryMatch) score += 15;
        score += matchedTags.length * 18;
        if (hasRoomMatch) score += 8;
        if (context.kind === 'replace' && item.functionalTags?.some((tag) => tag.startsWith('task:replace_'))) score += 4;
        if (context.kind === 'repair' && item.functionalTags?.some((tag) => tag.startsWith('task:'))) score += 2;

        const reasons = buildReasonList({
          item,
          matchedTags,
          favorite,
          inferredEquivalentGroup,
          inferredTopLevelCategory,
          inferredSubcategory,
          roomTags,
        });

        return {
          item,
          score,
          matchedTags,
          reasons,
          isFavorite: favorite,
          relevanceSignalCount,
        };
      })
      .filter((entry) => entry.score > 0 && entry.relevanceSignalCount > 0)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

    const suggestedProducts = scored.reduce<RecommendedProduct[]>((accumulator, entry) => {
      const groupKey = entry.item.equivalentGroup || `item:${entry.item.id}`;
      if (accumulator.some((existing) => (existing.item.equivalentGroup || `item:${existing.item.id}`) === groupKey)) {
        return accumulator;
      }
      if (accumulator.length >= 4) {
        return accumulator;
      }
      accumulator.push(entry);
      return accumulator;
    }, []);
    const primaryEquivalentGroup =
      inferredEquivalentGroup || suggestedProducts.find((entry) => entry.item.equivalentGroup)?.item.equivalentGroup;

    const alternateProducts = primaryEquivalentGroup
      ? scored
          .filter(
            (entry) =>
              entry.item.equivalentGroup === primaryEquivalentGroup &&
              !suggestedProducts.some((suggested) => suggested.item.id === entry.item.id)
          )
          .slice(0, 4)
      : [];

    return {
      suggestedProducts,
      alternateProducts,
      inferredTopLevelCategory,
      inferredSubcategory,
      inferredEquivalentGroup,
      inferredFunctionalTags,
      noMatchReason:
        suggestedProducts.length === 0
          ? 'No catalog products matched this finding yet. Import or quick-add a product for this task and it can be recommended next time.'
          : undefined,
    };
  }
}
