import { CatalogItem, Tier } from '../models/types';

export type CatalogReviewSignalCode =
  | 'low_confidence_import'
  | 'weak_category_assignment'
  | 'missing_tier_coverage'
  | 'price_inversion'
  | 'duplicate_like_row'
  | 'missing_lowes_source_fields'
  | 'mixed_group_confidence';

export interface CatalogReviewSignal {
  code: CatalogReviewSignalCode;
  label: string;
  severity: 'warning' | 'error';
  scope: 'item' | 'group';
  message: string;
}

export interface CatalogReviewItemInsight {
  itemId: string;
  groupKey?: string;
  groupLabel?: string;
  isFlagged: boolean;
  signals: CatalogReviewSignal[];
  severityScore: number;
  primarySignalCode?: CatalogReviewSignalCode;
}

export interface CatalogReviewGroupInsight {
  groupKey: string;
  groupLabel: string;
  archetypeId?: string;
  itemIds: string[];
  importItemIds: string[];
  tiersPresent: Array<'budget' | 'standard' | 'premium'>;
  missingTiers: Array<'budget' | 'standard' | 'premium'>;
  isFlagged: boolean;
  signals: CatalogReviewSignal[];
  severityScore: number;
  primarySignalCode?: CatalogReviewSignalCode;
  completionState: 'clean' | 'needs_review' | 'partially_resolved' | 'blocked';
  remainingIssueCount: number;
  remainingRowCount: number;
  completionMessage: string;
}

export interface CatalogReviewIntelligenceResult {
  flaggedItemIds: string[];
  flaggedGroupKeys: string[];
  itemInsights: Map<string, CatalogReviewItemInsight>;
  groupInsights: Map<string, CatalogReviewGroupInsight>;
  totals: {
    flaggedItems: number;
    flaggedGroups: number;
    lowConfidenceItems: number;
    weakCategoryItems: number;
    missingTierGroups: number;
    priceInversionGroups: number;
    duplicateLikeItems: number;
    missingSourceItems: number;
  };
}

const normalize = (value?: string | null) =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tierToKey = (tier?: Tier): 'budget' | 'standard' | 'premium' => {
  if (tier === Tier.BUDGET) return 'budget';
  if (tier === Tier.PREMIUM) return 'premium';
  return 'standard';
};

const uniqueSignals = (signals: CatalogReviewSignal[]) => {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.code}|${signal.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getSignalSeverityWeight = (signal: CatalogReviewSignal) => {
  const base = signal.severity === 'error' ? 100 : 50;
  switch (signal.code) {
    case 'price_inversion':
      return base + 40;
    case 'missing_tier_coverage':
      return base + 30;
    case 'duplicate_like_row':
      return base + 20;
    case 'missing_lowes_source_fields':
      return base + 15;
    case 'weak_category_assignment':
      return base + 10;
    case 'low_confidence_import':
      return base + 5;
    case 'mixed_group_confidence':
      return base;
    default:
      return base;
  }
};

const getPrimarySignal = (signals: CatalogReviewSignal[]) =>
  [...signals].sort((left, right) => getSignalSeverityWeight(right) - getSignalSeverityWeight(left))[0];

const getSeverityScore = (signals: CatalogReviewSignal[]) =>
  signals.reduce((total, signal) => total + getSignalSeverityWeight(signal), 0);

const buildCompletionSummary = (
  groupSignals: CatalogReviewSignal[],
  itemSignals: CatalogReviewSignal[][],
) => {
  const isBlockingSignalCode = (
    code: CatalogReviewSignalCode,
  ): code is 'missing_tier_coverage' | 'price_inversion' | 'duplicate_like_row' =>
    code === 'price_inversion' ||
    code === 'missing_tier_coverage' ||
    code === 'duplicate_like_row';

  const itemLevelSignals = itemSignals.flat();
  const remainingIssueCount = groupSignals.length + itemLevelSignals.length;
  const remainingRowCount = itemSignals.filter((signals) => signals.length > 0).length;
  const blockingSignalCodes = new Set<
    'missing_tier_coverage' | 'price_inversion' | 'duplicate_like_row'
  >(
    groupSignals.map((signal) => signal.code).filter(isBlockingSignalCode),
  );

  if (remainingIssueCount === 0) {
    return {
      completionState: 'clean' as const,
      remainingIssueCount: 0,
      remainingRowCount: 0,
      completionMessage: 'This archetype group is clean and ready.',
    };
  }

  if (blockingSignalCodes.size > 0) {
    const primaryBlocker = groupSignals.find((signal) =>
      isBlockingSignalCode(signal.code) && blockingSignalCodes.has(signal.code),
    );
    return {
      completionState: 'blocked' as const,
      remainingIssueCount,
      remainingRowCount,
      completionMessage:
        remainingIssueCount === 1
          ? `${primaryBlocker?.label || 'A group issue'} still blocks completion.`
          : `${blockingSignalCodes.size} blocking group issues still need attention.`,
    };
  }

  if (remainingIssueCount === 1 || remainingRowCount === 1) {
    const remainingSignal = groupSignals[0] || itemLevelSignals[0];
    return {
      completionState: 'partially_resolved' as const,
      remainingIssueCount,
      remainingRowCount,
      completionMessage: `${
        remainingSignal?.label || 'One issue'
      } is the last remaining issue in this group.`,
    };
  }

  return {
    completionState: 'needs_review' as const,
    remainingIssueCount,
    remainingRowCount,
    completionMessage:
      remainingRowCount > 0
        ? `${remainingRowCount} rows still need review before this group is clean.`
        : `${remainingIssueCount} group review issues still need attention.`,
  };
};

export class CatalogReviewIntelligenceService {
  static analyze(items: CatalogItem[]): CatalogReviewIntelligenceResult {
    const itemSignals = new Map<string, CatalogReviewSignal[]>();
    const groupInsights = new Map<string, CatalogReviewGroupInsight>();

    const importedItems = items.filter((item) => item.importSource && item.importSource !== 'manual');
    const groupedImports = new Map<string, CatalogItem[]>();

    importedItems.forEach((item) => {
      const groupKey = item.archetypeId || item.equivalentGroup || '';
      if (!groupKey) return;
      const existing = groupedImports.get(groupKey) || [];
      existing.push(item);
      groupedImports.set(groupKey, existing);
    });

    items.forEach((item) => {
      const signals: CatalogReviewSignal[] = [];
      const confidence = item.categoryAssignment?.confidence ?? 0;
      const weakCategory =
        !item.categoryId ||
        Boolean(item.categoryAssignment?.needsReview) ||
        item.categoryAssignment?.assignmentMethod === 'fallback_uncategorized';

      if (item.importSource && item.importSource !== 'manual' && confidence > 0 && confidence < 0.75) {
        signals.push({
          code: 'low_confidence_import',
          label: 'Low confidence',
          severity: 'warning',
          scope: 'item',
          message: `Imported assignment confidence is ${Math.round(confidence * 100)}%.`,
        });
      }

      if (weakCategory) {
        signals.push({
          code: 'weak_category_assignment',
          label: 'Category review',
          severity: 'warning',
          scope: 'item',
          message: item.categoryAssignment?.needsReview
            ? 'Category assignment is still marked for review.'
            : 'Category is missing or still uncategorized.',
        });
      }

      if (item.importSource === 'manual_lowes') {
        const missingBits = [
          !item.sourceRef ? 'Lowe’s URL' : null,
          !item.imageUrl && !item.options?.some((option) => option.imageUrl) ? 'image' : null,
          !item.vendor && !item.options?.[0]?.brand ? 'brand' : null,
        ].filter(Boolean) as string[];
        if (missingBits.length > 0) {
          signals.push({
            code: 'missing_lowes_source_fields',
            label: 'Missing Lowe’s fields',
            severity: 'warning',
            scope: 'item',
            message: `Manual Lowe’s import is missing ${missingBits.join(', ')}.`,
          });
        }
      }

      itemSignals.set(item.id, signals);
    });

    groupedImports.forEach((groupItems, groupKey) => {
      const signals: CatalogReviewSignal[] = [];
      const tiersPresent = Array.from(new Set(groupItems.map((item) => tierToKey(item.defaultTier))));
      const missingTiers = (['budget', 'standard', 'premium'] as const).filter(
        (tier) => !tiersPresent.includes(tier)
      );

      if (missingTiers.length > 0) {
        signals.push({
          code: 'missing_tier_coverage',
          label: 'Missing tiers',
          severity: 'warning',
          scope: 'group',
          message: `Missing ${missingTiers.join(', ')} tier coverage for this archetype group.`,
        });
      }

      const tierRows = new Map<'budget' | 'standard' | 'premium', CatalogItem[]>();
      groupItems.forEach((item) => {
        const tier = tierToKey(item.defaultTier);
        const rows = tierRows.get(tier) || [];
        rows.push(item);
        tierRows.set(tier, rows);
      });

      tierRows.forEach((rows, tier) => {
        const duplicateKeyCounts = new Map<string, number>();
        rows.forEach((item) => {
          const duplicateKey = `${normalize(item.title)}|${normalize(item.sourceRef)}|${normalize(item.vendor)}`;
          duplicateKeyCounts.set(duplicateKey, (duplicateKeyCounts.get(duplicateKey) || 0) + 1);
        });

        rows.forEach((item) => {
          const duplicateKey = `${normalize(item.title)}|${normalize(item.sourceRef)}|${normalize(item.vendor)}`;
          if ((duplicateKeyCounts.get(duplicateKey) || 0) > 1) {
            const rowSignals = itemSignals.get(item.id) || [];
            const duplicateSignal: CatalogReviewSignal = {
              code: 'duplicate_like_row',
              label: 'Duplicate-like row',
              severity: 'warning',
              scope: 'item',
              message: `Another ${tier} tier row in this archetype looks like the same product pick.`,
            };
            rowSignals.push(duplicateSignal);
            itemSignals.set(item.id, rowSignals);
          }
        });

        if (rows.length > 1) {
          signals.push({
            code: 'duplicate_like_row',
            label: 'Duplicate-like rows',
            severity: 'warning',
            scope: 'group',
            message: `This archetype has multiple ${tier} tier rows that need consolidation.`,
          });
        }
      });

      const budgetPrice = this.getTierPrice(tierRows.get('budget'));
      const standardPrice = this.getTierPrice(tierRows.get('standard'));
      const premiumPrice = this.getTierPrice(tierRows.get('premium'));

      if (
        budgetPrice != null &&
        standardPrice != null &&
        premiumPrice != null &&
        !(budgetPrice < standardPrice && standardPrice < premiumPrice)
      ) {
        signals.push({
          code: 'price_inversion',
          label: 'Price inversion',
          severity: 'error',
          scope: 'group',
          message: `Budget, standard, and premium prices are not increasing logically (${budgetPrice}, ${standardPrice}, ${premiumPrice}).`,
        });
      }

      const groupConfidences = groupItems
        .map((item) => item.categoryAssignment?.confidence)
        .filter((value): value is number => typeof value === 'number');
      if (
        groupConfidences.length >= 2 &&
        Math.max(...groupConfidences) - Math.min(...groupConfidences) >= 0.35
      ) {
        signals.push({
          code: 'mixed_group_confidence',
          label: 'Mixed confidence',
          severity: 'warning',
          scope: 'group',
          message: 'This archetype group has inconsistent confidence across sibling tiers.',
        });
      }

      const groupLabel =
        groupItems[0]?.archetypeId ||
        groupItems[0]?.equivalentGroup ||
        groupItems[0]?.title ||
        groupKey;
      const uniqueGroupSignals = uniqueSignals(signals);
      const groupItemSignals = groupItems.map((item) =>
        uniqueSignals(
          (itemSignals.get(item.id) || []).filter((signal) => signal.scope === 'item'),
        ),
      );
      const completionSummary = buildCompletionSummary(
        uniqueGroupSignals,
        groupItemSignals,
      );

      groupInsights.set(groupKey, {
        groupKey,
        groupLabel,
        archetypeId: groupItems[0]?.archetypeId || groupItems[0]?.equivalentGroup,
        itemIds: groupItems.map((item) => item.id),
        importItemIds: groupItems.map((item) => item.id),
        tiersPresent,
        missingTiers,
        isFlagged: uniqueGroupSignals.length > 0,
        signals: uniqueGroupSignals,
        severityScore: getSeverityScore(uniqueGroupSignals),
        primarySignalCode: getPrimarySignal(uniqueGroupSignals)?.code,
        completionState: completionSummary.completionState,
        remainingIssueCount: completionSummary.remainingIssueCount,
        remainingRowCount: completionSummary.remainingRowCount,
        completionMessage: completionSummary.completionMessage,
      });

      if (uniqueGroupSignals.length > 0) {
        groupItems.forEach((item) => {
          const rowSignals = itemSignals.get(item.id) || [];
          uniqueGroupSignals.forEach((signal) => {
            rowSignals.push({
              ...signal,
              scope: 'group',
            });
          });
          itemSignals.set(item.id, rowSignals);
        });
      }
    });

    const itemInsights = new Map<string, CatalogReviewItemInsight>();
    items.forEach((item) => {
      const groupKey = item.archetypeId || item.equivalentGroup || undefined;
      const group = groupKey ? groupInsights.get(groupKey) : undefined;
      const signals = uniqueSignals(itemSignals.get(item.id) || []);
      itemInsights.set(item.id, {
        itemId: item.id,
        groupKey,
        groupLabel: group?.groupLabel,
        isFlagged: signals.length > 0,
        signals,
        severityScore: getSeverityScore(signals),
        primarySignalCode: getPrimarySignal(signals)?.code,
      });
    });

    const flaggedItemIds = Array.from(itemInsights.values())
      .filter((entry) => entry.isFlagged)
      .map((entry) => entry.itemId);
    const flaggedGroupKeys = Array.from(groupInsights.values())
      .filter((entry) => entry.isFlagged)
      .map((entry) => entry.groupKey);

    return {
      flaggedItemIds,
      flaggedGroupKeys,
      itemInsights,
      groupInsights,
      totals: {
        flaggedItems: flaggedItemIds.length,
        flaggedGroups: flaggedGroupKeys.length,
        lowConfidenceItems: this.countSignals(itemInsights, 'low_confidence_import'),
        weakCategoryItems: this.countSignals(itemInsights, 'weak_category_assignment'),
        missingTierGroups: this.countGroupSignals(groupInsights, 'missing_tier_coverage'),
        priceInversionGroups: this.countGroupSignals(groupInsights, 'price_inversion'),
        duplicateLikeItems: this.countSignals(itemInsights, 'duplicate_like_row'),
        missingSourceItems: this.countSignals(itemInsights, 'missing_lowes_source_fields'),
      },
    };
  }

  private static getTierPrice(items?: CatalogItem[]) {
    if (!items || items.length === 0) return null;
    const candidate = items
      .map((item) => item.options?.[0]?.price ?? item.defaultPrice)
      .find((price): price is number => typeof price === 'number');
    return candidate ?? null;
  }

  private static countSignals(
    itemInsights: Map<string, CatalogReviewItemInsight>,
    code: CatalogReviewSignalCode
  ) {
    return Array.from(itemInsights.values()).filter((entry) => entry.signals.some((signal) => signal.code === code)).length;
  }

  private static countGroupSignals(
    groupInsights: Map<string, CatalogReviewGroupInsight>,
    code: CatalogReviewSignalCode
  ) {
    return Array.from(groupInsights.values()).filter((entry) => entry.signals.some((signal) => signal.code === code)).length;
  }
}
