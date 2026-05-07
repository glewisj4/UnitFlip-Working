import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import {
  ProcurementDraft,
  ProcurementDraftPromotedLine,
  ProcurementDraftRecommendationAttachment,
  ProcurementDraftItem,
  ProcurementBundleId,
  ProcurementDraftRefreshSummary,
  ProcurementDraftStatus,
  ResolvedProcurementProductRecommendation,
} from '../models/procurement';
import { MaterialRequirement } from '../models/operations';
import { CatalogItem, ProductOption } from '../models/types';
import { createPrefixedId } from '../../services/storage';
import { CatalogService } from './CatalogService';
import { MaterialRequirementService } from './MaterialRequirementService';
import { MaterialMatchingService } from './MaterialMatchingService';
import { InspectionService } from './InspectionService';
import { ProcurementBundleService } from './ProcurementBundleService';
import { ProcurementOptimizationService } from './ProcurementOptimizationService';
import { ProcurementProductResolutionService } from './ProcurementProductResolutionService';
import { ProcurementReviewGuidanceService } from './ProcurementReviewGuidanceService';
import { ProcurementVendorIntelligenceService } from './ProcurementVendorIntelligenceService';

const STORAGE_KEY_PREFIX = 'unitflip_procurement_drafts_v1:';
const adapter = createLocalDbAdapter();

const getStoreKey = (orgId: string) => `${STORAGE_KEY_PREFIX}${orgId}`;

const stableSerialize = (value: unknown): string => JSON.stringify(value);

const getOptimizationFingerprint = (item: ProcurementDraftItem): string =>
  stableSerialize({
    estimatedCoverageQuantity: item.optimization?.estimatedCoverageQuantity || 0,
    estimatedWasteQuantity: item.optimization?.estimatedWasteQuantity || 0,
    estimatedTotalCost: item.optimization?.estimatedTotalCost || 0,
    signals: [...(item.optimization?.signals || [])].sort(),
    recommendedPacks: (item.optimization?.recommendedPacks || []).map((pack) => ({
      optionId: pack.optionId || '',
      optionName: pack.optionName,
      packQuantity: pack.packQuantity,
      packUnit: pack.packUnit,
      packCount: pack.packCount,
      unitPrice: pack.unitPrice,
      lineCost: pack.lineCost,
    })),
  });

const getVendorFingerprint = (item: ProcurementDraftItem): string =>
  stableSerialize({
    selectedOffer: item.vendorIntelligence?.selectedOffer
      ? {
          catalogItemId: item.vendorIntelligence.selectedOffer.catalogItemId,
          optionId: item.vendorIntelligence.selectedOffer.optionId || '',
          optionName: item.vendorIntelligence.selectedOffer.optionName,
          freshnessLabel: item.vendorIntelligence.selectedOffer.freshnessLabel,
          price: item.vendorIntelligence.selectedOffer.price ?? null,
          confidenceBand: item.vendorIntelligence.selectedOffer.confidenceBand,
        }
      : null,
    cheapestAlternative: item.vendorIntelligence?.cheapestAlternative || null,
    bundleSuggestion: item.vendorIntelligence?.bundleSuggestion || null,
    riskSignals: [...(item.vendorIntelligence?.riskSignals || [])].sort(),
  });

const getNoOfferFlag = (item: ProcurementDraftItem): boolean =>
  Boolean(
    item.vendorIntelligence?.riskSignals.includes('no_offer') ||
      item.vendorIntelligence?.riskSignals.includes('unmatched_requirement')
  );

const countGuidanceEntries = (items: ProcurementDraftItem[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const entry of item.reviewGuidance || []) {
      const key = `${item.id}:${entry.code}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
};

const buildRefreshSummary = (
  previousItems: ProcurementDraftItem[],
  refreshedItems: ProcurementDraftItem[]
): ProcurementDraftRefreshSummary => {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const previousGuidance = countGuidanceEntries(previousItems);
  const refreshedGuidance = countGuidanceEntries(refreshedItems);

  const optimizationChangedItemCount = refreshedItems.filter((item) => {
    const previous = previousById.get(item.id);
    return !previous || getOptimizationFingerprint(previous) !== getOptimizationFingerprint(item);
  }).length;

  const vendorChangedItemCount = refreshedItems.filter((item) => {
    const previous = previousById.get(item.id);
    return !previous || getVendorFingerprint(previous) !== getVendorFingerprint(item);
  }).length;

  let reviewGuidanceAddedCount = 0;
  for (const [key, count] of refreshedGuidance.entries()) {
    reviewGuidanceAddedCount += Math.max(0, count - (previousGuidance.get(key) || 0));
  }

  let reviewGuidanceRemovedCount = 0;
  for (const [key, count] of previousGuidance.entries()) {
    reviewGuidanceRemovedCount += Math.max(0, count - (refreshedGuidance.get(key) || 0));
  }

  const previousNoOfferCount = previousItems.filter(getNoOfferFlag).length;
  const refreshedNoOfferCount = refreshedItems.filter(getNoOfferFlag).length;

  return {
    optimizationChangedItemCount,
    vendorChangedItemCount,
    reviewGuidanceAddedCount,
    reviewGuidanceRemovedCount,
    noOfferItemDelta: refreshedNoOfferCount - previousNoOfferCount,
  };
};

const toRequirementFromDraftItem = (
  orgId: string,
  item: ProcurementDraftItem,
  fallback?: MaterialRequirement
): MaterialRequirement => ({
  id: item.materialRequirementId,
  orgId,
  inspectionId: item.inspectionId,
  repairTaskId: item.repairTaskId || fallback?.repairTaskId || 'unknown',
  category: item.category,
  itemDescription: item.itemDescription,
  quantity: item.quantity,
  unit: item.unit,
  confidence: fallback?.confidence || 'medium',
  source: fallback?.source || 'manual',
  status: fallback?.status || 'planned',
  notes: item.notes ?? fallback?.notes,
  roomLabel: item.roomLabel ?? fallback?.roomLabel,
  sourceFindingId: item.findingId ?? fallback?.sourceFindingId,
  sourceGeneratedSectionId: item.generatedSectionId ?? fallback?.sourceGeneratedSectionId,
  sourceGeneratedItemId: item.generatedItemId ?? fallback?.sourceGeneratedItemId,
  selectedMatch: item.selectedMatch ?? fallback?.selectedMatch,
  metadata: fallback?.metadata,
  createdAt: fallback?.createdAt || Date.now(),
  updatedAt: fallback?.updatedAt || Date.now(),
});

const normalizeDraftItem = (item: ProcurementDraftItem): ProcurementDraftItem => ({
  ...item,
  bundleIds: Array.isArray(item.bundleIds) ? item.bundleIds.filter(Boolean) as ProcurementBundleId[] : [],
});

const normalizeRecommendationAttachment = (
  attachment: ProcurementDraftRecommendationAttachment
): ProcurementDraftRecommendationAttachment => ({
  ...attachment,
  productId: attachment.productId || null,
  productLabel: attachment.productLabel || null,
  quantity: typeof attachment.quantity === 'number' ? attachment.quantity : null,
  attachmentState:
    attachment.attachmentState === 'attached' ||
    attachment.attachmentState === 'manual_needed' ||
    attachment.attachmentState === 'recommended'
      ? attachment.attachmentState
      : attachment.productId
        ? 'recommended'
        : 'manual_needed',
  sourceRequirementIds: Array.isArray(attachment.sourceRequirementIds) ? attachment.sourceRequirementIds.filter(Boolean) : [],
  sourceGeneratedItemIds: Array.isArray(attachment.sourceGeneratedItemIds) ? attachment.sourceGeneratedItemIds.filter(Boolean) : [],
});

const getCatalogOption = (item?: CatalogItem | null, optionId?: string | null): ProductOption | null => {
  if (!item) return null;
  const options = Array.isArray(item.options) ? item.options : [];
  if (optionId) {
    const matched = options.find((option) => option.id === optionId);
    if (matched) return matched;
  }
  if (options.length > 0) {
    return options[0];
  }
  return {
    id: `fallback:${item.id}`,
    name: item.title || item.name,
    price: item.defaultPrice || 0,
    sku: item.itemNumber || item.id,
    tier: item.defaultTier,
    brand: item.vendor || item.brand,
    modelNumber: item.modelNumber,
  };
};

const normalizePromotedLine = (line: ProcurementDraftPromotedLine): ProcurementDraftPromotedLine => ({
  ...line,
  productId: line.productId || null,
  optionId: line.optionId || null,
  vendorId: line.vendorId || null,
  skuCode: line.skuCode || null,
  quantity: typeof line.quantity === 'number' ? line.quantity : null,
  estimatedUnitPrice: typeof line.estimatedUnitPrice === 'number' ? line.estimatedUnitPrice : null,
  estimatedLineCost: typeof line.estimatedLineCost === 'number' ? line.estimatedLineCost : null,
  sourceRequirementIds: Array.isArray(line.sourceRequirementIds) ? line.sourceRequirementIds.filter(Boolean) : [],
  sourceGeneratedItemIds: Array.isArray(line.sourceGeneratedItemIds) ? line.sourceGeneratedItemIds.filter(Boolean) : [],
  promotionState: 'draft_line',
});

const buildPromotedLines = (
  draftId: string,
  recommendations: ResolvedProcurementProductRecommendation[],
  attachments: ProcurementDraftRecommendationAttachment[] = [],
  existingLines: ProcurementDraftPromotedLine[] = [],
  catalogItems: CatalogItem[] = []
): ProcurementDraftPromotedLine[] => {
  const attachmentByRecommendationId = new Map(
    attachments.map((attachment) => [attachment.recommendationId, normalizeRecommendationAttachment(attachment)])
  );
  const existingByRecommendationId = new Map(
    existingLines.map((line) => [line.recommendationId, normalizePromotedLine(line)])
  );
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const now = Date.now();

  return recommendations.flatMap((recommendation) => {
    const attachment = attachmentByRecommendationId.get(recommendation.id);
    if (!attachment || attachment.attachmentState !== 'attached' || !attachment.productId) {
      return [];
    }

    const existing = existingByRecommendationId.get(recommendation.id);
    const catalogItem = catalogById.get(attachment.productId);
    const selectedOption = getCatalogOption(catalogItem, existing?.optionId || recommendation.recommendedOptionId);
    const quantity = recommendation.quantity ?? existing?.quantity ?? null;
    const estimatedUnitPrice =
      typeof selectedOption?.price === 'number'
        ? selectedOption.price
        : recommendation.estimatedUnitPrice ?? existing?.estimatedUnitPrice ?? null;
    const estimatedLineCost =
      typeof quantity === 'number' && typeof estimatedUnitPrice === 'number'
        ? quantity * estimatedUnitPrice
        : recommendation.estimatedLineCost ?? existing?.estimatedLineCost ?? null;

    return [{
      id: existing?.id || `draft_line:${draftId}:${recommendation.id}`,
      draftId,
      recommendationId: recommendation.id,
      bundleId: recommendation.bundleId,
      bundleLineId: recommendation.bundleLineId,
      productId: attachment.productId,
      optionId: selectedOption?.id || existing?.optionId || recommendation.recommendedOptionId || null,
      vendorId: selectedOption?.brand || catalogItem?.vendor || existing?.vendorId || recommendation.recommendedVendor || null,
      skuCode: selectedOption?.sku || existing?.skuCode || recommendation.recommendedSku || null,
      label: existing?.label || recommendation.recommendedProductLabel || recommendation.bundleLineLabel,
      quantity,
      unit: existing?.unit || recommendation.unit,
      estimatedUnitPrice,
      estimatedLineCost,
      optimization: recommendation.optimization,
      sourceRequirementIds: recommendation.sourceRequirementIds,
      sourceGeneratedItemIds: recommendation.sourceGeneratedItemIds,
      notes: existing?.notes,
      promotionState: 'draft_line',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    } satisfies ProcurementDraftPromotedLine];
  });
};

const buildRecommendationAttachments = (
  draftId: string,
  recommendations: ResolvedProcurementProductRecommendation[],
  existingAttachments: ProcurementDraftRecommendationAttachment[] = []
): ProcurementDraftRecommendationAttachment[] => {
  const existingByRecommendationId = new Map(
    existingAttachments.map((attachment) => [attachment.recommendationId, normalizeRecommendationAttachment(attachment)])
  );
  const now = Date.now();
  return recommendations.map((recommendation) => {
    const existing = existingByRecommendationId.get(recommendation.id);
    const nextState =
      recommendation.status === 'manual_needed'
        ? 'manual_needed'
        : existing?.attachmentState === 'attached'
          ? 'attached'
          : 'recommended';

    return {
      id: existing?.id || `draft_attach:${draftId}:${recommendation.id}`,
      draftId,
      recommendationId: recommendation.id,
      bundleId: recommendation.bundleId,
      bundleLineId: recommendation.bundleLineId,
      productId: recommendation.recommendedProductId || null,
      productLabel: recommendation.recommendedProductLabel || null,
      quantity: recommendation.quantity ?? null,
      unit: recommendation.unit,
      attachmentState: nextState,
      sourceRequirementIds: recommendation.sourceRequirementIds,
      sourceGeneratedItemIds: recommendation.sourceGeneratedItemIds,
      notes:
        recommendation.status === 'manual_needed'
          ? 'Manual product selection is still required for this bundle line.'
          : existing?.notes,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    } satisfies ProcurementDraftRecommendationAttachment;
  });
};

const normalizeDraft = (draft: ProcurementDraft): ProcurementDraft => ({
  ...draft,
  items: (draft.items || []).map(normalizeDraftItem),
  bundleSuggestions: Array.isArray(draft.bundleSuggestions) ? draft.bundleSuggestions : [],
  bundleProductRecommendations: Array.isArray(draft.bundleProductRecommendations)
    ? draft.bundleProductRecommendations
    : [],
  recommendationAttachments: Array.isArray(draft.recommendationAttachments)
    ? draft.recommendationAttachments.map(normalizeRecommendationAttachment)
    : buildRecommendationAttachments(draft.id, draft.bundleProductRecommendations || []),
  promotedLines: Array.isArray(draft.promotedLines) ? draft.promotedLines.map(normalizePromotedLine) : [],
});

const buildBundleState = async (orgId: string, requirements: MaterialRequirement[]) => {
  const inspectionIds = Array.from(new Set(requirements.map((requirement) => requirement.inspectionId)));
  const inspections = (await InspectionService.listInspections(orgId)).filter((inspection) =>
    inspectionIds.includes(inspection.id)
  );
  const bundleState = ProcurementBundleService.resolveForRequirements({
    inspections,
    requirements,
  });
  const bundleProductRecommendations = await ProcurementProductResolutionService.resolveForBundles({
    orgId,
    bundles: bundleState.bundles,
    inspections,
  });
  return {
    ...bundleState,
    bundleProductRecommendations,
  };
};

const buildDraftItemIntelligence = async (
  orgId: string,
  item: ProcurementDraftItem,
  fallback?: MaterialRequirement
): Promise<ProcurementDraftItem> => {
  const requirement = toRequirementFromDraftItem(orgId, item, fallback);
  const candidates = await MaterialMatchingService.getCandidates(orgId, requirement);
  const optimization = ProcurementOptimizationService.optimizeRequirement(requirement, candidates);
  const vendorIntelligence = await ProcurementVendorIntelligenceService.buildForRequirement(
    orgId,
    requirement,
    candidates
  );

  const refreshedItem: ProcurementDraftItem = {
    ...item,
    selectedMatch: requirement.selectedMatch,
    optimization,
    vendorIntelligence,
  };

  return {
    ...refreshedItem,
    reviewGuidance: ProcurementReviewGuidanceService.buildForDraftItem(refreshedItem),
  };
};

export const ProcurementDraftService = {
  async listDrafts(orgId: string): Promise<ProcurementDraft[]> {
    const drafts = ((await adapter.getItem<ProcurementDraft[]>(getStoreKey(orgId))) || []).map(normalizeDraft);
    const catalogItems = await CatalogService.getItems(orgId);
    const draftsNeedingResolutionBackfill = drafts.filter(
      (draft) =>
        (draft.bundleSuggestions?.length || 0) > 0 &&
        (draft.bundleProductRecommendations?.length || 0) === 0
    );

    if (draftsNeedingResolutionBackfill.length === 0) {
      const normalizedDrafts = drafts.map((draft) => ({
        ...draft,
        promotedLines: buildPromotedLines(
          draft.id,
          draft.bundleProductRecommendations || [],
          draft.recommendationAttachments || [],
          draft.promotedLines || [],
          catalogItems
        ),
      }));
      await adapter.setItem(getStoreKey(orgId), normalizedDrafts);
      return normalizedDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const inspectionIds = Array.from(
      new Set(
        draftsNeedingResolutionBackfill.flatMap((draft) =>
          (draft.bundleSuggestions || []).map((bundle) => bundle.sourceInspectionId)
        )
      )
    );
    const inspections = (await InspectionService.listInspections(orgId)).filter((inspection) =>
      inspectionIds.includes(inspection.id)
    );
    const backfilledDrafts = await Promise.all(
      drafts.map(async (draft) => {
        if ((draft.bundleSuggestions?.length || 0) === 0 || (draft.bundleProductRecommendations?.length || 0) > 0) {
          return draft;
        }
        return {
          ...draft,
          bundleProductRecommendations: await ProcurementProductResolutionService.resolveForBundles({
            orgId,
            bundles: draft.bundleSuggestions || [],
            inspections,
          }),
        } satisfies ProcurementDraft;
      })
    );

    const normalizedBackfills = backfilledDrafts.map((draft) => ({
      ...draft,
      recommendationAttachments: buildRecommendationAttachments(
        draft.id,
        draft.bundleProductRecommendations || [],
        draft.recommendationAttachments || []
      ),
      promotedLines: buildPromotedLines(
        draft.id,
        draft.bundleProductRecommendations || [],
        draft.recommendationAttachments || [],
        draft.promotedLines || [],
        catalogItems
      ),
    }));

    await adapter.setItem(getStoreKey(orgId), normalizedBackfills);
    return normalizedBackfills.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async createFromRequirements(params: {
    orgId: string;
    name: string;
    requirements: MaterialRequirement[];
  }): Promise<ProcurementDraft> {
    if (params.requirements.length === 0) {
      throw new Error('Select at least one material requirement to create a procurement draft.');
    }

    const existingDrafts = await this.listDrafts(params.orgId);
    const catalogItems = await CatalogService.getItems(params.orgId);
    const duplicatedRequirement = existingDrafts
      .flatMap((draft) => draft.sourceRequirementIds)
      .find((requirementId) => params.requirements.some((requirement) => requirement.id === requirementId));

    if (duplicatedRequirement) {
      throw new Error('One or more selected requirements are already included in a procurement draft.');
    }

    const now = Date.now();
    const bundleState = await buildBundleState(params.orgId, params.requirements);
    const items: ProcurementDraftItem[] = await Promise.all(
      params.requirements.map(async (requirement) => {
        const item: ProcurementDraftItem = {
          id: createPrefixedId('proc_item_'),
          materialRequirementId: requirement.id,
          inspectionId: requirement.inspectionId,
          repairTaskId: requirement.repairTaskId,
          findingId: requirement.sourceFindingId,
          generatedSectionId: requirement.sourceGeneratedSectionId,
          generatedItemId: requirement.sourceGeneratedItemId,
          roomLabel: requirement.roomLabel,
          category: requirement.category,
          itemDescription: requirement.itemDescription,
          quantity: requirement.quantity,
          unit: requirement.unit,
          notes: requirement.notes,
          selectedMatch: requirement.selectedMatch,
          bundleIds: bundleState.bundleIdsByRequirementId[requirement.id] || [],
        };

        return buildDraftItemIntelligence(params.orgId, item, requirement);
      })
    );

    const draft: ProcurementDraft = {
      id: createPrefixedId('proc_'),
      orgId: params.orgId,
      name: params.name.trim() || `Procurement Draft ${new Date(now).toLocaleDateString()}`,
      status: 'draft',
      itemCount: items.length,
      sourceRequirementIds: params.requirements.map((requirement) => requirement.id),
      items,
      bundleSuggestions: bundleState.bundles,
      bundleProductRecommendations: bundleState.bundleProductRecommendations,
      recommendationAttachments: buildRecommendationAttachments(
        `pending:${now}`,
        bundleState.bundleProductRecommendations
      ),
      createdAt: now,
      updatedAt: now,
    };

    draft.recommendationAttachments = buildRecommendationAttachments(
      draft.id,
      draft.bundleProductRecommendations || [],
      draft.recommendationAttachments || []
    );
    draft.promotedLines = buildPromotedLines(
      draft.id,
      draft.bundleProductRecommendations || [],
      draft.recommendationAttachments || [],
      draft.promotedLines || [],
      catalogItems
    );

    await adapter.setItem(getStoreKey(params.orgId), [draft, ...existingDrafts]);
    return draft;
  },

  async updateStatus(orgId: string, draftId: string, status: ProcurementDraftStatus): Promise<ProcurementDraft> {
    const drafts = await this.listDrafts(orgId);
    const existing = drafts.find((draft) => draft.id === draftId);
    if (!existing) {
      throw new Error('Procurement draft not found.');
    }

    const updated: ProcurementDraft = {
      ...existing,
      status,
      updatedAt: Date.now(),
    };

    await adapter.setItem(
      getStoreKey(orgId),
      drafts.map((draft) => (draft.id === draftId ? updated : draft))
    );

    return updated;
  },

  async refreshIntelligence(orgId: string, draftId: string): Promise<ProcurementDraft> {
    const drafts = await this.listDrafts(orgId);
    const existing = drafts.find((draft) => draft.id === draftId);
    if (!existing) {
      throw new Error('Procurement draft not found.');
    }

    const requirements = await MaterialRequirementService.listRequirements(orgId);
    const catalogItems = await CatalogService.getItems(orgId);
    const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
    const draftRequirements = existing.sourceRequirementIds
      .map((requirementId) => requirementById.get(requirementId))
      .filter((requirement): requirement is MaterialRequirement => Boolean(requirement));
    const bundleState = await buildBundleState(orgId, draftRequirements);
    const refreshedAt = Date.now();
    const refreshedItems = await Promise.all(
      existing.items.map(async (item) => {
        const refreshedItem = await buildDraftItemIntelligence(orgId, item, requirementById.get(item.materialRequirementId));
        return {
          ...refreshedItem,
          bundleIds: bundleState.bundleIdsByRequirementId[item.materialRequirementId] || [],
        };
      })
    );

    const refreshedDraft: ProcurementDraft = {
      ...existing,
      items: refreshedItems,
      itemCount: refreshedItems.length,
      bundleSuggestions: bundleState.bundles,
      bundleProductRecommendations: bundleState.bundleProductRecommendations,
      recommendationAttachments: buildRecommendationAttachments(
        existing.id,
        bundleState.bundleProductRecommendations,
        existing.recommendationAttachments || []
      ),
      promotedLines: buildPromotedLines(
        existing.id,
        bundleState.bundleProductRecommendations,
        buildRecommendationAttachments(
          existing.id,
          bundleState.bundleProductRecommendations,
          existing.recommendationAttachments || []
        ),
        existing.promotedLines || [],
        catalogItems
      ),
      updatedAt: refreshedAt,
      intelligenceRefreshedAt: refreshedAt,
      lastRefreshSummary: buildRefreshSummary(existing.items, refreshedItems),
    };

    await adapter.setItem(
      getStoreKey(orgId),
      drafts.map((draft) => (draft.id === draftId ? refreshedDraft : draft))
    );

    return refreshedDraft;
  },

  async refreshMany(orgId: string, draftIds: string[]): Promise<ProcurementDraft[]> {
    const refreshedDrafts: ProcurementDraft[] = [];

    for (const draftId of draftIds) {
      refreshedDrafts.push(await this.refreshIntelligence(orgId, draftId));
    }

    return refreshedDrafts;
  },

  async updateManualAnnotation(orgId: string, draftId: string, note: string | null): Promise<ProcurementDraft> {
    const drafts = await this.listDrafts(orgId);
    const existing = drafts.find((draft) => draft.id === draftId);
    if (!existing) {
      throw new Error('Procurement draft not found.');
    }

    const trimmedNote = note?.trim() || '';
    const updatedDraft: ProcurementDraft = {
      ...existing,
      manualAnnotation: trimmedNote
        ? {
            note: trimmedNote,
            updatedAt: Date.now(),
          }
        : undefined,
      updatedAt: Date.now(),
    };

    await adapter.setItem(
      getStoreKey(orgId),
      drafts.map((draft) => (draft.id === draftId ? updatedDraft : draft))
    );

    return updatedDraft;
  },

  async updateRecommendationAttachmentState(
    orgId: string,
    draftId: string,
    attachmentId: string,
    attachmentState: ProcurementDraftRecommendationAttachment['attachmentState']
  ): Promise<ProcurementDraft> {
    const drafts = await this.listDrafts(orgId);
    const existing = drafts.find((draft) => draft.id === draftId);
    if (!existing) {
      throw new Error('Procurement draft not found.');
    }

    const attachment = (existing.recommendationAttachments || []).find((entry) => entry.id === attachmentId);
    if (!attachment) {
      throw new Error('Recommendation attachment not found.');
    }

    if (attachmentState === 'attached' && !attachment.productId) {
      throw new Error('Manual-needed recommendation cannot be attached until a product is resolved.');
    }

    const now = Date.now();
    const nextAttachments = (existing.recommendationAttachments || []).map((entry) =>
      entry.id === attachmentId
        ? {
            ...entry,
            attachmentState,
            updatedAt: now,
          }
        : entry
    );
    const catalogItems = await CatalogService.getItems(orgId);
    const updatedDraft: ProcurementDraft = {
      ...existing,
      recommendationAttachments: nextAttachments,
      promotedLines: buildPromotedLines(
        existing.id,
        existing.bundleProductRecommendations || [],
        nextAttachments,
        existing.promotedLines || [],
        catalogItems
      ),
      updatedAt: now,
    };

    await adapter.setItem(
      getStoreKey(orgId),
      drafts.map((draft) => (draft.id === draftId ? updatedDraft : draft))
    );

    return updatedDraft;
  },

  async promoteAttachmentToDraftLine(
    orgId: string,
    draftId: string,
    attachmentId: string
  ): Promise<ProcurementDraft> {
    const drafts = await this.listDrafts(orgId);
    const existing = drafts.find((draft) => draft.id === draftId);
    if (!existing) {
      throw new Error('Procurement draft not found.');
    }

    const attachment = (existing.recommendationAttachments || []).find((entry) => entry.id === attachmentId);
    if (!attachment) {
      throw new Error('Recommendation attachment not found.');
    }
    if (attachment.attachmentState !== 'attached') {
      throw new Error('Only attached recommendations can be promoted into draft lines.');
    }
    if (!attachment.productId) {
      throw new Error('Manual-needed recommendation cannot be promoted until a product is resolved.');
    }

    const catalogItems = await CatalogService.getItems(orgId);
    const nextPromotedLines = buildPromotedLines(
      existing.id,
      existing.bundleProductRecommendations || [],
      existing.recommendationAttachments || [],
      existing.promotedLines || [],
      catalogItems
    );

    const updatedDraft: ProcurementDraft = {
      ...existing,
      promotedLines: nextPromotedLines,
      updatedAt: Date.now(),
    };

    await adapter.setItem(
      getStoreKey(orgId),
      drafts.map((draft) => (draft.id === draftId ? updatedDraft : draft))
    );

    return updatedDraft;
  },

  async updatePromotedLineOption(
    orgId: string,
    draftId: string,
    promotedLineId: string,
    optionId: string | null
  ): Promise<ProcurementDraft> {
    const drafts = await this.listDrafts(orgId);
    const existing = drafts.find((draft) => draft.id === draftId);
    if (!existing) {
      throw new Error('Procurement draft not found.');
    }

    const line = (existing.promotedLines || []).find((entry) => entry.id === promotedLineId);
    if (!line) {
      throw new Error('Promoted draft line not found.');
    }
    if (!line.productId) {
      throw new Error('Promoted draft line must have a product before an option can be selected.');
    }

    const catalogItem = await CatalogService.getItem(orgId, line.productId);
    const nextOption = getCatalogOption(catalogItem, optionId);
    if (!nextOption) {
      throw new Error('No valid option is available for this promoted draft line.');
    }

    const quantity = typeof line.quantity === 'number' ? line.quantity : null;
    const estimatedUnitPrice = typeof nextOption.price === 'number' ? nextOption.price : null;
    const estimatedLineCost =
      typeof quantity === 'number' && typeof estimatedUnitPrice === 'number'
        ? quantity * estimatedUnitPrice
        : null;

    const updatedDraft: ProcurementDraft = {
      ...existing,
      promotedLines: (existing.promotedLines || []).map((entry) =>
        entry.id === promotedLineId
          ? {
              ...entry,
              optionId: nextOption.id,
              vendorId: nextOption.brand || catalogItem?.vendor || entry.vendorId || null,
              skuCode: nextOption.sku || entry.skuCode || null,
              estimatedUnitPrice,
              estimatedLineCost,
              updatedAt: Date.now(),
            }
          : entry
      ),
      updatedAt: Date.now(),
    };

    await adapter.setItem(
      getStoreKey(orgId),
      drafts.map((draft) => (draft.id === draftId ? updatedDraft : draft))
    );

    return updatedDraft;
  },

  async deleteDraft(orgId: string, draftId: string): Promise<void> {
    const drafts = await this.listDrafts(orgId);
    await adapter.setItem(
      getStoreKey(orgId),
      drafts.filter((draft) => draft.id !== draftId)
    );
  },
};
