import {
  Inspection,
  SeedMarker,
  Unit,
  UnitManagementData,
} from '../models/inspections';
import {
  Finding,
  FindingCategory,
  FindingPriority,
  FindingSeverity,
  MaterialRequirement,
  MaterialRequirementStatus,
  MaterialProcurementState,
  MaterialVendorActionState,
  MaterialVerificationStatus,
  RepairTaskStatus,
  TradeOption,
} from '../models/operations';
import { ProcurementDraftStatus, SelectedProcurementOption } from '../models/procurement';
import { ReportJob } from '../models/reports';
import { GeneratedInspectionItem, GeneratedInspectionSection, TurnoverPresetId } from '../models/templates';
import { CatalogItem, ProductOption, Tier } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { CatalogService } from './CatalogService';
import { CatalogImportService } from './CatalogImportService';
import { CatalogCategoryAssignmentService } from './CatalogCategoryAssignmentService';
import { ChecklistAlwaysReplaceService } from './ChecklistAlwaysReplaceService';
import { ChecklistScopedOverrideService } from './ChecklistScopedOverrideService';
import { ClientLoggerService } from './ClientLoggerService';
import { CategoryService } from './CategoryService';
import { FindingService } from './FindingService';
import { InspectionService } from './InspectionService';
import { InspectionTemplateGenerationService } from './InspectionTemplateGenerationService';
import { LayoutTemplateService } from './LayoutTemplateService';
import { MaterialRequirementService } from './MaterialRequirementService';
import { ProcurementDraftService } from './ProcurementDraftService';
import { RepairTaskService } from './RepairTaskService';
import { ReportService } from './ReportService';
import { ProductCatalogFoundationService } from './ProductCatalogFoundationService';
import { ManualLowesCatalogPipelineService } from './ManualLowesCatalogPipelineService';
import { UnitService } from './UnitService';

interface SeedCounts {
  facilities: number;
  buildings: number;
  units: number;
  inspections: number;
  catalogItems: number;
}

interface ClearSeedCounts {
  clearedUnits: number;
  clearedInspections: number;
  clearedCatalogItems: number;
}

export interface SeedSummary {
  seedBatch: string;
  seededUnits: number;
  seededInspections: number;
  seededCatalogItems: number;
  facilities: number;
  buildings: number;
}

type LayoutShape = {
  bedrooms: number;
  bathrooms: number;
};

type UnitScenario =
  | 'no_inspection'
  | 'luxury_in_progress'
  | 'budget_completed'
  | 'standard_review'
  | 'standard_in_progress'
  | 'luxury_completed'
  | 'override_in_progress';

type UnitBlueprint = {
  name: string;
  unitCode: string;
  facilityName: string;
  buildingName: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  budgetThreshold: number;
  presetId?: TurnoverPresetId;
  layout: LayoutShape;
  scenario: UnitScenario;
  managementData: UnitManagementData;
};

type CatalogSeedDefinition = {
  title: string;
  categoryName: string;
  topLevelCategory: string;
  subcategory?: string;
  description: string;
  defaultPrice: number;
  defaultQty: number;
  unit: string;
  defaultTier: Tier;
  equivalentGroup?: string;
  functionalTags?: string[];
  tags?: string[];
  vendor?: string;
  options: ProductOption[];
};

type CatalogIndexes = {
  all: CatalogItem[];
  byTitle: Map<string, CatalogItem>;
  byEquivalentGroup: Map<string, CatalogItem[]>;
};

type InspectionBuildContext = {
  orgId: string;
  userId: string;
  unit: Unit;
  presetId?: TurnoverPresetId;
  inspection: Inspection;
  catalog: CatalogIndexes;
};

type ConditionCapture = {
  templateItemId: string;
  roomIncludes?: string;
  focusedAction: 'repair' | 'replace';
  itemStatus?: GeneratedInspectionItem['status'];
  notes?: string;
  finding: {
    area: string;
    category: FindingCategory;
    severity: FindingSeverity;
    priority: FindingPriority;
    status: Finding['status'];
    description: string;
    notes?: string;
    recommendedTrade: TradeOption;
  };
  task: {
    title: string;
    trade: TradeOption;
    priority: FindingPriority;
    status: RepairTaskStatus;
    estimatedEffortMinutes?: number;
    notes?: string;
  };
  requirement: {
    category: string;
    itemDescription: string;
    quantity: number;
    unit: string;
    status: MaterialRequirementStatus;
    notes?: string;
    selectedItemTitle?: string;
    selectedEquivalentGroup?: string;
    selectedTier?: Tier;
    procurementState?: MaterialProcurementState;
    vendorActionState?: MaterialVendorActionState;
    verificationStatus?: MaterialVerificationStatus;
    assignedVendorUserId?: string;
    assignedVendorDisplayName?: string;
  };
};

type AlwaysReplaceCapture = {
  templateItemId: string;
  roomIncludes?: string;
  quantity?: number;
  area?: number;
  dimensions?: {
    width: number;
    height: number;
    unit?: 'in' | 'ft';
  };
  notes?: string;
};

const REPORT_STORAGE_PREFIX = 'unitflip_reports_v1:';
const REPORT_ADAPTER = createLocalDbAdapter();
const DEMO_DRAFT_PREFIX = 'Demo Procurement •';
const OVERRIDE_NOTE_MARKER = '[demo-seed:override]';
const CATALOG_NOTE_MARKER = '[demo-seed:catalog]';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

const syncInspectionSections = (inspection: Inspection): Inspection => {
  const itemMap = new Map((inspection.generatedItems || []).map((item) => [item.id, item]));
  return {
    ...inspection,
    generatedSections: (inspection.generatedSections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => itemMap.get(item.id) || item),
    })),
  };
};

const getReportStoreKey = (orgId: string) => `${REPORT_STORAGE_PREFIX}${orgId}`;

const toCatalogIndexes = (items: CatalogItem[]): CatalogIndexes => ({
  all: items,
  byTitle: new Map(items.map((item) => [item.title, item])),
  byEquivalentGroup: items.reduce<Map<string, CatalogItem[]>>((map, item) => {
    if (!item.equivalentGroup) return map;
    const existing = map.get(item.equivalentGroup) || [];
    existing.push(item);
    map.set(item.equivalentGroup, existing);
    return map;
  }, new Map<string, CatalogItem[]>()),
});

const selectOption = (
  item: CatalogItem,
  preferredTier?: Tier
): ProductOption => {
  const options = item.options || [];
  if (options.length === 0) {
    return {
      id: `fallback:${item.id}`,
      name: item.title,
      price: item.defaultPrice || 0,
      sku: item.itemNumber || item.id,
      tier: item.defaultTier || Tier.STANDARD,
    };
  }
  const exactTier = preferredTier ? options.find((option) => option.tier === preferredTier) : null;
  return exactTier || options[0];
};

const toSelectedMatch = (
  item: CatalogItem,
  preferredTier?: Tier,
  rationale: string[] = ['Seeded deterministic match.']
): SelectedProcurementOption => {
  const option = selectOption(item, preferredTier);
  return {
    catalogItemId: item.id,
    catalogItemName: item.name,
    optionId: option.id,
    optionName: option.name,
    category: item.categoryName || item.category,
    unit: item.unit || 'ea',
    vendor: option.brand || item.vendor,
    sku: option.sku,
    modelNumber: option.modelNumber || item.modelNumber,
    price: option.price,
    confidenceScore: 98,
    confidenceBand: 'exact',
    rationale,
    selectedAt: Date.now(),
  };
};

const findCatalogItem = (
  catalog: CatalogIndexes,
  params: {
    title?: string;
    equivalentGroup?: string;
    preferredTier?: Tier;
  }
): CatalogItem => {
  if (params.title) {
    const exact = catalog.byTitle.get(params.title);
    if (exact) return exact;
  }
  if (params.equivalentGroup) {
    const matches = catalog.byEquivalentGroup.get(params.equivalentGroup) || [];
    if (matches.length > 0) {
      if (params.preferredTier) {
        const tierMatch = matches.find((item) => (item.defaultTier || Tier.STANDARD) === params.preferredTier);
        if (tierMatch) return tierMatch;
      }
      return matches[0];
    }
  }
  throw new Error(`Seed catalog item not found for ${params.title || params.equivalentGroup || 'unknown'}.`);
};

const findSectionAndItem = (
  inspection: Inspection,
  templateItemId: string,
  roomIncludes?: string
): { section: GeneratedInspectionSection; item: GeneratedInspectionItem } => {
  const targetRoom = normalize(roomIncludes);
  for (const section of inspection.generatedSections || []) {
    for (const item of section.items || []) {
      if (item.sourceTemplateItemId !== templateItemId) continue;
      if (targetRoom && !normalize(item.roomLabel).includes(targetRoom)) continue;
      return { section, item };
    }
  }
  throw new Error(`Generated inspection item "${templateItemId}"${roomIncludes ? ` (${roomIncludes})` : ''} was not found.`);
};

const setGeneratedItemState = (
  inspection: Inspection,
  nextItem: GeneratedInspectionItem
): Inspection => ({
  ...inspection,
  generatedItems: (inspection.generatedItems || []).map((item) => (item.id === nextItem.id ? nextItem : item)),
});

const touchUnresolvedItemsForCompletedInspection = (inspection: Inspection): Inspection => {
  const updatedItems = (inspection.generatedItems || []).map((item) => {
    if (item.status !== 'not_started' && item.status !== 'in_progress') {
      return item;
    }
    return {
      ...item,
      status: 'completed' as const,
      updatedAt: Date.now(),
      completedAt: Date.now(),
      notes: item.notes || 'Seeded as inspected with no additional work required.',
    };
  });
  return syncInspectionSections({
    ...inspection,
    generatedItems: updatedItems,
  });
};

const buildUnitNotes = (blueprint: UnitBlueprint) =>
  `${blueprint.facilityName} demo seed • preset ${blueprint.presetId || 'standard'} • scenario ${blueprint.scenario.replace(/_/g, ' ')}`;

const buildUnitPhysicalDetails = (blueprint: UnitBlueprint) => ({
  ...(blueprint.managementData.physicalDetails || {}),
  bedrooms: blueprint.layout.bedrooms,
  bathrooms: blueprint.layout.bathrooms,
});

const UNIT_BLUEPRINTS: UnitBlueprint[] = [
  {
    name: 'MR-A-101 Studio',
    unitCode: 'MR-A-101',
    facilityName: 'Maple Ridge Apartments',
    buildingName: 'Building A',
    address1: '1100 Maple Ridge Drive',
    city: 'Raleigh',
    state: 'NC',
    zip: '27601',
    budgetThreshold: 1800,
    presetId: 'standard',
    layout: { bedrooms: 0, bathrooms: 1 },
    scenario: 'no_inspection',
    managementData: {
      physicalDetails: {
        squareFootage: 560,
        bedrooms: 0,
        bathrooms: 1,
        ceilingHeightFt: 9,
        roomMeasurements: [
          { roomName: 'Living Space', widthFt: 16, lengthFt: 18 },
          { roomName: 'Kitchen', widthFt: 8, lengthFt: 10 },
          { roomName: 'Bathroom', widthFt: 6, lengthFt: 8 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '16x25x1',
        smokeDetectorBatteryType: 'AA',
      },
      moveHistory: {
        moveOutChecklistSummary: 'Ready for first seeded focused-mode inspection.',
      },
    },
  },
  {
    name: 'MR-A-102 Luxury One Bedroom',
    unitCode: 'MR-A-102',
    facilityName: 'Maple Ridge Apartments',
    buildingName: 'Building A',
    address1: '1100 Maple Ridge Drive',
    city: 'Raleigh',
    state: 'NC',
    zip: '27601',
    budgetThreshold: 5200,
    presetId: 'luxury',
    layout: { bedrooms: 1, bathrooms: 1 },
    scenario: 'luxury_in_progress',
    managementData: {
      physicalDetails: {
        squareFootage: 760,
        bedrooms: 1,
        bathrooms: 1,
        roomMeasurements: [
          { roomName: 'Living Room', widthFt: 15, lengthFt: 18 },
          { roomName: 'Bedroom 1', widthFt: 12, lengthFt: 14 },
          { roomName: 'Bathroom', widthFt: 7, lengthFt: 8 },
        ],
        windowSizes: [
          { location: 'Bedroom 1', widthIn: 35, heightIn: 64 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '16x25x1',
        smokeDetectorBatteryType: 'AA',
      },
      maintenanceHistory: [
        { date: '2026-02-10', title: 'Pre-turn walk', vendor: 'Northside Turns', cost: 185, notes: 'Recommended finish refresh.' },
      ],
    },
  },
  {
    name: 'MR-B-201 Budget Two Bedroom',
    unitCode: 'MR-B-201',
    facilityName: 'Maple Ridge Apartments',
    buildingName: 'Building B',
    address1: '1140 Maple Ridge Drive',
    city: 'Raleigh',
    state: 'NC',
    zip: '27601',
    budgetThreshold: 3900,
    presetId: 'budget',
    layout: { bedrooms: 2, bathrooms: 1 },
    scenario: 'budget_completed',
    managementData: {
      physicalDetails: {
        squareFootage: 920,
        bedrooms: 2,
        bathrooms: 1,
        roomMeasurements: [
          { roomName: 'Living Room', widthFt: 16, lengthFt: 18 },
          { roomName: 'Bedroom 1', widthFt: 11, lengthFt: 12 },
          { roomName: 'Bedroom 2', widthFt: 10, lengthFt: 11 },
          { roomName: 'Bathroom', widthFt: 7, lengthFt: 9 },
        ],
        windowSizes: [
          { location: 'Bedroom 1', widthIn: 34, heightIn: 64 },
          { location: 'Bedroom 2', widthIn: 34, heightIn: 64 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '16x25x1',
        smokeDetectorBatteryType: 'AA',
      },
      moveHistory: {
        moveOutChecklistSummary: 'Completed budget-ready turn with carpet and paint scope.',
      },
    },
  },
  {
    name: 'MR-B-202 Review-Ready Two Two',
    unitCode: 'MR-B-202',
    facilityName: 'Maple Ridge Apartments',
    buildingName: 'Building B',
    address1: '1140 Maple Ridge Drive',
    city: 'Raleigh',
    state: 'NC',
    zip: '27601',
    budgetThreshold: 5600,
    presetId: 'standard',
    layout: { bedrooms: 2, bathrooms: 2 },
    scenario: 'standard_review',
    managementData: {
      physicalDetails: {
        squareFootage: 1080,
        bedrooms: 2,
        bathrooms: 2,
        roomMeasurements: [
          { roomName: 'Living Room', widthFt: 17, lengthFt: 19 },
          { roomName: 'Bedroom 1', widthFt: 12, lengthFt: 13 },
          { roomName: 'Bedroom 2', widthFt: 11, lengthFt: 12 },
          { roomName: 'Bathroom 1', widthFt: 7, lengthFt: 8 },
          { roomName: 'Bathroom 2', widthFt: 6, lengthFt: 8 },
        ],
        windowSizes: [
          { location: 'Bedroom 1', widthIn: 35, heightIn: 64 },
          { location: 'Bedroom 2', widthIn: 35, heightIn: 64 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '20x25x1',
        smokeDetectorBatteryType: 'AA',
      },
      maintenanceHistory: [
        { date: '2026-01-18', title: 'Flooring vendor consult', vendor: 'Premier Surfaces', cost: 275, notes: 'Recommended LVP in living room and hall.' },
      ],
    },
  },
  {
    name: 'LV-C-110 Standard Studio',
    unitCode: 'LV-C-110',
    facilityName: 'Lakeview Villas',
    buildingName: 'Building C',
    address1: '2200 Lakeview Terrace',
    city: 'Charlotte',
    state: 'NC',
    zip: '28202',
    budgetThreshold: 2200,
    presetId: 'standard',
    layout: { bedrooms: 0, bathrooms: 1 },
    scenario: 'standard_in_progress',
    managementData: {
      physicalDetails: {
        squareFootage: 590,
        bedrooms: 0,
        bathrooms: 1,
        roomMeasurements: [
          { roomName: 'Living Space', widthFt: 15, lengthFt: 17 },
          { roomName: 'Bathroom', widthFt: 6, lengthFt: 8 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '16x25x1',
        smokeDetectorBatteryType: 'AA',
      },
    },
  },
  {
    name: 'LV-C-112 Budget One Bedroom',
    unitCode: 'LV-C-112',
    facilityName: 'Lakeview Villas',
    buildingName: 'Building C',
    address1: '2200 Lakeview Terrace',
    city: 'Charlotte',
    state: 'NC',
    zip: '28202',
    budgetThreshold: 2400,
    presetId: 'budget',
    layout: { bedrooms: 1, bathrooms: 1 },
    scenario: 'no_inspection',
    managementData: {
      physicalDetails: {
        squareFootage: 730,
        bedrooms: 1,
        bathrooms: 1,
        roomMeasurements: [
          { roomName: 'Living Room', widthFt: 14, lengthFt: 17 },
          { roomName: 'Bedroom 1', widthFt: 11, lengthFt: 13 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '16x25x1',
        smokeDetectorBatteryType: 'AA',
      },
    },
  },
  {
    name: 'LV-D-218 Luxury Two Bedroom',
    unitCode: 'LV-D-218',
    facilityName: 'Lakeview Villas',
    buildingName: 'Building D',
    address1: '2240 Lakeview Terrace',
    city: 'Charlotte',
    state: 'NC',
    zip: '28202',
    budgetThreshold: 6100,
    presetId: 'luxury',
    layout: { bedrooms: 2, bathrooms: 1 },
    scenario: 'luxury_completed',
    managementData: {
      physicalDetails: {
        squareFootage: 980,
        bedrooms: 2,
        bathrooms: 1,
        roomMeasurements: [
          { roomName: 'Living Room', widthFt: 17, lengthFt: 18 },
          { roomName: 'Bedroom 1', widthFt: 12, lengthFt: 13 },
          { roomName: 'Bedroom 2', widthFt: 11, lengthFt: 12 },
        ],
        windowSizes: [
          { location: 'Bedroom 1', widthIn: 36, heightIn: 64 },
          { location: 'Bedroom 2', widthIn: 36, heightIn: 64 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '20x25x1',
        smokeDetectorBatteryType: 'AA',
      },
      moveHistory: {
        moveOutChecklistSummary: 'Luxury turn completed with bundle-backed procurement review.',
      },
    },
  },
  {
    name: 'LV-D-220 Override Demo Two Two',
    unitCode: 'LV-D-220',
    facilityName: 'Lakeview Villas',
    buildingName: 'Building D',
    address1: '2240 Lakeview Terrace',
    city: 'Charlotte',
    state: 'NC',
    zip: '28202',
    budgetThreshold: 5800,
    presetId: 'standard',
    layout: { bedrooms: 2, bathrooms: 2 },
    scenario: 'override_in_progress',
    managementData: {
      physicalDetails: {
        squareFootage: 1110,
        bedrooms: 2,
        bathrooms: 2,
        roomMeasurements: [
          { roomName: 'Living Room', widthFt: 18, lengthFt: 19 },
          { roomName: 'Bedroom 1', widthFt: 12, lengthFt: 12 },
          { roomName: 'Bedroom 2', widthFt: 11, lengthFt: 13 },
          { roomName: 'Bathroom 1', widthFt: 7, lengthFt: 8 },
          { roomName: 'Bathroom 2', widthFt: 6, lengthFt: 8 },
        ],
        windowSizes: [
          { location: 'Bedroom 1', widthIn: 35, heightIn: 64 },
          { location: 'Bedroom 2', widthIn: 34, heightIn: 64 },
        ],
      },
      maintenanceCheatSheet: {
        airFilterSize: '20x25x1',
        smokeDetectorBatteryType: 'AA',
      },
      maintenanceHistory: [
        { date: '2026-03-02', title: 'Property manager directive', notes: 'Living room flooring should replace every turn for this unit.' },
      ],
    },
  },
];

const CATALOG_SEEDS: CatalogSeedDefinition[] = [
  {
    title: 'Premium Pleated HVAC Filter 16x25x1',
    description: `${CATALOG_NOTE_MARKER} Premium HVAC filter for luxury turns.`,
    categoryName: 'Heating & Cooling',
    topLevelCategory: 'Heating & Cooling',
    subcategory: 'Air Filters',
    defaultPrice: 18.99,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.PREMIUM,
    equivalentGroup: 'hvac-filter-16x25x1',
    functionalTags: ['hvac', 'filter', 'turnover'],
    tags: ['seed', 'filter'],
    vendor: 'AirCare Supply',
    options: [
      { id: 'opt-hvac-premium-single', name: 'Single Filter', price: 18.99, sku: 'HVAC-16251-P1', tier: Tier.PREMIUM },
      { id: 'opt-hvac-premium-3pk', name: '3-Pack Filters', price: 49.5, sku: 'HVAC-16251-P3', tier: Tier.PREMIUM },
    ],
  },
  {
    title: 'Budget HVAC Filter 16x25x1',
    description: `${CATALOG_NOTE_MARKER} Budget HVAC filter for value turns.`,
    categoryName: 'Heating & Cooling',
    topLevelCategory: 'Heating & Cooling',
    subcategory: 'Air Filters',
    defaultPrice: 9.49,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.BUDGET,
    equivalentGroup: 'hvac-filter-16x25x1',
    functionalTags: ['hvac', 'filter', 'turnover'],
    tags: ['seed', 'filter'],
    vendor: 'AirCare Supply',
    options: [
      { id: 'opt-hvac-budget-single', name: 'Single Filter', price: 9.49, sku: 'HVAC-16251-B1', tier: Tier.BUDGET },
      { id: 'opt-hvac-budget-4pk', name: '4-Pack Filters', price: 33.99, sku: 'HVAC-16251-B4', tier: Tier.BUDGET },
    ],
  },
  {
    title: 'AA Detector Battery 4-Pack',
    description: `${CATALOG_NOTE_MARKER} Detector battery pack for safety turnovers.`,
    categoryName: 'Electrical',
    topLevelCategory: 'Electrical',
    subcategory: 'Batteries',
    defaultPrice: 7.99,
    defaultQty: 1,
    unit: 'pack',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'detector-battery-pack',
    functionalTags: ['safety', 'battery'],
    tags: ['seed', 'battery'],
    vendor: 'SafeHome Supply',
    options: [
      { id: 'opt-battery-4pk', name: '4-Pack AA Batteries', price: 7.99, sku: 'BAT-AA-4', tier: Tier.STANDARD },
      { id: 'opt-battery-8pk', name: '8-Pack AA Batteries', price: 13.99, sku: 'BAT-AA-8', tier: Tier.STANDARD },
    ],
  },
  {
    title: 'Paint and Patch Turnover Kit',
    description: `${CATALOG_NOTE_MARKER} Combined patch tools, tape, and prep materials.`,
    categoryName: 'Paint & Drywall',
    topLevelCategory: 'Paint & Drywall',
    subcategory: 'Prep Supplies',
    defaultPrice: 38.5,
    defaultQty: 1,
    unit: 'kit',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'paint-turnover-kit',
    functionalTags: ['paint', 'drywall', 'turnover'],
    tags: ['seed', 'paint'],
    vendor: 'Finish Depot',
    options: [{ id: 'opt-paint-kit-standard', name: 'Standard Turnover Kit', price: 38.5, sku: 'PNT-KIT-STD', tier: Tier.STANDARD }],
  },
  {
    title: 'Premium Interior Wall Paint',
    description: `${CATALOG_NOTE_MARKER} Premium scrubbable interior paint.`,
    categoryName: 'Paint & Drywall',
    topLevelCategory: 'Paint & Drywall',
    subcategory: 'Interior Paint',
    defaultPrice: 54.0,
    defaultQty: 1,
    unit: 'gal',
    defaultTier: Tier.PREMIUM,
    equivalentGroup: 'wall-paint-turnover',
    functionalTags: ['paint', 'wall'],
    tags: ['seed', 'paint'],
    vendor: 'Finish Depot',
    options: [
      { id: 'opt-wall-paint-premium-1g', name: '1 Gallon', price: 54.0, sku: 'PNT-WALL-P1', tier: Tier.PREMIUM },
      { id: 'opt-wall-paint-premium-5g', name: '5 Gallon Bucket', price: 239.0, sku: 'PNT-WALL-P5', tier: Tier.PREMIUM },
    ],
  },
  {
    title: 'Standard Interior Wall Paint',
    description: `${CATALOG_NOTE_MARKER} Standard turnover wall paint.`,
    categoryName: 'Paint & Drywall',
    topLevelCategory: 'Paint & Drywall',
    subcategory: 'Interior Paint',
    defaultPrice: 34.0,
    defaultQty: 1,
    unit: 'gal',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'wall-paint-turnover',
    functionalTags: ['paint', 'wall'],
    tags: ['seed', 'paint'],
    vendor: 'Finish Depot',
    options: [
      { id: 'opt-wall-paint-standard-1g', name: '1 Gallon', price: 34.0, sku: 'PNT-WALL-S1', tier: Tier.STANDARD },
      { id: 'opt-wall-paint-standard-5g', name: '5 Gallon Bucket', price: 149.0, sku: 'PNT-WALL-S5', tier: Tier.STANDARD },
    ],
  },
  {
    title: 'Trim Touch-Up Quart',
    description: `${CATALOG_NOTE_MARKER} Semi-gloss trim touch-up paint.`,
    categoryName: 'Paint & Drywall',
    topLevelCategory: 'Paint & Drywall',
    subcategory: 'Trim Paint',
    defaultPrice: 18.0,
    defaultQty: 1,
    unit: 'qt',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'trim-touch-up',
    functionalTags: ['paint', 'trim'],
    tags: ['seed', 'paint'],
    vendor: 'Finish Depot',
    options: [{ id: 'opt-trim-touch-up-qt', name: '1 Quart', price: 18.0, sku: 'PNT-TRIM-QT', tier: Tier.STANDARD }],
  },
  {
    title: 'Premium Cordless Faux Wood Blind 35x64',
    description: `${CATALOG_NOTE_MARKER} Premium blind set with upgraded finish.`,
    categoryName: 'Blinds & Window Shades',
    topLevelCategory: 'Blinds & Window Shades',
    subcategory: 'Cordless Blinds',
    defaultPrice: 72.0,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.PREMIUM,
    equivalentGroup: 'blind-set',
    functionalTags: ['blinds', 'window'],
    tags: ['seed', 'blind'],
    vendor: 'Window Supply Co.',
    options: [{ id: 'opt-blind-premium-3564', name: '35 x 64 in Blind', price: 72.0, sku: 'BLIND-P-3564', tier: Tier.PREMIUM }],
  },
  {
    title: 'Standard Cordless Blind 35x64',
    description: `${CATALOG_NOTE_MARKER} Standard blind set for common bedrooms.`,
    categoryName: 'Blinds & Window Shades',
    topLevelCategory: 'Blinds & Window Shades',
    subcategory: 'Cordless Blinds',
    defaultPrice: 42.0,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'blind-set',
    functionalTags: ['blinds', 'window'],
    tags: ['seed', 'blind'],
    vendor: 'Window Supply Co.',
    options: [{ id: 'opt-blind-standard-3564', name: '35 x 64 in Blind', price: 42.0, sku: 'BLIND-S-3564', tier: Tier.STANDARD }],
  },
  {
    title: 'Budget Vinyl Mini Blind 35x64',
    description: `${CATALOG_NOTE_MARKER} Budget blind set for value turns.`,
    categoryName: 'Blinds & Window Shades',
    topLevelCategory: 'Blinds & Window Shades',
    subcategory: 'Mini Blinds',
    defaultPrice: 21.0,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.BUDGET,
    equivalentGroup: 'blind-set',
    functionalTags: ['blinds', 'window'],
    tags: ['seed', 'blind'],
    vendor: 'Window Supply Co.',
    options: [{ id: 'opt-blind-budget-3564', name: '35 x 64 in Blind', price: 21.0, sku: 'BLIND-B-3564', tier: Tier.BUDGET }],
  },
  {
    title: 'Blind Mounting Hardware Kit',
    description: `${CATALOG_NOTE_MARKER} Replacement mounting brackets and fasteners for blinds.`,
    categoryName: 'Blinds & Window Shades',
    topLevelCategory: 'Blinds & Window Shades',
    subcategory: 'Blind Hardware',
    defaultPrice: 8.99,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'blind-hardware-kit',
    functionalTags: ['blinds', 'hardware'],
    tags: ['seed', 'blind'],
    vendor: 'Window Supply Co.',
    options: [{ id: 'opt-blind-hardware-kit', name: 'Mounting Hardware Kit', price: 8.99, sku: 'BLIND-HDW-1', tier: Tier.STANDARD }],
  },
  {
    title: 'Bathroom Fixture Refresh Kit',
    description: `${CATALOG_NOTE_MARKER} Faucet, toilet, and bath fixture allowance kit.`,
    categoryName: 'Bathroom Fixtures',
    topLevelCategory: 'Bathroom Fixtures',
    subcategory: 'Bathroom Fixture Kits',
    defaultPrice: 189.0,
    defaultQty: 1,
    unit: 'kit',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'bathroom-fixture-kit',
    functionalTags: ['bathroom', 'fixture'],
    tags: ['seed', 'bathroom'],
    vendor: 'BathWorks',
    options: [
      { id: 'opt-bath-fixture-standard', name: 'Standard Refresh Kit', price: 189.0, sku: 'BATH-KIT-S', tier: Tier.STANDARD },
      { id: 'opt-bath-fixture-premium', name: 'Premium Refresh Kit', price: 279.0, sku: 'BATH-KIT-P', tier: Tier.PREMIUM },
    ],
  },
  {
    title: 'Kitchen and Bath Sealant',
    description: `${CATALOG_NOTE_MARKER} Bathroom caulk and sealant tube.`,
    categoryName: 'Paint & Drywall',
    topLevelCategory: 'Paint & Drywall',
    subcategory: 'Sealants',
    defaultPrice: 6.49,
    defaultQty: 1,
    unit: 'tube',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'bath-sealant',
    functionalTags: ['bathroom', 'sealant'],
    tags: ['seed', 'bathroom'],
    vendor: 'BathWorks',
    options: [{ id: 'opt-bath-sealant-white', name: 'White Sealant Tube', price: 6.49, sku: 'SEAL-BATH-W', tier: Tier.STANDARD }],
  },
  {
    title: 'Decor Wall Plate 10-Pack',
    description: `${CATALOG_NOTE_MARKER} Premium wall plate pack for electrical refresh.`,
    categoryName: 'Electrical',
    topLevelCategory: 'Electrical',
    subcategory: 'Wall Plates',
    defaultPrice: 14.99,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.PREMIUM,
    equivalentGroup: 'device-cover-pack',
    functionalTags: ['electrical', 'wall plate'],
    tags: ['seed', 'electrical'],
    vendor: 'Current House',
    options: [
      { id: 'opt-wall-plate-10', name: '10-Pack Decor Wall Plates', price: 14.99, sku: 'ELEC-PLATE-10', tier: Tier.PREMIUM },
      { id: 'opt-wall-plate-20', name: '20-Pack Decor Wall Plates', price: 27.99, sku: 'ELEC-PLATE-20', tier: Tier.PREMIUM },
    ],
  },
  {
    title: 'Basic Wall Plate 5-Pack',
    description: `${CATALOG_NOTE_MARKER} Budget wall plate pack.`,
    categoryName: 'Electrical',
    topLevelCategory: 'Electrical',
    subcategory: 'Wall Plates',
    defaultPrice: 6.99,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.BUDGET,
    equivalentGroup: 'device-cover-pack',
    functionalTags: ['electrical', 'wall plate'],
    tags: ['seed', 'electrical'],
    vendor: 'Current House',
    options: [{ id: 'opt-wall-plate-basic-5', name: '5-Pack Wall Plates', price: 6.99, sku: 'ELEC-PLATE-5', tier: Tier.BUDGET }],
  },
  {
    title: 'Electrical Refresh Hardware Kit',
    description: `${CATALOG_NOTE_MARKER} Switches, receptacles, and fixture hardware allowance.`,
    categoryName: 'Electrical',
    topLevelCategory: 'Electrical',
    subcategory: 'Refresh Kits',
    defaultPrice: 48.0,
    defaultQty: 1,
    unit: 'kit',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'electrical-refresh-kit',
    functionalTags: ['electrical', 'refresh'],
    tags: ['seed', 'electrical'],
    vendor: 'Current House',
    options: [{ id: 'opt-electrical-kit-standard', name: 'Electrical Refresh Kit', price: 48.0, sku: 'ELEC-KIT-S', tier: Tier.STANDARD }],
  },
  {
    title: 'Premium LVP Flooring 24 Sq Ft/Case',
    description: `${CATALOG_NOTE_MARKER} Premium LVP plank case.`,
    categoryName: 'Flooring',
    topLevelCategory: 'Flooring',
    subcategory: 'Luxury Vinyl Plank',
    defaultPrice: 74.0,
    defaultQty: 1,
    unit: 'sq_ft',
    defaultTier: Tier.PREMIUM,
    equivalentGroup: 'lvp-flooring',
    functionalTags: ['flooring', 'lvp'],
    tags: ['seed', 'flooring'],
    vendor: 'Flooring House',
    options: [{ id: 'opt-lvp-premium-24', name: '24 sq ft case', price: 74.0, sku: 'LVP-P-24', tier: Tier.PREMIUM }],
  },
  {
    title: 'Standard LVP Flooring 24 Sq Ft/Case',
    description: `${CATALOG_NOTE_MARKER} Standard LVP plank case.`,
    categoryName: 'Flooring',
    topLevelCategory: 'Flooring',
    subcategory: 'Luxury Vinyl Plank',
    defaultPrice: 49.0,
    defaultQty: 1,
    unit: 'sq_ft',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'lvp-flooring',
    functionalTags: ['flooring', 'lvp'],
    tags: ['seed', 'flooring'],
    vendor: 'Flooring House',
    options: [{ id: 'opt-lvp-standard-24', name: '24 sq ft case', price: 49.0, sku: 'LVP-S-24', tier: Tier.STANDARD }],
  },
  {
    title: 'Universal Flooring Underlayment 100 Sq Ft Roll',
    description: `${CATALOG_NOTE_MARKER} Underlayment roll for resilient floors.`,
    categoryName: 'Flooring',
    topLevelCategory: 'Flooring',
    subcategory: 'Underlayment',
    defaultPrice: 34.0,
    defaultQty: 1,
    unit: 'sq_ft',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'flooring-underlayment',
    functionalTags: ['flooring', 'underlayment'],
    tags: ['seed', 'flooring'],
    vendor: 'Flooring House',
    options: [{ id: 'opt-underlayment-100', name: '100 sq ft roll', price: 34.0, sku: 'UNDER-100', tier: Tier.STANDARD }],
  },
  {
    title: 'Universal Transition Strip',
    description: `${CATALOG_NOTE_MARKER} Multi-surface transition strip.`,
    categoryName: 'Flooring',
    topLevelCategory: 'Flooring',
    subcategory: 'Transitions',
    defaultPrice: 18.0,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'transition-strip',
    functionalTags: ['flooring', 'transition'],
    tags: ['seed', 'flooring'],
    vendor: 'Flooring House',
    options: [{ id: 'opt-transition-universal', name: 'Universal Transition Strip', price: 18.0, sku: 'TRANS-UNI', tier: Tier.STANDARD }],
  },
  {
    title: 'Budget Carpet 100 Sq Ft Roll',
    description: `${CATALOG_NOTE_MARKER} Budget carpet roll for turn replacements.`,
    categoryName: 'Flooring',
    topLevelCategory: 'Flooring',
    subcategory: 'Carpet',
    defaultPrice: 129.0,
    defaultQty: 1,
    unit: 'sq_ft',
    defaultTier: Tier.BUDGET,
    equivalentGroup: 'carpet-flooring',
    functionalTags: ['flooring', 'carpet'],
    tags: ['seed', 'flooring'],
    vendor: 'Flooring House',
    options: [{ id: 'opt-carpet-budget-100', name: '100 sq ft carpet roll', price: 129.0, sku: 'CARPET-B-100', tier: Tier.BUDGET }],
  },
  {
    title: 'Carpet Pad 100 Sq Ft Roll',
    description: `${CATALOG_NOTE_MARKER} Carpet pad roll.`,
    categoryName: 'Flooring',
    topLevelCategory: 'Flooring',
    subcategory: 'Carpet Pad',
    defaultPrice: 44.0,
    defaultQty: 1,
    unit: 'sq_ft',
    defaultTier: Tier.STANDARD,
    equivalentGroup: 'carpet-pad',
    functionalTags: ['flooring', 'carpet'],
    tags: ['seed', 'flooring'],
    vendor: 'Flooring House',
    options: [{ id: 'opt-carpet-pad-100', name: '100 sq ft pad roll', price: 44.0, sku: 'PAD-100', tier: Tier.STANDARD }],
  },
  {
    title: 'Satin Nickel Passage Lever 6-Pack',
    description: `${CATALOG_NOTE_MARKER} Lever set pack for interior doors.`,
    categoryName: 'Doors & Windows',
    topLevelCategory: 'Doors & Windows',
    subcategory: 'Door Hardware',
    defaultPrice: 118.0,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.PREMIUM,
    equivalentGroup: 'passage-hardware',
    functionalTags: ['door', 'hardware'],
    tags: ['seed', 'hardware'],
    vendor: 'OpenClose Supply',
    options: [{ id: 'opt-passage-lever-6pk', name: '6-Pack Passage Levers', price: 118.0, sku: 'DOOR-LVR-6', tier: Tier.PREMIUM }],
  },
  {
    title: 'Basic Passage Knob 3-Pack',
    description: `${CATALOG_NOTE_MARKER} Budget knob set pack for interior doors.`,
    categoryName: 'Doors & Windows',
    topLevelCategory: 'Doors & Windows',
    subcategory: 'Door Hardware',
    defaultPrice: 52.0,
    defaultQty: 1,
    unit: 'ea',
    defaultTier: Tier.BUDGET,
    equivalentGroup: 'passage-hardware',
    functionalTags: ['door', 'hardware'],
    tags: ['seed', 'hardware'],
    vendor: 'OpenClose Supply',
    options: [{ id: 'opt-passage-knob-3pk', name: '3-Pack Passage Knobs', price: 52.0, sku: 'DOOR-KNB-3', tier: Tier.BUDGET }],
  },
];

export class DevSeedService {
  static readonly SEED_BATCH = 'demo-portfolio-v2';
  static readonly REFRESH_EVENT = 'unitflip:seed-data-updated';

  static async hasSeedData(orgId: string): Promise<boolean> {
    const summary = await this.getSeedSummary(orgId);
    return summary.seededUnits > 0 || summary.seededInspections > 0 || summary.seededCatalogItems > 0;
  }

  static async getSeedSummary(orgId: string): Promise<SeedSummary> {
    const [units, inspections, catalogItems] = await Promise.all([
      UnitService.listUnits(orgId),
      InspectionService.listInspections(orgId),
      CatalogService.getItems(orgId),
    ]);

    const seededUnits = units.filter((unit) => unit.seedMarker?.isSeedData || unit.managementData?.seedMarker?.isSeedData);
    const seededInspections = inspections.filter((inspection) => inspection.seedMarker?.isSeedData);
    const seededCatalogItems = catalogItems.filter((item) => item.seedMarker?.isSeedData);
    const facilityLabels = new Set(seededUnits.map((unit) => unit.facilityName?.trim()).filter(Boolean));
    const buildingKeys = new Set(
      seededUnits
        .map((unit) => `${unit.facilityName?.trim() || ''}::${unit.buildingName?.trim() || ''}`)
        .filter((key) => key !== '::')
    );

    return {
      seedBatch: this.SEED_BATCH,
      seededUnits: seededUnits.length,
      seededInspections: seededInspections.length,
      seededCatalogItems: seededCatalogItems.length,
      facilities: facilityLabels.size,
      buildings: buildingKeys.size,
    };
  }

  static async seedDemoData(orgId: string, userId: string): Promise<SeedCounts> {
    ClientLoggerService.info('Developer demo data seed started.', {
      category: 'developer_tools',
      eventType: 'demo_seed.started',
      screen: 'FeedbackManagement',
      contextIds: { orgId, userId },
      metadata: { seedBatch: this.SEED_BATCH },
    });

    await this.clearSeedData(orgId, userId, true);
    await CatalogCategoryAssignmentService.clearCorrectionMemory(orgId, { noteIncludes: this.SEED_BATCH });

    const seedMarker = this.buildSeedMarker();
    const catalogItems = await this.seedCatalogItems(orgId, seedMarker, userId);
    const catalog = toCatalogIndexes(catalogItems);
    const layouts = await LayoutTemplateService.listActive(orgId);

    const createdUnits: Unit[] = [];
    const createdInspections: Inspection[] = [];
    const createdOverrides = await this.seedScopedOverrides(orgId);

    for (const blueprint of UNIT_BLUEPRINTS) {
      const createdUnit = await UnitService.createUnit(orgId, {
        name: blueprint.name,
        unitCode: blueprint.unitCode,
        facilityName: blueprint.facilityName,
        buildingName: blueprint.buildingName,
        address1: blueprint.address1,
        city: blueprint.city,
        state: blueprint.state,
        zip: blueprint.zip,
        budgetThreshold: blueprint.budgetThreshold,
        notes: buildUnitNotes(blueprint),
        assignedLayoutTemplateId: this.resolveLayoutId(blueprint.layout, layouts),
        favoriteProductIds: this.resolveFavoriteProductIds(blueprint.presetId, catalog),
        seedMarker,
        managementData: {
          ...clone(blueprint.managementData),
          seedMarker,
          physicalDetails: buildUnitPhysicalDetails(blueprint),
        },
      });
      createdUnits.push(createdUnit);
      await this.rebindUnitOverrides(orgId, createdUnit, createdOverrides);

      if (blueprint.scenario === 'no_inspection') {
        continue;
      }

      const inspection = await this.seedInspectionScenario({
        orgId,
        userId,
        unit: createdUnit,
        presetId: blueprint.presetId,
        scenario: blueprint.scenario,
        catalog,
      });
      createdInspections.push(inspection);
    }

    await this.createProcurementDrafts(orgId, createdInspections);
    await this.createReports(orgId, userId, createdInspections);

    const summary = await this.getSeedSummary(orgId);
    this.dispatchRefreshEvent({
      orgId,
      userId,
      action: 'seeded',
      summary,
    });

    const result: SeedCounts = {
      facilities: 2,
      buildings: 4,
      units: createdUnits.length,
      inspections: createdInspections.length,
      catalogItems: catalogItems.length,
    };

    ClientLoggerService.info('Developer demo data seed completed.', {
      category: 'developer_tools',
      eventType: 'demo_seed.completed',
      screen: 'FeedbackManagement',
      contextIds: { orgId, userId },
      metadata: {
        seedBatch: this.SEED_BATCH,
        ...result,
      },
    });

    return result;
  }

  static async clearSeedData(orgId: string, userId: string, silent = false): Promise<ClearSeedCounts> {
    const [units, inspections, catalogItems, overrides, drafts] = await Promise.all([
      UnitService.listUnits(orgId),
      InspectionService.listInspections(orgId),
      CatalogService.getItems(orgId),
      ChecklistScopedOverrideService.listAll(orgId),
      ProcurementDraftService.listDrafts(orgId),
    ]);
    await CatalogCategoryAssignmentService.clearCorrectionMemory(orgId, { noteIncludes: this.SEED_BATCH });

    const seededInspections = inspections.filter((inspection) => inspection.seedMarker?.isSeedData);
    const seededInspectionIds = new Set(seededInspections.map((inspection) => inspection.id));
    const seededUnits = units.filter((unit) => unit.seedMarker?.isSeedData || unit.managementData?.seedMarker?.isSeedData);
    const seededCatalogItems = catalogItems.filter((item) => item.seedMarker?.isSeedData);
    const seededOverrides = overrides.filter((override) => (override.notes || '').includes(this.SEED_BATCH));
    const seededRequirements = (
      await Promise.all(
        seededInspections.map((inspection) => MaterialRequirementService.listRequirements(orgId, { inspectionId: inspection.id }))
      )
    ).flat();
    const seededRequirementIds = new Set(seededRequirements.map((requirement) => requirement.id));

    for (const draft of drafts) {
      const seededDraft =
        draft.name.startsWith(DEMO_DRAFT_PREFIX) ||
        draft.sourceRequirementIds.some((requirementId) => seededRequirementIds.has(requirementId));
      if (seededDraft) {
        await ProcurementDraftService.deleteDraft(orgId, draft.id);
      }
    }

    const reports = ((await REPORT_ADAPTER.getItem<ReportJob[]>(getReportStoreKey(orgId))) || []).filter(
      (report) => !seededInspectionIds.has(report.inspectionId)
    );
    await REPORT_ADAPTER.setItem(getReportStoreKey(orgId), reports);

    for (const override of seededOverrides) {
      await ChecklistScopedOverrideService.delete(override.id, orgId);
    }

    for (const inspection of seededInspections) {
      const [findings, tasks] = await Promise.all([
        FindingService.listFindings(orgId, { inspectionId: inspection.id }),
        RepairTaskService.listTasks(orgId, { inspectionId: inspection.id }),
      ]);

      await MaterialRequirementService.clearForInspection(orgId, inspection.id, userId);
      for (const task of tasks) {
        await RepairTaskService.deleteTask(orgId, task.id, userId);
      }
      for (const finding of findings) {
        await FindingService.deleteFinding(orgId, finding.id, userId);
      }
      await InspectionService.deleteInspection(orgId, inspection.id);
    }

    for (const unit of seededUnits) {
      await UnitService.deleteUnit(orgId, unit.id);
    }

    for (const item of seededCatalogItems) {
      await CatalogService.deleteItem(orgId, item.id);
    }

    const result: ClearSeedCounts = {
      clearedUnits: seededUnits.length,
      clearedInspections: seededInspections.length,
      clearedCatalogItems: seededCatalogItems.length,
    };

    this.dispatchRefreshEvent({
      orgId,
      userId,
      action: 'cleared',
      summary: await this.getSeedSummary(orgId),
    });

    if (!silent) {
      ClientLoggerService.info('Developer demo data cleared.', {
        category: 'developer_tools',
        eventType: 'demo_seed.cleared',
        screen: 'FeedbackManagement',
        contextIds: { orgId, userId },
        metadata: { seedBatch: this.SEED_BATCH, ...result },
      });
    }

    return result;
  }

  private static buildSeedMarker(): SeedMarker {
    return {
      isSeedData: true,
      seedBatch: this.SEED_BATCH,
    };
  }

  private static resolveLayoutId(layout: LayoutShape, layouts: Awaited<ReturnType<typeof LayoutTemplateService.listActive>>) {
    const match = layouts.find((entry) => entry.bedrooms === layout.bedrooms && entry.bathroomsFull === layout.bathrooms);
    if (!match) {
      throw new Error(`No active layout found for ${layout.bedrooms} bed / ${layout.bathrooms} bath.`);
    }
    return match.id;
  }

  private static resolveFavoriteProductIds(presetId: TurnoverPresetId | undefined, catalog: CatalogIndexes): string[] {
    const favoriteGroups =
      presetId === 'luxury'
        ? ['blind-set', 'lvp-flooring', 'passage-hardware']
        : presetId === 'budget'
          ? ['device-cover-pack', 'carpet-flooring', 'hvac-filter-16x25x1']
          : ['wall-paint-turnover', 'bathroom-fixture-kit', 'blind-set'];

    return favoriteGroups
      .map((group) => findCatalogItem(catalog, { equivalentGroup: group }).id)
      .slice(0, 3);
  }

  private static async seedCatalogItems(orgId: string, seedMarker: SeedMarker, userId: string): Promise<CatalogItem[]> {
    await ProductCatalogFoundationService.ensureDefaultCategories(orgId);
    const created: CatalogItem[] = [];
    for (const definition of CATALOG_SEEDS) {
      created.push(
        await CatalogService.addItem(orgId, {
          title: definition.title,
          name: definition.title,
          description: definition.description,
          categoryName: definition.categoryName,
          topLevelCategory: definition.topLevelCategory,
          subcategory: definition.subcategory,
          equivalentGroup: definition.equivalentGroup,
          functionalTags: definition.functionalTags || [],
          vendor: definition.vendor,
          importSource: 'manual',
          defaultQty: definition.defaultQty,
          unit: definition.unit,
          defaultTier: definition.defaultTier,
          defaultPrice: definition.defaultPrice,
          tags: definition.tags || [],
          options: definition.options.map((option) => ({ ...option })),
          seedMarker,
        })
      );
    }

    const categories = await CategoryService.getCategories(orgId);
    await CatalogImportService.importPastedText(
      orgId,
      [
        'Decorator wall plate 10 pack | Current House | IMP-PLATE-10 | Electrical & Lighting > Switches & Outlets | imported-wall-plate | outlet;switch;cover | 12.49',
        'Cordless faux wood blind 35x64 | Window Supply Co. | IMP-BLIND-3564 |  | imported-blind | blind;window;bedroom | 39.99',
        'Interior wall refresh paint gallon | Finish Depot | IMP-PAINT-1G |  | imported-wall-paint | paint;wall;interior | 31.99',
        'Premium turnover starter kit | Turn Supply Co. | IMP-TURN-BASE |  | imported-turn-kit | turnover;refresh | 18.99',
        'Mystery refresh starter bundle | Turn Supply Co. | IMP-REVIEW-1 |  | imported-review | refresh;bundle | 14.99',
      ].join('\n'),
      categories
    );

    const importedItems = (await CatalogService.getItems(orgId)).filter(
      (item) => item.importSource === 'text_paste' && !item.seedMarker?.isSeedData
    );

    const cleaningChemicalsCategory = categories.find((entry) => entry.name === 'Cleaning Chemicals');
    const importedTurnStarter = importedItems.find((item) => item.title === 'Premium turnover starter kit');
    if (importedTurnStarter && cleaningChemicalsCategory) {
      await CatalogService.updateItem(orgId, importedTurnStarter.id, {
        categoryId: cleaningChemicalsCategory.id,
        categoryName: cleaningChemicalsCategory.name,
        updatedBy: userId,
      });
      await CatalogCategoryAssignmentService.rememberCorrection(orgId, {
        categoryId: cleaningChemicalsCategory.id,
        categoryName: cleaningChemicalsCategory.name,
        sourceCategoryPath: importedTurnStarter.categoryAssignment?.sourceCategoryPath,
        sourceTitleFingerprint: importedTurnStarter.categoryAssignment?.sourceTitleFingerprint,
        createdBy: userId,
        notes: 'Demo seed org correction memory for imported turnover kit naming.',
      });
      const corrected = await CatalogService.getItem(orgId, importedTurnStarter.id);
      if (corrected) {
        const correctedIndex = importedItems.findIndex((item) => item.id === corrected.id);
        if (correctedIndex >= 0) {
          importedItems.splice(correctedIndex, 1, corrected);
        }
      }
    }

    await CatalogImportService.importPastedText(
      orgId,
      'Premium turnover starter kit | Turn Supply Co. | IMP-TURN-ORG-MEM |  | imported-turn-kit-memory | turnover;starter | 19.99',
      categories
    );

    const manualLowesRows = ManualLowesCatalogPipelineService.getSampleRows();
    const missingTierRows = manualLowesRows.filter(
      (row) =>
        row.archetype_id === 'duplex_outlet_standard_white' &&
        row.tier !== 'premium'
    );
    const priceInversionRows = manualLowesRows
      .filter((row) => row.archetype_id === 'interior_wall_paint_touchup_neutral')
      .map((row) =>
        row.tier === 'budget'
          ? { ...row, title: 'Budget inversion paint', estimated_unit_cost: '52.98' }
          : row.tier === 'standard'
            ? { ...row, title: 'Standard inversion paint', estimated_unit_cost: '43.98' }
            : { ...row, title: 'Premium inversion paint', estimated_unit_cost: '68.98' }
      );
    const duplicateRows = [
      {
        ...manualLowesRows.find(
          (row) =>
            row.archetype_id === 'blind_white_35x64_standard' &&
            row.tier === 'standard'
        )!,
        title: 'Duplicate blind standard sample',
      },
      {
        ...manualLowesRows.find(
          (row) =>
            row.archetype_id === 'blind_white_35x64_standard' &&
            row.tier === 'standard'
        )!,
        title: 'Duplicate blind standard sample',
      },
    ];
    const lowConfidenceRow = {
      ...manualLowesRows.find(
        (row) =>
          row.archetype_id === 'smoke_detector_standard_battery' &&
          row.tier === 'budget'
      )!,
      title: 'Low confidence detector battery sample',
      confidence: 'low' as const,
      category_hint: '',
      lowes_category_hint: '',
      keyword_hints: 'filter,return',
    };
    const missingSourceRow = {
      ...manualLowesRows.find(
        (row) =>
          row.archetype_id === 'smoke_detector_standard_battery' &&
          row.tier === 'standard'
      )!,
      title: 'Missing source detector battery sample',
      lowes_url: '',
      image_url: '',
    };
    const healthyRows = manualLowesRows.filter(
      (row) => row.archetype_id === 'hvac_filter_standard'
    );

    const manualLowesSeedCsv = [
      ...ManualLowesCatalogPipelineService.getCsvHeaders().join(',').split('\n'),
      ...[
        ...healthyRows,
        ...missingTierRows,
        ...priceInversionRows,
        ...duplicateRows,
        lowConfidenceRow,
        missingSourceRow,
      ].map((row) =>
        ManualLowesCatalogPipelineService.getCsvHeaders()
          .map((header) => {
            const value = row[header];
            const stringValue = String(value ?? '');
            if (
              stringValue.includes(',') ||
              stringValue.includes('"') ||
              stringValue.includes('\n')
            ) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(',')
      ),
    ].join('\n');

    await CatalogImportService.importCsv(orgId, manualLowesSeedCsv, categories);

    const refreshedItems = await CatalogService.getItems(orgId);
    const seededImportedItems = refreshedItems.filter(
      (item) =>
        (item.importSource === 'text_paste' || item.importSource === 'manual_lowes') &&
        !item.seedMarker?.isSeedData
    );

    for (const item of seededImportedItems) {
      const updated = await CatalogService.updateItem(orgId, item.id, {
        seedMarker,
        updatedBy: userId,
      });
      created.push(updated);
    }

    return created;
  }

  private static async seedScopedOverrides(orgId: string) {
    const note = `${OVERRIDE_NOTE_MARKER} ${this.SEED_BATCH}`;
    return Promise.all([
      ChecklistScopedOverrideService.create({
        organizationId: orgId,
        scopeType: 'organization',
        scopeRefId: orgId,
        templateItemId: 'recipe-standard-smoke-detector-batteries',
        actionMode: 'always_replace',
        preferredReplaceOption: 'Replace batteries during every turn',
        preferredProductTier: 'mid',
        notes: `${note} Organization safety baseline.`,
      }),
      ChecklistScopedOverrideService.create({
        organizationId: orgId,
        scopeType: 'organization',
        scopeRefId: orgId,
        templateItemId: 'recipe-bedroom-blinds',
        actionMode: 'inspect',
        preferredReplaceOption: 'Inspect blinds unless narrower scope overrides replace them',
        preferredProductTier: 'mid',
        notes: `${note} Baseline inspect-first for blinds.`,
      }),
      ChecklistScopedOverrideService.create({
        organizationId: orgId,
        scopeType: 'property',
        scopeRefId: 'Maple Ridge Apartments',
        templateItemId: 'recipe-bedroom-blinds',
        actionMode: 'always_replace',
        preferredReplaceOption: 'Maple Ridge standard cordless blind replacement',
        preferredProductTier: 'mid',
        notes: `${note} Property override for Maple Ridge blinds.`,
      }),
      ChecklistScopedOverrideService.create({
        organizationId: orgId,
        scopeType: 'unit',
        scopeRefId: 'will-be-rebound',
        templateItemId: 'recipe-bedroom-blinds',
        actionMode: 'inspect',
        preferredReplaceOption: 'Unit-specific inspect-first blind rule for review path demo',
        preferredProductTier: 'mid',
        notes: `${note} Placeholder; rebound after unit creation.`,
      }),
      ChecklistScopedOverrideService.create({
        organizationId: orgId,
        scopeType: 'unit',
        scopeRefId: 'will-be-rebound-flooring',
        templateItemId: 'recipe-living-room-flooring-replace',
        actionMode: 'always_replace',
        preferredReplaceOption: 'Always replace living room flooring in this unit',
        preferredProductTier: 'mid',
        notes: `${note} Placeholder flooring override; rebound after unit creation.`,
      }),
    ]);
  }

  private static async rebindUnitOverrides(orgId: string, unit: Unit, createdOverrides: Awaited<ReturnType<typeof DevSeedService.seedScopedOverrides>>) {
    for (const override of createdOverrides) {
      if (override.scopeType !== 'unit') continue;
      if (override.scopeRefId === 'will-be-rebound' && unit.unitCode === 'MR-B-202') {
        await ChecklistScopedOverrideService.update({ ...override, scopeRefId: unit.id });
      }
      if (override.scopeRefId === 'will-be-rebound-flooring' && unit.unitCode === 'LV-D-220') {
        await ChecklistScopedOverrideService.update({ ...override, scopeRefId: unit.id });
      }
    }
    // Keep storage aligned when multiple units are created after the placeholder override objects were updated.
    if (unit.unitCode === 'MR-B-202' || unit.unitCode === 'LV-D-220') {
      return;
    }
    await ChecklistScopedOverrideService.listAll(orgId);
  }

  private static async seedInspectionScenario(params: {
    orgId: string;
    userId: string;
    unit: Unit;
    presetId?: TurnoverPresetId;
    scenario: UnitScenario;
    catalog: CatalogIndexes;
  }): Promise<Inspection> {
    const generation = await InspectionTemplateGenerationService.generateFromLayout({
      layoutTemplateId: params.unit.assignedLayoutTemplateId || '',
      orgId: params.orgId,
      turnoverPresetId: params.presetId || null,
      unit: params.unit,
    });

    let inspection = await InspectionService.createInspection(
      params.orgId,
      params.unit.id,
      `Turnover Demo • ${params.unit.unitCode || params.unit.name}`,
      params.userId,
      {
        notes: `Seeded ${params.scenario.replace(/_/g, ' ')} inspection for deterministic demo coverage.`,
        templateSnapshot: generation.snapshot,
        generatedSections: generation.sections,
        generatedItems: generation.items,
      }
    );

    inspection = {
      ...inspection,
      status: params.scenario.includes('completed') || params.scenario === 'standard_review' ? 'completed' : 'in_progress',
      seedMarker: this.buildSeedMarker(),
      notes: `Seeded ${params.scenario.replace(/_/g, ' ')} inspection with downstream materials, bundles, and product resolution.`,
    };

    const context: InspectionBuildContext = {
      orgId: params.orgId,
      userId: params.userId,
      unit: params.unit,
      presetId: params.presetId,
      inspection,
      catalog: params.catalog,
    };

    switch (params.scenario) {
      case 'luxury_in_progress':
        inspection = await this.seedLuxuryInProgress(context);
        break;
      case 'budget_completed':
        inspection = await this.seedBudgetCompleted(context);
        break;
      case 'standard_review':
        inspection = await this.seedStandardReview(context);
        break;
      case 'standard_in_progress':
        inspection = await this.seedStandardInProgress(context);
        break;
      case 'luxury_completed':
        inspection = await this.seedLuxuryCompleted(context);
        break;
      case 'override_in_progress':
        inspection = await this.seedOverrideInProgress(context);
        break;
      default:
        break;
    }

    await InspectionService.updateInspection(params.orgId, syncInspectionSections(inspection), params.userId);
    return syncInspectionSections(inspection);
  }

  private static async captureAlwaysReplace(
    inspection: Inspection,
    context: InspectionBuildContext,
    capture: AlwaysReplaceCapture
  ): Promise<Inspection> {
    const { section, item } = findSectionAndItem(inspection, capture.templateItemId, capture.roomIncludes);
    const nextItem: GeneratedInspectionItem = {
      ...item,
      inputValue: capture.quantity
        ? { quantity: capture.quantity, updatedAt: Date.now() }
        : capture.area
          ? { area: capture.area, updatedAt: Date.now() }
          : capture.dimensions
            ? { dimensions: { ...capture.dimensions }, updatedAt: Date.now() }
            : item.inputValue,
      notes: capture.notes,
      updatedAt: Date.now(),
    };
    const { task, requirement } = await ChecklistAlwaysReplaceService.commitItem({
      orgId: context.orgId,
      userId: context.userId,
      inspectionId: inspection.id,
      unitId: context.unit.id,
      section,
      item: nextItem,
    });

    return syncInspectionSections(
      setGeneratedItemState(inspection, {
        ...nextItem,
        status: 'completed',
        completedAt: Date.now(),
        repairTaskIds: Array.from(new Set([...(nextItem.repairTaskIds || []), task.id])),
        materialRequirementIds: Array.from(new Set([...(nextItem.materialRequirementIds || []), requirement.id])),
      })
    );
  }

  private static async captureOutletCoverTallies(
    inspection: Inspection,
    context: InspectionBuildContext,
    quantitiesByRoom: Record<string, number>,
    notes?: string
  ): Promise<Inspection> {
    let nextInspection = inspection;
    const outletCoverItems = (inspection.generatedSections || []).flatMap((section) =>
      (section.items || [])
        .filter((item) => item.itemType === 'always_replace' && item.label === 'Outlet covers')
        .map((item) => ({
          section,
          item,
        }))
    );

    for (const { item } of outletCoverItems) {
      const roomLabel = item.roomLabel || '';
      const quantity = quantitiesByRoom[roomLabel] ?? item.defaultQuantity ?? 1;
      nextInspection = await this.captureAlwaysReplace(nextInspection, context, {
        templateItemId: item.sourceTemplateItemId,
        roomIncludes: roomLabel,
        quantity,
        notes,
      });
    }

    return nextInspection;
  }

  private static async captureConditionItem(
    inspection: Inspection,
    context: InspectionBuildContext,
    capture: ConditionCapture
  ): Promise<Inspection> {
    const { item } = findSectionAndItem(inspection, capture.templateItemId, capture.roomIncludes);
    const finding = await FindingService.createFinding(
      context.orgId,
      {
        orgId: context.orgId,
        inspectionId: inspection.id,
        unitId: context.unit.id,
        area: capture.finding.area,
        category: capture.finding.category,
        severity: capture.finding.severity,
        priority: capture.finding.priority,
        status: capture.finding.status,
        description: capture.finding.description,
        notes: capture.finding.notes,
        recommendedTrade: capture.finding.recommendedTrade,
        photoIds: [],
        metadata: {
          seedBatch: this.SEED_BATCH,
          sourceGeneratedItemId: item.id,
          sourceTemplateItemId: item.sourceTemplateItemId,
        },
      },
      context.userId
    );

    const task = await RepairTaskService.createTask(
      context.orgId,
      {
        orgId: context.orgId,
        inspectionId: inspection.id,
        unitId: context.unit.id,
        findingIds: [finding.id],
        title: capture.task.title,
        trade: capture.task.trade,
        priority: capture.task.priority,
        status: capture.task.status,
        estimatedEffortMinutes: capture.task.estimatedEffortMinutes,
        notes: capture.task.notes,
        metadata: {
          seedBatch: this.SEED_BATCH,
          sourceGeneratedItemId: item.id,
          roomLabel: item.roomLabel,
        },
      },
      context.userId
    );

    const selectedMatch = capture.requirement.selectedItemTitle || capture.requirement.selectedEquivalentGroup
      ? toSelectedMatch(
          findCatalogItem(context.catalog, {
            title: capture.requirement.selectedItemTitle,
            equivalentGroup: capture.requirement.selectedEquivalentGroup,
            preferredTier: capture.requirement.selectedTier,
          }),
          capture.requirement.selectedTier,
          ['Seeded from deterministic demo capture.']
        )
      : undefined;

    const requirement = await MaterialRequirementService.createRequirement(
      context.orgId,
      {
        orgId: context.orgId,
        inspectionId: inspection.id,
        repairTaskId: task.id,
        category: capture.requirement.category,
        itemDescription: capture.requirement.itemDescription,
        quantity: capture.requirement.quantity,
        unit: capture.requirement.unit,
        confidence: 'high',
        source: 'manual',
        status: capture.requirement.status,
        notes: capture.requirement.notes,
        roomLabel: item.roomLabel,
        sourceFindingId: finding.id,
        sourceGeneratedItemId: item.id,
        selectedMatch,
        procurementState: capture.requirement.procurementState,
        vendorActionState: capture.requirement.vendorActionState,
        verificationStatus: capture.requirement.verificationStatus,
        assignedVendorUserId: capture.requirement.assignedVendorUserId,
        assignedVendorDisplayName: capture.requirement.assignedVendorDisplayName,
        metadata: {
          seedBatch: this.SEED_BATCH,
          sourceGeneratedItemId: item.id,
          sourceTemplateItemId: item.sourceTemplateItemId,
        },
      },
      context.userId
    );

    return syncInspectionSections(
      setGeneratedItemState(inspection, {
        ...item,
        status: capture.itemStatus || 'completed',
        focusedAction: capture.focusedAction,
        notes: capture.notes || item.notes,
        updatedAt: Date.now(),
        completedAt: Date.now(),
        findingIds: Array.from(new Set([...(item.findingIds || []), finding.id])),
        repairTaskIds: Array.from(new Set([...(item.repairTaskIds || []), task.id])),
        materialRequirementIds: Array.from(new Set([...(item.materialRequirementIds || []), requirement.id])),
      })
    );
  }

  private static async seedLuxuryInProgress(context: InspectionBuildContext): Promise<Inspection> {
    let inspection = context.inspection;
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-air-filter', quantity: 1, notes: 'Luxury unit still replaces filter proactively.' });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-smoke-detector-batteries', quantity: 3, notes: 'Detector count reflects bedroom plus common area coverage.' });
    inspection = await this.captureOutletCoverTallies(
      inspection,
      context,
      { 'Living Room': 2, Kitchen: 2, 'Bedroom 1': 1, Bathroom: 1 },
      'Electrical refresh bundle should optimize this pack quantity.'
    );
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-bedroom-blinds', roomIncludes: 'Bedroom 1', dimensions: { width: 35, height: 64, unit: 'in' }, notes: 'Property override makes blinds always replace at Maple Ridge.' });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-living-room-walls',
      roomIncludes: 'Living Room',
      focusedAction: 'replace',
      finding: {
        area: 'Living Room wall finish',
        category: 'paint',
        severity: 'moderate',
        priority: 'medium',
        status: 'reviewed',
        description: 'Living room walls need a premium repaint for visible scuffs and sheen mismatch.',
        recommendedTrade: 'paint',
      },
      task: {
        title: 'Repaint living room walls',
        trade: 'paint',
        priority: 'medium',
        status: 'ready',
        estimatedEffortMinutes: 180,
      },
      requirement: {
        category: 'paint',
        itemDescription: 'Premium interior wall paint',
        quantity: 2,
        unit: 'gal',
        status: 'reviewed',
        selectedEquivalentGroup: 'wall-paint-turnover',
        selectedTier: Tier.PREMIUM,
        notes: 'Luxury preset should bias product resolution toward premium paint.',
      },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bathroom-sink',
      roomIncludes: 'Bathroom',
      focusedAction: 'replace',
      finding: {
        area: 'Bathroom vanity',
        category: 'fixture',
        severity: 'moderate',
        priority: 'high',
        status: 'reviewed',
        description: 'Bathroom sink fixture has finish wear and loose handle action.',
        recommendedTrade: 'fixture',
      },
      task: {
        title: 'Refresh bathroom fixture package',
        trade: 'fixture',
        priority: 'high',
        status: 'ready',
        estimatedEffortMinutes: 90,
      },
      requirement: {
        category: 'bathroom',
        itemDescription: 'Bathroom fixture refresh kit',
        quantity: 1,
        unit: 'kit',
        status: 'planned',
        selectedEquivalentGroup: 'bathroom-fixture-kit',
        selectedTier: Tier.PREMIUM,
        procurementState: 'activated',
        notes: 'Bathroom refresh should also leave one bundle line manual-needed for accessories.',
      },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-living-room-lighting',
      roomIncludes: 'Living Room',
      focusedAction: 'replace',
      finding: {
        area: 'Living Room lighting',
        category: 'electrical',
        severity: 'minor',
        priority: 'medium',
        status: 'reviewed',
        description: 'Lighting trim and device hardware need refresh to match the luxury turn standard.',
        recommendedTrade: 'electrical',
      },
      task: {
        title: 'Refresh electrical trim hardware',
        trade: 'electrical',
        priority: 'medium',
        status: 'ready',
        estimatedEffortMinutes: 60,
      },
      requirement: {
        category: 'electrical',
        itemDescription: 'Electrical refresh hardware kit',
        quantity: 1,
        unit: 'kit',
        status: 'planned',
        selectedEquivalentGroup: 'electrical-refresh-kit',
        selectedTier: Tier.STANDARD,
        notes: 'Pair with outlet cover counts for electrical refresh bundle coverage.',
      },
    });
    return inspection;
  }

  private static async seedBudgetCompleted(context: InspectionBuildContext): Promise<Inspection> {
    let inspection = context.inspection;
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-air-filter', quantity: 1 });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-smoke-detector-batteries', quantity: 4 });
    inspection = await this.captureOutletCoverTallies(inspection, context, {
      'Living Room': 2,
      Kitchen: 2,
      'Bedroom 1': 1,
      'Bedroom 2': 1,
      Bathroom: 1,
    });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-bedroom-blinds', roomIncludes: 'Bedroom 1', dimensions: { width: 34, height: 64, unit: 'in' }, notes: 'Maple Ridge property override still replaces blinds on budget turns.' });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bedroom-flooring',
      roomIncludes: 'Bedroom 1',
      focusedAction: 'replace',
      finding: { area: 'Bedroom 1 carpet', category: 'flooring', severity: 'major', priority: 'high', status: 'resolved', description: 'Carpet shows wear pathing and pet staining.', recommendedTrade: 'flooring' },
      task: { title: 'Replace carpet in Bedroom 1', trade: 'flooring', priority: 'high', status: 'done', estimatedEffortMinutes: 160 },
      requirement: { category: 'flooring', itemDescription: 'Budget carpet replacement', quantity: 120, unit: 'sq_ft', status: 'fulfilled', selectedEquivalentGroup: 'carpet-flooring', selectedTier: Tier.BUDGET, procurementState: 'fulfilled', verificationStatus: 'verified', notes: 'Bedroom 1 carpet replacement complete.' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bedroom-flooring',
      roomIncludes: 'Bedroom 2',
      focusedAction: 'replace',
      finding: { area: 'Bedroom 2 carpet', category: 'flooring', severity: 'moderate', priority: 'medium', status: 'resolved', description: 'Secondary bedroom carpet had bleach spotting.', recommendedTrade: 'flooring' },
      task: { title: 'Replace carpet in Bedroom 2', trade: 'flooring', priority: 'medium', status: 'done', estimatedEffortMinutes: 120 },
      requirement: { category: 'flooring', itemDescription: 'Budget carpet replacement', quantity: 96, unit: 'sq_ft', status: 'fulfilled', selectedEquivalentGroup: 'carpet-flooring', selectedTier: Tier.BUDGET, procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-general-condition-doors',
      focusedAction: 'replace',
      finding: { area: 'Interior door hardware', category: 'fixture', severity: 'moderate', priority: 'medium', status: 'resolved', description: 'Interior passage knobs were mismatched and loose.', recommendedTrade: 'finish' },
      task: { title: 'Replace interior passage hardware', trade: 'finish', priority: 'medium', status: 'done' },
      requirement: { category: 'finish', itemDescription: 'Basic passage knob pack', quantity: 3, unit: 'ea', status: 'fulfilled', selectedEquivalentGroup: 'passage-hardware', selectedTier: Tier.BUDGET, procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bathroom-toilet',
      roomIncludes: 'Bathroom',
      focusedAction: 'replace',
      finding: { area: 'Bathroom fixture set', category: 'fixture', severity: 'moderate', priority: 'medium', status: 'resolved', description: 'Bathroom fixture package refreshed during turn completion.', recommendedTrade: 'fixture' },
      task: { title: 'Refresh bathroom fixture package', trade: 'fixture', priority: 'medium', status: 'done' },
      requirement: { category: 'bathroom', itemDescription: 'Bathroom fixture refresh kit', quantity: 1, unit: 'kit', status: 'fulfilled', selectedEquivalentGroup: 'bathroom-fixture-kit', procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-general-condition-walls',
      focusedAction: 'repair',
      finding: { area: 'General wall surfaces', category: 'paint', severity: 'minor', priority: 'medium', status: 'resolved', description: 'Patch and paint completed for turn-ready finish.', recommendedTrade: 'paint' },
      task: { title: 'Complete paint turnover touch-ups', trade: 'paint', priority: 'medium', status: 'done' },
      requirement: { category: 'paint', itemDescription: 'Standard interior wall paint', quantity: 1, unit: 'gal', status: 'fulfilled', selectedEquivalentGroup: 'wall-paint-turnover', selectedTier: Tier.STANDARD, procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    return touchUnresolvedItemsForCompletedInspection(inspection);
  }

  private static async seedStandardReview(context: InspectionBuildContext): Promise<Inspection> {
    let inspection = context.inspection;
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-air-filter', quantity: 1 });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-smoke-detector-batteries', quantity: 4 });
    inspection = await this.captureOutletCoverTallies(inspection, context, {
      'Living Room': 2,
      Kitchen: 2,
      'Bedroom 1': 1,
      'Bedroom 2': 1,
      Bathroom: 1,
      'Half Bath': 1,
    });
    inspection = await this.captureAlwaysReplace(inspection, context, {
      templateItemId: 'recipe-living-room-flooring-replace',
      roomIncludes: 'Living Room',
      area: 310,
      notes: 'Standard preset still drives living room flooring replacement by default.',
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bedroom-blinds',
      roomIncludes: 'Bedroom 1',
      focusedAction: 'replace',
      finding: { area: 'Bedroom 1 blind', category: 'fixture', severity: 'moderate', priority: 'medium', status: 'resolved', description: 'Unit-specific override made blinds inspect-first, but this room still needed replacement.', recommendedTrade: 'finish' },
      task: { title: 'Replace Bedroom 1 blinds', trade: 'finish', priority: 'medium', status: 'done' },
      requirement: { category: 'window_coverings', itemDescription: 'Standard cordless blind', quantity: 1, unit: 'ea', status: 'fulfilled', selectedEquivalentGroup: 'blind-set', selectedTier: Tier.STANDARD, procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bathroom-ventilation',
      roomIncludes: 'Bathroom 1',
      focusedAction: 'replace',
      finding: { area: 'Bathroom 1 ventilation', category: 'fixture', severity: 'moderate', priority: 'medium', status: 'resolved', description: 'Bathroom ventilation replacement folded into refresh scope.', recommendedTrade: 'fixture' },
      task: { title: 'Refresh bathroom ventilation package', trade: 'fixture', priority: 'medium', status: 'done' },
      requirement: { category: 'bathroom', itemDescription: 'Bathroom fixture refresh kit', quantity: 1, unit: 'kit', status: 'fulfilled', selectedEquivalentGroup: 'bathroom-fixture-kit', procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-living-room-lighting',
      roomIncludes: 'Living Room',
      focusedAction: 'replace',
      finding: { area: 'Living room electrical trim', category: 'electrical', severity: 'minor', priority: 'medium', status: 'resolved', description: 'Electrical trim refreshed during completed turnover review.', recommendedTrade: 'electrical' },
      task: { title: 'Complete electrical trim refresh', trade: 'electrical', priority: 'medium', status: 'done' },
      requirement: { category: 'electrical', itemDescription: 'Electrical refresh hardware kit', quantity: 1, unit: 'kit', status: 'fulfilled', selectedEquivalentGroup: 'electrical-refresh-kit', procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-general-condition-walls',
      focusedAction: 'repair',
      finding: { area: 'General wall surfaces', category: 'paint', severity: 'minor', priority: 'low', status: 'resolved', description: 'Wall repaint packaged into review-ready final scope.', recommendedTrade: 'paint' },
      task: { title: 'Complete final paint turnover', trade: 'paint', priority: 'low', status: 'done' },
      requirement: { category: 'paint', itemDescription: 'Standard interior wall paint', quantity: 2, unit: 'gal', status: 'fulfilled', selectedEquivalentGroup: 'wall-paint-turnover', selectedTier: Tier.STANDARD, procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    return touchUnresolvedItemsForCompletedInspection(inspection);
  }

  private static async seedStandardInProgress(context: InspectionBuildContext): Promise<Inspection> {
    let inspection = context.inspection;
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-air-filter', quantity: 1 });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-smoke-detector-batteries', quantity: 2 });
    inspection = await this.captureOutletCoverTallies(inspection, context, {
      'Living Space': 2,
      Kitchen: 1,
      Bathroom: 1,
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-general-condition-walls',
      focusedAction: 'repair',
      itemStatus: 'in_progress',
      finding: { area: 'Studio wall finish', category: 'paint', severity: 'minor', priority: 'medium', status: 'reviewed', description: 'Studio walls need one final paint pass before completion.', recommendedTrade: 'paint' },
      task: { title: 'Finish studio paint turnover', trade: 'paint', priority: 'medium', status: 'in_progress', estimatedEffortMinutes: 90 },
      requirement: { category: 'paint', itemDescription: 'Standard interior wall paint', quantity: 1, unit: 'gal', status: 'planned', selectedEquivalentGroup: 'wall-paint-turnover', selectedTier: Tier.STANDARD },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bathroom-shower',
      roomIncludes: 'Bathroom',
      focusedAction: 'replace',
      finding: { area: 'Studio bathroom shower trim', category: 'fixture', severity: 'moderate', priority: 'medium', status: 'reviewed', description: 'Bathroom shower trim and sealant need refresh.', recommendedTrade: 'fixture' },
      task: { title: 'Refresh bathroom fixture package', trade: 'fixture', priority: 'medium', status: 'ready' },
      requirement: { category: 'bathroom', itemDescription: 'Bathroom fixture refresh kit', quantity: 1, unit: 'kit', status: 'reviewed', selectedEquivalentGroup: 'bathroom-fixture-kit' },
    });
    return inspection;
  }

  private static async seedLuxuryCompleted(context: InspectionBuildContext): Promise<Inspection> {
    let inspection = context.inspection;
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-air-filter', quantity: 1 });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-smoke-detector-batteries', quantity: 4 });
    inspection = await this.captureOutletCoverTallies(inspection, context, {
      'Living Room': 2,
      Kitchen: 2,
      'Bedroom 1': 1,
      'Bedroom 2': 1,
      'Bathroom 1': 1,
      'Bathroom 2': 1,
    });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-bedroom-blinds', roomIncludes: 'Bedroom 1', dimensions: { width: 36, height: 64, unit: 'in' } });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-living-room-flooring-replace', roomIncludes: 'Living Room', area: 260, notes: 'Luxury preset drives premium flooring replacement.' });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-general-condition-doors',
      focusedAction: 'replace',
      finding: { area: 'Interior doors', category: 'fixture', severity: 'moderate', priority: 'medium', status: 'resolved', description: 'Door hardware package upgraded during completed luxury turn.', recommendedTrade: 'finish' },
      task: { title: 'Install premium passage hardware', trade: 'finish', priority: 'medium', status: 'done' },
      requirement: { category: 'finish', itemDescription: 'Premium passage hardware pack', quantity: 4, unit: 'ea', status: 'fulfilled', selectedEquivalentGroup: 'passage-hardware', selectedTier: Tier.PREMIUM, procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-living-room-lighting',
      roomIncludes: 'Living Room',
      focusedAction: 'replace',
      finding: { area: 'Living room electrical trim', category: 'electrical', severity: 'minor', priority: 'medium', status: 'resolved', description: 'Electrical trim refreshed to match luxury package.', recommendedTrade: 'electrical' },
      task: { title: 'Complete electrical trim refresh', trade: 'electrical', priority: 'medium', status: 'done' },
      requirement: { category: 'electrical', itemDescription: 'Electrical refresh hardware kit', quantity: 1, unit: 'kit', status: 'fulfilled', selectedEquivalentGroup: 'electrical-refresh-kit', procurementState: 'fulfilled', verificationStatus: 'verified' },
    });
    return touchUnresolvedItemsForCompletedInspection(inspection);
  }

  private static async seedOverrideInProgress(context: InspectionBuildContext): Promise<Inspection> {
    let inspection = context.inspection;
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-air-filter', quantity: 1 });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-standard-smoke-detector-batteries', quantity: 4 });
    inspection = await this.captureOutletCoverTallies(inspection, context, {
      'Living Room': 2,
      Kitchen: 2,
      'Bedroom 1': 1,
      'Bedroom 2': 1,
      'Bedroom 3': 1,
      'Bathroom 1': 1,
      'Bathroom 2': 2,
    });
    inspection = await this.captureAlwaysReplace(inspection, context, { templateItemId: 'recipe-living-room-flooring-replace', roomIncludes: 'Living Room', area: 340, notes: 'Unit override forces this flooring line into always-replace.' });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bedroom-flooring',
      roomIncludes: 'Bedroom 2',
      focusedAction: 'replace',
      finding: { area: 'Bedroom 2 carpet', category: 'flooring', severity: 'major', priority: 'high', status: 'reviewed', description: 'Bedroom 2 carpet requires replacement for deep staining.', recommendedTrade: 'flooring' },
      task: { title: 'Replace carpet in Bedroom 2', trade: 'flooring', priority: 'high', status: 'ready' },
      requirement: { category: 'flooring', itemDescription: 'Budget carpet replacement', quantity: 130, unit: 'sq_ft', status: 'planned', selectedEquivalentGroup: 'carpet-flooring', selectedTier: Tier.BUDGET },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-bathroom-flooring',
      roomIncludes: 'Bathroom 1',
      focusedAction: 'replace',
      finding: { area: 'Bathroom 1 flooring and trim', category: 'fixture', severity: 'moderate', priority: 'medium', status: 'reviewed', description: 'Bathroom refresh scope includes flooring and accessory allowance.', recommendedTrade: 'fixture' },
      task: { title: 'Refresh bathroom finish package', trade: 'fixture', priority: 'medium', status: 'ready' },
      requirement: { category: 'bathroom', itemDescription: 'Bathroom fixture refresh kit', quantity: 1, unit: 'kit', status: 'reviewed', selectedEquivalentGroup: 'bathroom-fixture-kit' },
    });
    inspection = await this.captureConditionItem(inspection, context, {
      templateItemId: 'recipe-general-condition-walls',
      focusedAction: 'repair',
      finding: { area: 'General wall finish', category: 'paint', severity: 'minor', priority: 'medium', status: 'reviewed', description: 'Walls need paint turnover after flooring work.', recommendedTrade: 'paint' },
      task: { title: 'Hold wall paint turnover', trade: 'paint', priority: 'medium', status: 'blocked' },
      requirement: { category: 'paint', itemDescription: 'Standard interior wall paint', quantity: 2, unit: 'gal', status: 'reviewed', selectedEquivalentGroup: 'wall-paint-turnover' },
    });
    return inspection;
  }

  private static async createProcurementDrafts(orgId: string, inspections: Inspection[]): Promise<void> {
    const requirementsByInspection = new Map<string, MaterialRequirement[]>();
    for (const inspection of inspections) {
      requirementsByInspection.set(
        inspection.id,
        await MaterialRequirementService.listRequirements(orgId, { inspectionId: inspection.id })
      );
    }

    const draftPlans: Array<{
      unitCode: string;
      status: ProcurementDraftStatus;
      annotation: string;
      attachmentMode: 'attached' | 'recommended' | 'manual' | 'mixed';
      promotionMode: 'none' | 'one' | 'many';
    }> = [
      {
        unitCode: 'MR-A-102',
        status: 'planned',
        annotation: 'Luxury turn draft includes premium bundle recommendations and alternates.',
        attachmentMode: 'mixed',
        promotionMode: 'one',
      },
      {
        unitCode: 'MR-B-201',
        status: 'quoted',
        annotation: 'Budget turn draft mixes fulfilled scope history with remaining review lines.',
        attachmentMode: 'attached',
        promotionMode: 'many',
      },
      {
        unitCode: 'MR-B-202',
        status: 'ordered',
        annotation: 'Review-ready draft highlights blinds precedence and LVP product resolution.',
        attachmentMode: 'recommended',
        promotionMode: 'none',
      },
      {
        unitCode: 'LV-D-220',
        status: 'draft',
        annotation: 'Override demo draft shows unit-specific flooring replacement driving bundles.',
        attachmentMode: 'manual',
        promotionMode: 'none',
      },
    ];

    for (const plan of draftPlans) {
      const inspection = inspections.find((entry) => entry.title.endsWith(plan.unitCode));
      if (!inspection) continue;
      const requirements = (requirementsByInspection.get(inspection.id) || []).filter((requirement) => requirement.quantity > 0);
      if (requirements.length === 0) continue;
      const draft = await ProcurementDraftService.createFromRequirements({
        orgId,
        name: `${DEMO_DRAFT_PREFIX}${plan.unitCode}`,
        requirements,
      });
      await ProcurementDraftService.updateStatus(orgId, draft.id, plan.status);
      await ProcurementDraftService.updateManualAnnotation(orgId, draft.id, plan.annotation);
      const refreshedDraft = await ProcurementDraftService.refreshIntelligence(orgId, draft.id);
      const resolvedAttachments = refreshedDraft.recommendationAttachments || [];
      const resolvedProductAttachments = resolvedAttachments.filter((attachment) => attachment.productId);
      const manualAttachments = resolvedAttachments.filter((attachment) => attachment.attachmentState === 'manual_needed');

      if (plan.attachmentMode === 'attached') {
        for (const attachment of resolvedProductAttachments) {
          await ProcurementDraftService.updateRecommendationAttachmentState(orgId, refreshedDraft.id, attachment.id, 'attached');
        }
      } else if (plan.attachmentMode === 'manual') {
        if (manualAttachments.length === 0 && resolvedProductAttachments.length > 0) {
          await ProcurementDraftService.updateRecommendationAttachmentState(
            orgId,
            refreshedDraft.id,
            resolvedProductAttachments[0].id,
            'recommended'
          );
        }
      } else if (plan.attachmentMode === 'mixed') {
        if (resolvedProductAttachments[0]) {
          await ProcurementDraftService.updateRecommendationAttachmentState(
            orgId,
            refreshedDraft.id,
            resolvedProductAttachments[0].id,
            'attached'
          );
        }
        if (resolvedProductAttachments[1]) {
          await ProcurementDraftService.updateRecommendationAttachmentState(
            orgId,
            refreshedDraft.id,
            resolvedProductAttachments[1].id,
            'recommended'
          );
        }
      }

      const draftAfterAttachment = await ProcurementDraftService.listDrafts(orgId).then((drafts) =>
        drafts.find((entry) => entry.id === refreshedDraft.id)
      );
      const attachedAttachments = (draftAfterAttachment?.recommendationAttachments || []).filter(
        (attachment) => attachment.attachmentState === 'attached' && attachment.productId
      );

      if (plan.promotionMode === 'many') {
        for (const attachment of attachedAttachments) {
          await ProcurementDraftService.promoteAttachmentToDraftLine(orgId, refreshedDraft.id, attachment.id);
        }
      } else if (plan.promotionMode === 'one' && attachedAttachments[0]) {
        await ProcurementDraftService.promoteAttachmentToDraftLine(orgId, refreshedDraft.id, attachedAttachments[0].id);
      }
    }
  }

  private static async createReports(orgId: string, userId: string, inspections: Inspection[]): Promise<void> {
    for (const inspection of inspections) {
      if (inspection.status !== 'completed') continue;
      await ReportService.createReportRequest({
        orgId,
        inspectionId: inspection.id,
        userId,
        options: {
          includePhotos: false,
          includeCosts: true,
          photoLayout: 'grid',
        },
      });
    }
  }

  private static dispatchRefreshEvent(detail: {
    orgId: string;
    userId: string;
    action: 'seeded' | 'cleared';
    summary: SeedSummary;
  }) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent(this.REFRESH_EVENT, {
        detail,
      })
    );
  }
}
