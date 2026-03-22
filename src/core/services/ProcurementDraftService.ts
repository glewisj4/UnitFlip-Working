import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import {
  ProcurementDraft,
  ProcurementDraftItem,
  ProcurementDraftRefreshSummary,
  ProcurementDraftStatus,
} from '../models/procurement';
import { MaterialRequirement } from '../models/operations';
import { createPrefixedId } from '../../services/storage';
import { MaterialRequirementService } from './MaterialRequirementService';
import { MaterialMatchingService } from './MaterialMatchingService';
import { ProcurementOptimizationService } from './ProcurementOptimizationService';
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
    const drafts = (await adapter.getItem<ProcurementDraft[]>(getStoreKey(orgId))) || [];
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
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
    const duplicatedRequirement = existingDrafts
      .flatMap((draft) => draft.sourceRequirementIds)
      .find((requirementId) => params.requirements.some((requirement) => requirement.id === requirementId));

    if (duplicatedRequirement) {
      throw new Error('One or more selected requirements are already included in a procurement draft.');
    }

    const now = Date.now();
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
      createdAt: now,
      updatedAt: now,
    };

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
    const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
    const refreshedAt = Date.now();
    const refreshedItems = await Promise.all(
      existing.items.map((item) =>
        buildDraftItemIntelligence(orgId, item, requirementById.get(item.materialRequirementId))
      )
    );

    const refreshedDraft: ProcurementDraft = {
      ...existing,
      items: refreshedItems,
      itemCount: refreshedItems.length,
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
};
