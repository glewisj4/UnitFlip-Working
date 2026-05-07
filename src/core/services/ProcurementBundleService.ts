import { Inspection } from '../models/inspections';
import { MaterialRequirement } from '../models/operations';
import {
  ProcurementBundleDefinition,
  ProcurementBundleId,
  ProcurementBundleQuantityStrategy,
  ResolvedProcurementBundle,
} from '../models/procurement';
import { GeneratedInspectionItem, TurnoverPresetProductTier } from '../models/templates';
import { DEFAULT_PROCUREMENT_BUNDLES } from '../data/defaultProcurementBundles';

type BundleCandidate = {
  item: GeneratedInspectionItem;
  requirements: MaterialRequirement[];
};

type ResolveBundleParams = {
  inspection: Inspection;
  requirements: MaterialRequirement[];
};

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

const flattenInspectionItems = (inspection: Inspection): GeneratedInspectionItem[] =>
  inspection.generatedSections?.flatMap((section) => section.items) ||
  inspection.generatedItems ||
  [];

const buildRequirementMap = (requirements: MaterialRequirement[]) =>
  requirements.reduce((map, requirement) => {
    if (!requirement.sourceGeneratedItemId) {
      return map;
    }
    const current = map.get(requirement.sourceGeneratedItemId) || [];
    current.push(requirement);
    map.set(requirement.sourceGeneratedItemId, current);
    return map;
  }, new Map<string, MaterialRequirement[]>());

const isReplacementOrStandard = (item: GeneratedInspectionItem) =>
  item.itemType === 'always_replace' || item.focusedAction === 'replace';

const itemMatchesDefinition = (
  definition: ProcurementBundleDefinition,
  candidate: BundleCandidate
) => {
  const templateMatch =
    (definition.triggerTemplateItemIds || []).includes(candidate.item.sourceTemplateItemId);
  const categoryMatch =
    (definition.triggerLowesCategories || []).some(
      (category) => normalize(candidate.item.lowesCategory) === normalize(category)
    );
  if (!templateMatch && !categoryMatch) {
    return false;
  }
  if (candidate.requirements.length === 0) {
    return false;
  }
  if (definition.id === 'paint-turnover' || definition.id === 'bathroom-refresh') {
    return true;
  }
  if (definition.id === 'carpet-replacement') {
    const signature = [
      candidate.item.preferredReplaceOption,
      candidate.requirements.map((requirement) => requirement.itemDescription).join(' '),
      candidate.requirements.map((requirement) => requirement.selectedMatch?.optionName || '').join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return !signature.includes('lvp') && !signature.includes('luxury vinyl');
  }
  return isReplacementOrStandard(candidate.item);
};

const resolvePreferredTier = (
  definition: ProcurementBundleDefinition,
  candidates: BundleCandidate[]
): TurnoverPresetProductTier | undefined => {
  const tiers = candidates
    .map((candidate) => candidate.item.preferredProductTier)
    .filter((tier): tier is TurnoverPresetProductTier => Boolean(tier));
  return tiers[0] || definition.preferredProductTier;
};

const resolveQuantity = (
  strategy: ProcurementBundleQuantityStrategy,
  defaultQuantity: number | undefined,
  candidates: BundleCandidate[]
): number | null => {
  if (strategy === 'manual') {
    return null;
  }
  if (strategy === 'per_unit') {
    return defaultQuantity ?? 1;
  }
  if (strategy === 'per_room') {
    const distinctRooms = new Set(
      candidates.map((candidate) => normalize(candidate.item.roomLabel)).filter(Boolean)
    );
    return (distinctRooms.size || 1) * (defaultQuantity ?? 1);
  }
  if (strategy === 'per_item') {
    const totalRequirementQuantity = candidates.reduce(
      (sum, candidate) =>
        sum +
        candidate.requirements.reduce((inner, requirement) => inner + (Number.isFinite(requirement.quantity) ? requirement.quantity : 0), 0),
      0
    );
    return totalRequirementQuantity > 0
      ? totalRequirementQuantity
      : candidates.length * (defaultQuantity ?? 1);
  }
  if (strategy === 'sqft') {
    const totalSqFt = candidates.reduce((sum, candidate) => {
      const fromRequirements = candidate.requirements.reduce((inner, requirement) => {
        const unit = normalize(requirement.unit);
        return inner + (unit === 'sq_ft' || unit === 'sqft' ? requirement.quantity : 0);
      }, 0);
      if (fromRequirements > 0) {
        return sum + fromRequirements;
      }
      return sum + (candidate.item.inputValue?.area || 0);
    }, 0);
    return totalSqFt > 0 ? totalSqFt : null;
  }
  return null;
};

const buildResolvedBundle = (
  definition: ProcurementBundleDefinition,
  inspectionId: string,
  candidates: BundleCandidate[]
): ResolvedProcurementBundle => ({
  id: definition.id,
  label: definition.label,
  description: definition.description,
  sourceInspectionId: inspectionId,
  sourceGeneratedItemIds: candidates.map((candidate) => candidate.item.id),
  sourceRequirementIds: candidates.flatMap((candidate) => candidate.requirements.map((requirement) => requirement.id)),
  sourceRepairTaskIds: Array.from(
    new Set(
      candidates.flatMap((candidate) => candidate.requirements.map((requirement) => requirement.repairTaskId))
    )
  ),
  preferredProductTier: resolvePreferredTier(definition, candidates),
  lines: definition.lines.map((line) => ({
    id: line.id,
    category: line.category,
    label: line.label,
    quantity: resolveQuantity(line.quantityStrategy, line.defaultQuantity, candidates),
    quantityStrategy: line.quantityStrategy,
    notes: line.notes,
    lowesCategory: line.lowesCategory,
  })),
});

export const ProcurementBundleService = {
  listDefinitions(): ProcurementBundleDefinition[] {
    return DEFAULT_PROCUREMENT_BUNDLES.map((definition) => ({
      ...definition,
      lines: definition.lines.map((line) => ({ ...line })),
    }));
  },

  resolveForInspection(params: ResolveBundleParams): ResolvedProcurementBundle[] {
    const inspectionItems = flattenInspectionItems(params.inspection);
    if (inspectionItems.length === 0 || params.requirements.length === 0) {
      return [];
    }
    const requirementMap = buildRequirementMap(params.requirements);
    const candidates = inspectionItems
      .map(
        (item): BundleCandidate => ({
          item,
          requirements: requirementMap.get(item.id) || [],
        })
      )
      .filter((candidate) => candidate.requirements.length > 0);

    return this.listDefinitions()
      .map((definition) => {
        const matches = candidates.filter((candidate) => itemMatchesDefinition(definition, candidate));
        return matches.length > 0 ? buildResolvedBundle(definition, params.inspection.id, matches) : null;
      })
      .filter((bundle): bundle is ResolvedProcurementBundle => Boolean(bundle));
  },

  resolveForRequirements(params: {
    inspections: Inspection[];
    requirements: MaterialRequirement[];
  }): {
    bundles: ResolvedProcurementBundle[];
    bundleIdsByRequirementId: Record<string, ProcurementBundleId[]>;
    bundleIdsByGeneratedItemId: Record<string, ProcurementBundleId[]>;
  } {
    const requirementsByInspection = params.requirements.reduce((map, requirement) => {
      const current = map.get(requirement.inspectionId) || [];
      current.push(requirement);
      map.set(requirement.inspectionId, current);
      return map;
    }, new Map<string, MaterialRequirement[]>());

    const bundles = params.inspections.flatMap((inspection) =>
      this.resolveForInspection({
        inspection,
        requirements: requirementsByInspection.get(inspection.id) || [],
      })
    );

    const bundleIdsByRequirementId: Record<string, ProcurementBundleId[]> = {};
    const bundleIdsByGeneratedItemId: Record<string, ProcurementBundleId[]> = {};

    for (const bundle of bundles) {
      for (const requirementId of bundle.sourceRequirementIds) {
        bundleIdsByRequirementId[requirementId] = Array.from(
          new Set([...(bundleIdsByRequirementId[requirementId] || []), bundle.id])
        );
      }
      for (const generatedItemId of bundle.sourceGeneratedItemIds) {
        bundleIdsByGeneratedItemId[generatedItemId] = Array.from(
          new Set([...(bundleIdsByGeneratedItemId[generatedItemId] || []), bundle.id])
        );
      }
    }

    return {
      bundles,
      bundleIdsByRequirementId,
      bundleIdsByGeneratedItemId,
    };
  },
};
