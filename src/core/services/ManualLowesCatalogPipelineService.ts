import { CatalogArchetype, CatalogSourceConfidence, Tier } from '../models/types';
import { MANUAL_LOWES_ARCHETYPES } from '../data/manualLowesArchetypes';

export type ManualLowesTier = 'budget' | 'standard' | 'premium';

export interface ManualLowesImportRow {
  title: string;
  category: string;
  tags: string;
  notes: string;
  archetype_id: string;
  tier: ManualLowesTier;
  lowes_url: string;
  image_url: string;
  unit_type: string;
  pack_size: string;
  coverage: string;
  estimated_unit_cost: string;
  category_hint: string;
  keyword_hints: string;
  lowes_category_hint: string;
  confidence: CatalogSourceConfidence;
  source: 'manual_lowes';
  last_reviewed_at: string;
}

export interface ManualLowesTierQuery {
  tier: ManualLowesTier;
  query: string;
}

export interface ManualLowesValidationIssue {
  archetypeId: string;
  severity: 'error' | 'warning';
  message: string;
}

const CSV_HEADERS: Array<keyof ManualLowesImportRow> = [
  'title',
  'category',
  'tags',
  'notes',
  'archetype_id',
  'tier',
  'lowes_url',
  'image_url',
  'unit_type',
  'pack_size',
  'coverage',
  'estimated_unit_cost',
  'category_hint',
  'keyword_hints',
  'lowes_category_hint',
  'confidence',
  'source',
  'last_reviewed_at',
];

const SAMPLE_REVIEW_DATE = '2026-04-01';

const buildTags = (archetype: CatalogArchetype, extras: string[] = []) =>
  Array.from(
    new Set(
      [...archetype.keywords, ...extras]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  ).join(',');

const buildNotes = (value: string) =>
  `${value} Manual Lowe's sourcing sample. Verify live SKU, price, and option details during review.`;

const toTierEnum = (tier: ManualLowesTier) => {
  if (tier === 'budget') return Tier.BUDGET;
  if (tier === 'premium') return Tier.PREMIUM;
  return Tier.STANDARD;
};

const SAMPLE_ROWS: ManualLowesImportRow[] = [
  {
    title: 'Project Source 15-Amp White Duplex Outlet',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[0], ['project source', 'budget']),
    notes: buildNotes('Budget-grade replacement outlet.'),
    archetype_id: 'duplex_outlet_standard_white',
    tier: 'budget',
    lowes_url: 'https://www.lowes.com/search?searchTerm=project+source+15-amp+white+duplex+outlet',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '',
    estimated_unit_cost: '0.78',
    category_hint: 'Electrical & Lighting > Switches & Outlets',
    keyword_hints: 'outlet,duplex,receptacle,15 amp,white outlet',
    lowes_category_hint: 'Electrical > Outlets',
    confidence: 'medium',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Legrand Radiant 15-Amp White Duplex Outlet',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[0], ['legrand', 'standard']),
    notes: buildNotes('Common turn replacement outlet.'),
    archetype_id: 'duplex_outlet_standard_white',
    tier: 'standard',
    lowes_url: 'https://www.lowes.com/search?searchTerm=legrand+radiant+15-amp+white+duplex+outlet',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '',
    estimated_unit_cost: '2.49',
    category_hint: 'Electrical & Lighting > Switches & Outlets',
    keyword_hints: 'outlet,duplex,receptacle,wall outlet,legrand',
    lowes_category_hint: 'Electrical > Outlets',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Leviton Decora Plus 15-Amp Tamper-Resistant White Duplex Outlet',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[0], ['leviton', 'premium', 'tamper resistant']),
    notes: buildNotes('Premium durability and finish outlet option.'),
    archetype_id: 'duplex_outlet_standard_white',
    tier: 'premium',
    lowes_url: 'https://www.lowes.com/search?searchTerm=leviton+decora+plus+15-amp+white+duplex+outlet',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '',
    estimated_unit_cost: '4.98',
    category_hint: 'Electrical & Lighting > Switches & Outlets',
    keyword_hints: 'outlet,duplex,receptacle,decorator outlet,leviton',
    lowes_category_hint: 'Electrical > Outlets',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Project Source 1-in Cordless White Vinyl Mini Blind 35-in x 64-in',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[1], ['project source', 'budget', 'vinyl blind']),
    notes: buildNotes('Entry budget blind for basic turn replacements.'),
    archetype_id: 'blind_white_35x64_standard',
    tier: 'budget',
    lowes_url: 'https://www.lowes.com/search?searchTerm=project+source+cordless+white+mini+blind+35x64',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '35 in x 64 in',
    estimated_unit_cost: '18.98',
    category_hint: 'Windows & Coverings > Blinds & Shades',
    keyword_hints: 'blind,window blind,cordless blind,35x64,vinyl blind',
    lowes_category_hint: 'Windows & Coverings > Blinds',
    confidence: 'medium',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'LEVOLOR Trim+Go 2-in White Faux Wood Cordless Blind 35-in x 64-in',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[1], ['levolor', 'standard', 'faux wood blind']),
    notes: buildNotes('Standard cordless faux-wood blind for main turns.'),
    archetype_id: 'blind_white_35x64_standard',
    tier: 'standard',
    lowes_url: 'https://www.lowes.com/search?searchTerm=levolor+trim+go+2-in+white+faux+wood+cordless+blind+35x64',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '35 in x 64 in',
    estimated_unit_cost: '34.98',
    category_hint: 'Windows & Coverings > Blinds & Shades',
    keyword_hints: 'blind,window blind,cordless blind,35x64,faux wood blind',
    lowes_category_hint: 'Windows & Coverings > Blinds',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Bali 2-in White Faux Wood Cordless Blind 35-in x 64-in',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[1], ['bali', 'premium', 'faux wood blind']),
    notes: buildNotes('Premium cordless blind with stronger material finish.'),
    archetype_id: 'blind_white_35x64_standard',
    tier: 'premium',
    lowes_url: 'https://www.lowes.com/search?searchTerm=bali+2-in+white+faux+wood+cordless+blind+35x64',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '35 in x 64 in',
    estimated_unit_cost: '52.00',
    category_hint: 'Windows & Coverings > Blinds & Shades',
    keyword_hints: 'blind,window blind,cordless blind,35x64,bali blind',
    lowes_category_hint: 'Windows & Coverings > Blinds',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Rayovac High Energy 9-Volt Alkaline Batteries 2-Pack',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[2], ['rayovac', 'budget', 'battery pack']),
    notes: buildNotes('Budget detector battery pack for quick turnover swaps.'),
    archetype_id: 'smoke_detector_standard_battery',
    tier: 'budget',
    lowes_url: 'https://www.lowes.com/search?searchTerm=rayovac+9-volt+batteries+2-pack',
    image_url: '',
    unit_type: 'pack',
    pack_size: '2',
    coverage: '2 detectors',
    estimated_unit_cost: '4.98',
    category_hint: 'Electrical & Lighting > Bulbs & Drivers',
    keyword_hints: 'smoke detector battery,alarm battery,9v battery,detector battery',
    lowes_category_hint: 'Electrical > Batteries',
    confidence: 'medium',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Duracell Coppertop 9-Volt Alkaline Batteries 2-Pack',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[2], ['duracell', 'standard', 'battery pack']),
    notes: buildNotes('Standard detector battery replacement pack.'),
    archetype_id: 'smoke_detector_standard_battery',
    tier: 'standard',
    lowes_url: 'https://www.lowes.com/search?searchTerm=duracell+9-volt+batteries+2-pack',
    image_url: '',
    unit_type: 'pack',
    pack_size: '2',
    coverage: '2 detectors',
    estimated_unit_cost: '7.48',
    category_hint: 'Electrical & Lighting > Bulbs & Drivers',
    keyword_hints: 'smoke detector battery,alarm battery,9v battery,duracell',
    lowes_category_hint: 'Electrical > Batteries',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Energizer MAX 9-Volt Batteries 4-Pack',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[2], ['energizer', 'premium', 'battery pack']),
    notes: buildNotes('Premium longer-life detector battery pack.'),
    archetype_id: 'smoke_detector_standard_battery',
    tier: 'premium',
    lowes_url: 'https://www.lowes.com/search?searchTerm=energizer+max+9-volt+batteries+4-pack',
    image_url: '',
    unit_type: 'pack',
    pack_size: '4',
    coverage: '4 detectors',
    estimated_unit_cost: '14.98',
    category_hint: 'Electrical & Lighting > Bulbs & Drivers',
    keyword_hints: 'smoke detector battery,alarm battery,9v battery,energizer',
    lowes_category_hint: 'Electrical > Batteries',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Project Source Interior Eggshell Paint Neutral White 1-Gallon',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[3], ['project source', 'budget', 'eggshell paint']),
    notes: buildNotes('Budget touch-up paint for fast neutral turns.'),
    archetype_id: 'interior_wall_paint_touchup_neutral',
    tier: 'budget',
    lowes_url: 'https://www.lowes.com/search?searchTerm=project+source+interior+eggshell+paint+neutral+white+1-gallon',
    image_url: '',
    unit_type: 'gallon',
    pack_size: '1',
    coverage: '350 sq ft',
    estimated_unit_cost: '19.98',
    category_hint: 'Interior Finishes > Paint & Primers',
    keyword_hints: 'interior paint,wall paint,touch up paint,eggshell paint,neutral paint',
    lowes_category_hint: 'Paint > Interior Paint',
    confidence: 'medium',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'HGTV Home by Sherwin-Williams Infinity Interior Paint Neutral White 1-Gallon',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[3], ['sherwin williams', 'standard', 'paint']),
    notes: buildNotes('Standard high-coverage interior turn paint.'),
    archetype_id: 'interior_wall_paint_touchup_neutral',
    tier: 'standard',
    lowes_url: 'https://www.lowes.com/search?searchTerm=hgtv+home+by+sherwin-williams+infinity+interior+paint+neutral+white+1-gallon',
    image_url: '',
    unit_type: 'gallon',
    pack_size: '1',
    coverage: '400 sq ft',
    estimated_unit_cost: '47.98',
    category_hint: 'Interior Finishes > Paint & Primers',
    keyword_hints: 'interior paint,wall paint,touch up paint,neutral paint,sherwin williams',
    lowes_category_hint: 'Paint > Interior Paint',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Sherwin-Williams Duration Home Interior Paint Neutral White 1-Gallon',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[3], ['sherwin williams', 'premium', 'paint']),
    notes: buildNotes('Premium higher-durability interior wall paint.'),
    archetype_id: 'interior_wall_paint_touchup_neutral',
    tier: 'premium',
    lowes_url: 'https://www.lowes.com/search?searchTerm=sherwin-williams+duration+home+interior+paint+neutral+white+1-gallon',
    image_url: '',
    unit_type: 'gallon',
    pack_size: '1',
    coverage: '400 sq ft',
    estimated_unit_cost: '68.98',
    category_hint: 'Interior Finishes > Paint & Primers',
    keyword_hints: 'interior paint,wall paint,touch up paint,neutral paint,premium paint',
    lowes_category_hint: 'Paint > Interior Paint',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Filtrete Basic Pleated Air Filter 16-in x 25-in x 1-in',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[4], ['filtrete', 'budget', 'air filter']),
    notes: buildNotes('Budget pleated filter for basic turn replacements.'),
    archetype_id: 'hvac_filter_standard',
    tier: 'budget',
    lowes_url: 'https://www.lowes.com/search?searchTerm=filtrete+basic+16x25x1+air+filter',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '16 in x 25 in x 1 in',
    estimated_unit_cost: '6.48',
    category_hint: 'Appliances > Small Replacement Parts',
    keyword_hints: 'hvac filter,air filter,furnace filter,16x25x1,pleated filter',
    lowes_category_hint: 'Heating & Cooling > Air Filters',
    confidence: 'medium',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Filtrete MPR 1000 Pleated Air Filter 16-in x 25-in x 1-in',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[4], ['filtrete', 'standard', 'air filter']),
    notes: buildNotes('Standard pleated filter for recurring turns.'),
    archetype_id: 'hvac_filter_standard',
    tier: 'standard',
    lowes_url: 'https://www.lowes.com/search?searchTerm=filtrete+1000+16x25x1+air+filter',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '16 in x 25 in x 1 in',
    estimated_unit_cost: '11.48',
    category_hint: 'Appliances > Small Replacement Parts',
    keyword_hints: 'hvac filter,air filter,furnace filter,16x25x1,pleated filter',
    lowes_category_hint: 'Heating & Cooling > Air Filters',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
  {
    title: 'Filtrete Healthy Living MPR 1900 Air Filter 16-in x 25-in x 1-in',
    category: '',
    tags: buildTags(MANUAL_LOWES_ARCHETYPES[4], ['filtrete', 'premium', 'air filter']),
    notes: buildNotes('Premium higher-MERV filter for better dust capture.'),
    archetype_id: 'hvac_filter_standard',
    tier: 'premium',
    lowes_url: 'https://www.lowes.com/search?searchTerm=filtrete+1900+16x25x1+air+filter',
    image_url: '',
    unit_type: 'each',
    pack_size: '1',
    coverage: '16 in x 25 in x 1 in',
    estimated_unit_cost: '19.98',
    category_hint: 'Appliances > Small Replacement Parts',
    keyword_hints: 'hvac filter,air filter,furnace filter,16x25x1,merv filter',
    lowes_category_hint: 'Heating & Cooling > Air Filters',
    confidence: 'high',
    source: 'manual_lowes',
    last_reviewed_at: SAMPLE_REVIEW_DATE,
  },
];

export class ManualLowesCatalogPipelineService {
  static getArchetypes(): CatalogArchetype[] {
    return MANUAL_LOWES_ARCHETYPES.map((archetype) => ({ ...archetype }));
  }

  static getCsvHeaders(): Array<keyof ManualLowesImportRow> {
    return [...CSV_HEADERS];
  }

  static getCsvTemplate(): string {
    const rows = [CSV_HEADERS.join(','), ...SAMPLE_ROWS.map((row) => this.toCsvRow(row))];
    return rows.join('\n');
  }

  static getSampleRows(): ManualLowesImportRow[] {
    return SAMPLE_ROWS.map((row) => ({ ...row }));
  }

  static getSearchQueries(archetypeId: string): ManualLowesTierQuery[] {
    const archetype = MANUAL_LOWES_ARCHETYPES.find((entry) => entry.id === archetypeId);
    if (!archetype) return [];

    return [
      { tier: 'budget', query: `cheap ${archetype.displayName}` },
      { tier: 'standard', query: archetype.displayName },
      { tier: 'premium', query: `best ${archetype.displayName}` },
    ];
  }

  static validateRows(rows: ManualLowesImportRow[]): ManualLowesValidationIssue[] {
    const issues: ManualLowesValidationIssue[] = [];
    const byArchetype = new Map<string, ManualLowesImportRow[]>();

    rows.forEach((row) => {
      const existing = byArchetype.get(row.archetype_id) || [];
      existing.push(row);
      byArchetype.set(row.archetype_id, existing);
    });

    byArchetype.forEach((groupRows, archetypeId) => {
      const tierSet = new Set(groupRows.map((row) => row.tier));
      (['budget', 'standard', 'premium'] as ManualLowesTier[]).forEach((tier) => {
        if (!tierSet.has(tier)) {
          issues.push({
            archetypeId,
            severity: 'error',
            message: `Missing ${tier} tier row.`,
          });
        }
      });

      const duplicateKeys = new Set<string>();
      groupRows.forEach((row) => {
        const dedupeKey = `${row.title.trim().toLowerCase()}|${row.lowes_url.trim().toLowerCase()}`;
        if (duplicateKeys.has(dedupeKey)) {
          issues.push({
            archetypeId,
            severity: 'error',
            message: `Duplicate product selected across tiers: ${row.title}.`,
          });
        }
        duplicateKeys.add(dedupeKey);
      });

      const rowsByTier = new Map(groupRows.map((row) => [row.tier, row]));
      const budget = rowsByTier.get('budget');
      const standard = rowsByTier.get('standard');
      const premium = rowsByTier.get('premium');
      const budgetCost = budget ? Number(budget.estimated_unit_cost) : NaN;
      const standardCost = standard ? Number(standard.estimated_unit_cost) : NaN;
      const premiumCost = premium ? Number(premium.estimated_unit_cost) : NaN;

      if (
        Number.isFinite(budgetCost) &&
        Number.isFinite(standardCost) &&
        Number.isFinite(premiumCost) &&
        !(budgetCost < standardCost && standardCost < premiumCost)
      ) {
        issues.push({
          archetypeId,
          severity: 'warning',
          message: 'Expected rising price across budget, standard, and premium tiers.',
        });
      }
    });

    return issues;
  }

  static getTierEnum(tier: ManualLowesTier): Tier {
    return toTierEnum(tier);
  }

  private static toCsvRow(row: ManualLowesImportRow) {
    return CSV_HEADERS.map((header) => this.escapeCsvValue(row[header])).join(',');
  }

  private static escapeCsvValue(value: string) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
