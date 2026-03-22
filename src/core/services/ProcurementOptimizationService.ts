import { MaterialRequirement } from '../models/operations';
import {
  MaterialRequirementMatchCandidate,
  ProcurementOptimization,
  ProcurementPackSelection,
  ProcurementOptimizationSignal,
  SelectedProcurementOption,
} from '../models/procurement';

type OptimizableOffer = Pick<
  MaterialRequirementMatchCandidate,
  'catalogItemId' | 'optionId' | 'catalogItemName' | 'optionName' | 'unit' | 'price'
>;

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const UNIT_ALIASES: Record<string, string[]> = {
  gallon: ['gallon', 'gallons', 'gal'],
  sq_ft: ['sq ft', 'sqft', 'square feet', 'square foot', 'sq_ft'],
  each: ['each', 'ea', 'pack', 'pk', 'count', 'ct'],
  ft: ['ft', 'feet', 'foot'],
  roll: ['roll', 'rolls'],
  tube: ['tube', 'tubes'],
  bottle: ['bottle', 'bottles'],
  kit: ['kit', 'kits'],
  box: ['box', 'boxes'],
  tub: ['tub', 'tubs'],
};

const canonicalUnit = (value: string): string => {
  const normalized = normalize(value);
  const match = Object.entries(UNIT_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => normalize(alias) === normalized)
  );
  return match?.[0] || normalized;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePackSize = (
  offer: OptimizableOffer,
  requiredUnit: string
): { quantity: number; unit: string } => {
  const unit = canonicalUnit(requiredUnit);
  const haystack = normalize(
    `${offer.optionName} ${offer.catalogItemName} ${offer.optionId || ''}`
  );
  const aliases = UNIT_ALIASES[unit] || [unit];

  for (const alias of aliases) {
    const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${escapeRegex(alias).replace(/\s+/g, '\\s+')}`, 'i');
    const match = haystack.match(regex);
    if (match) {
      return { quantity: Number(match[1]), unit };
    }
  }

  if (unit === 'each') {
    const countMatch = haystack.match(/(\d+)\s*(pack|pk|count|ct)/i);
    if (countMatch) {
      return { quantity: Number(countMatch[1]), unit };
    }
  }

  return { quantity: 1, unit };
};

const createSelection = (
  offer: OptimizableOffer,
  requiredQuantity: number,
  requiredUnit: string,
  packCount: number
): ProcurementPackSelection => {
  const pack = parsePackSize(offer, requiredUnit);
  return {
    optionId: offer.optionId,
    optionName: offer.optionName,
    packQuantity: pack.quantity,
    packUnit: pack.unit,
    packCount,
    unitPrice: offer.price,
    lineCost: offer.price * packCount,
  };
};

const createOptimization = (
  requiredQuantity: number,
  requiredUnit: string,
  selections: ProcurementPackSelection[],
  rationale: string[],
  signals: ProcurementOptimizationSignal[]
): ProcurementOptimization => {
  const estimatedCoverageQuantity = selections.reduce(
    (sum, selection) => sum + selection.packQuantity * selection.packCount,
    0
  );
  const estimatedTotalCost = selections.reduce((sum, selection) => sum + selection.lineCost, 0);

  return {
    requiredQuantity,
    requiredUnit,
    estimatedCoverageQuantity,
    estimatedWasteQuantity: Math.max(0, estimatedCoverageQuantity - requiredQuantity),
    estimatedTotalCost,
    rationale,
    recommendedPacks: selections,
    signals,
  };
};

const compareOptimizations = (left: ProcurementOptimization, right: ProcurementOptimization): number => {
  if (left.estimatedTotalCost !== right.estimatedTotalCost) {
    return left.estimatedTotalCost - right.estimatedTotalCost;
  }
  if (left.estimatedWasteQuantity !== right.estimatedWasteQuantity) {
    return left.estimatedWasteQuantity - right.estimatedWasteQuantity;
  }
  return left.recommendedPacks.length - right.recommendedPacks.length;
};

const createOfferFromSelectedMatch = (
  selectedMatch: SelectedProcurementOption
): OptimizableOffer | null => {
  if (typeof selectedMatch.price !== 'number' || !Number.isFinite(selectedMatch.price)) {
    return null;
  }

  return {
    catalogItemId: selectedMatch.catalogItemId,
    catalogItemName: selectedMatch.catalogItemName,
    optionId: selectedMatch.optionId,
    optionName: selectedMatch.optionName,
    unit: selectedMatch.unit,
    price: selectedMatch.price,
  };
};

export const ProcurementOptimizationService = {
  optimizeRequirement(
    requirement: MaterialRequirement,
    candidates: MaterialRequirementMatchCandidate[]
  ): ProcurementOptimization | undefined {
    const requiredQuantity = requirement.quantity;
    if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
      return undefined;
    }

    const candidateOffers: OptimizableOffer[] = candidates
      .filter(
        (candidate): candidate is MaterialRequirementMatchCandidate & { price: number } =>
          typeof candidate.price === 'number' && Number.isFinite(candidate.price)
      )
      .map((candidate) => ({
        catalogItemId: candidate.catalogItemId,
        catalogItemName: candidate.catalogItemName,
        optionId: candidate.optionId,
        optionName: candidate.optionName,
        unit: candidate.unit,
        price: candidate.price,
      }));

    const selectedOffer = requirement.selectedMatch
      ? createOfferFromSelectedMatch(requirement.selectedMatch)
      : null;

    const offers = [...candidateOffers];
    if (
      selectedOffer &&
      !offers.some(
        (offer) =>
          offer.catalogItemId === selectedOffer.catalogItemId && offer.optionId === selectedOffer.optionId
      )
    ) {
      offers.unshift(selectedOffer);
    }

    return this.optimizeQuantity(requiredQuantity, requirement.unit, offers, [
      `Requirement quantity retained from ${requirement.itemDescription}.`,
      requirement.roomLabel ? `Room context: ${requirement.roomLabel}.` : '',
      requirement.notes ? `Planner note: ${requirement.notes}.` : '',
    ].filter(Boolean));
  },

  optimizeQuantity(
    requiredQuantity: number,
    requiredUnit: string,
    offers: OptimizableOffer[],
    rationaleSeed: string[] = []
  ): ProcurementOptimization | undefined {
    if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
      return undefined;
    }

    const normalizedUnit = canonicalUnit(requiredUnit);
    const compatibleOffers = offers.filter((offer) => canonicalUnit(offer.unit) === normalizedUnit);
    const evaluatedOffers = (compatibleOffers.length > 0 ? compatibleOffers : offers).filter(
      (offer) => Number.isFinite(offer.price) && offer.price > 0
    );

    if (evaluatedOffers.length === 0) {
      return undefined;
    }

    const singlePlans = evaluatedOffers.map((offer) => {
      const pack = parsePackSize(offer, requiredUnit);
      const packCount = Math.max(1, Math.ceil(requiredQuantity / pack.quantity));
      const selection = createSelection(offer, requiredQuantity, requiredUnit, packCount);
      return createOptimization(
        requiredQuantity,
        requiredUnit,
        [selection],
        [
          ...rationaleSeed,
          `Using ${selection.packCount} x ${selection.optionName} covers ${selection.packQuantity * selection.packCount} ${selection.packUnit}.`,
        ],
        selection.packQuantity > 1 ? ['better_pack_size_available'] : []
      );
    });

    const comboPlans: ProcurementOptimization[] = [];

    for (let i = 0; i < evaluatedOffers.length; i += 1) {
      for (let j = i + 1; j < evaluatedOffers.length; j += 1) {
        const primary = evaluatedOffers[i];
        const secondary = evaluatedOffers[j];
        const primaryPack = parsePackSize(primary, requiredUnit);
        const secondaryPack = parsePackSize(secondary, requiredUnit);

        if (primaryPack.unit !== secondaryPack.unit) {
          continue;
        }

        const maxPrimaryCount = Math.max(1, Math.ceil(requiredQuantity / primaryPack.quantity));
        for (let primaryCount = 1; primaryCount <= maxPrimaryCount; primaryCount += 1) {
          const coveredByPrimary = primaryCount * primaryPack.quantity;
          const remaining = Math.max(0, requiredQuantity - coveredByPrimary);
          const secondaryCount = remaining > 0 ? Math.ceil(remaining / secondaryPack.quantity) : 0;

          const selections: ProcurementPackSelection[] = [
            createSelection(primary, requiredQuantity, requiredUnit, primaryCount),
          ];

          if (secondaryCount > 0) {
            selections.push(createSelection(secondary, requiredQuantity, requiredUnit, secondaryCount));
          }

          comboPlans.push(
            createOptimization(
              requiredQuantity,
              requiredUnit,
              selections,
              [
                ...rationaleSeed,
                `Combining ${primary.optionName}${secondaryCount > 0 ? ` with ${secondary.optionName}` : ''} reduces cost or waste.`,
              ],
              ['combine_with_other_units', 'better_pack_size_available']
            )
          );
        }
      }
    }

    const best = [...singlePlans, ...comboPlans].sort(compareOptimizations)[0];
    if (!best) {
      return undefined;
    }

    const signals = [...best.signals];
    if (requiredQuantity >= 10) {
      signals.push('high_quantity_item');
    }
    if (best.estimatedWasteQuantity > Math.max(1, requiredQuantity * 0.2)) {
      signals.push('overbuy_risk');
    }

    return {
      ...best,
      signals: Array.from(new Set(signals)),
    };
  },
};
