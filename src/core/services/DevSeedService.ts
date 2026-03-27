import {
  ApplianceLogEntry,
  Inspection,
  KeyLogEntry,
  MaintenanceEntry,
  SeedMarker,
  Unit,
  UnitManagementData,
  WarrantyEntry,
} from '../models/inspections';
import {
  Finding,
  FindingCategory,
  FindingPriority,
  FindingSeverity,
  FindingStatus,
  MaterialCloseoutIssueState,
  MaterialProcurementState,
  MaterialRequirementStatus,
  MaterialVerificationStatus,
  MaterialVendorActionState,
  RepairTaskStatus,
  TradeOption,
} from '../models/operations';
import { SelectedProcurementOption } from '../models/procurement';
import { CatalogItem, Tier } from '../models/types';
import { CatalogService } from './CatalogService';
import { ClientLoggerService } from './ClientLoggerService';
import { FindingService } from './FindingService';
import { InspectionService } from './InspectionService';
import { LayoutTemplateService } from './LayoutTemplateService';
import { MaterialRequirementService } from './MaterialRequirementService';
import { RepairTaskService } from './RepairTaskService';
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

type ScenarioKey =
  | 'new_vacant'
  | 'clean_history'
  | 'faucet_active'
  | 'outlet_attention'
  | 'blinds_turn'
  | 'paint_closeout'
  | 'drywall_heavy'
  | 'filter_followup'
  | 'multi_history_turn';

interface UnitSeedRecord {
  name: string;
  unitCode: string;
  facilityName: string;
  buildingName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  managementData: UnitManagementData;
  scenarioKey: ScenarioKey;
}

interface ScenarioTaskSeed {
  title: string;
  trade: TradeOption;
  priority: FindingPriority;
  status: RepairTaskStatus;
  estimatedEffortMinutes?: number;
  notes?: string;
  findingIndex: number;
}

interface ScenarioMaterialSeed {
  category: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  status: MaterialRequirementStatus;
  selectedEquivalentGroup?: string;
  procurementState?: MaterialProcurementState;
  vendorActionState?: MaterialVendorActionState;
  verificationStatus?: MaterialVerificationStatus;
  closeoutIssueState?: MaterialCloseoutIssueState;
  assignedVendorUserId?: string;
  assignedVendorDisplayName?: string;
  notes?: string;
  roomLabel?: string;
  taskIndex: number;
}

interface ScenarioFindingSeed {
  area: string;
  category: FindingCategory;
  severity: FindingSeverity;
  priority: FindingPriority;
  status: FindingStatus;
  description: string;
  notes?: string;
  recommendedTrade: TradeOption;
}

interface ScenarioInspectionSeed {
  titleSuffix: string;
  status: Inspection['status'];
  notes: string;
  findingSeeds: ScenarioFindingSeed[];
  taskSeeds: ScenarioTaskSeed[];
  materialSeeds: ScenarioMaterialSeed[];
}

interface ScenarioDefinition {
  key: ScenarioKey;
  favoriteEquivalentGroups: string[];
  inspections: ScenarioInspectionSeed[];
}

const SCENARIO_ORDER: ScenarioKey[] = [
  'new_vacant',
  'clean_history',
  'faucet_active',
  'outlet_attention',
  'blinds_turn',
  'paint_closeout',
  'drywall_heavy',
  'filter_followup',
  'multi_history_turn',
];

const SCENARIO_DEFINITIONS: Record<ScenarioKey, ScenarioDefinition> = {
  new_vacant: {
    key: 'new_vacant',
    favoriteEquivalentGroups: ['hvac_filter_standard', 'smoke_detector_standard_battery'],
    inspections: [],
  },
  clean_history: {
    key: 'clean_history',
    favoriteEquivalentGroups: ['interior_wall_paint_touchup_neutral', 'trim_semigloss_white_standard'],
    inspections: [
      {
        titleSuffix: 'Move-in Baseline',
        status: 'completed',
        notes: 'Completed seeded baseline inspection with no remaining scope.',
        findingSeeds: [],
        taskSeeds: [],
        materialSeeds: [],
      },
    ],
  },
  faucet_active: {
    key: 'faucet_active',
    favoriteEquivalentGroups: ['bathroom_sink_faucet_standard'],
    inspections: [
      {
        titleSuffix: 'Archived Turn Record',
        status: 'completed',
        notes: 'Historical seeded inspection kept for lifecycle history.',
        findingSeeds: [],
        taskSeeds: [],
        materialSeeds: [],
      },
      {
        titleSuffix: 'Bathroom Plumbing Follow-up',
        status: 'in_progress',
        notes: 'Seeded active inspection for a bathroom faucet replacement.',
        findingSeeds: [
          {
            area: 'Bathroom vanity',
            category: 'plumbing',
            severity: 'moderate',
            priority: 'high',
            status: 'resolved',
            description: 'Bathroom faucet leaking at the sink fixture.',
            notes: 'Resident reports intermittent drip and loose handle movement.',
            recommendedTrade: 'plumbing',
          },
        ],
        taskSeeds: [
          {
            title: 'Repair plumbing fixture',
            trade: 'plumbing',
            priority: 'high',
            status: 'in_progress',
            estimatedEffortMinutes: 55,
            notes: 'Swap standard faucet assembly and test shutoff valves.',
            findingIndex: 0,
          },
        ],
        materialSeeds: [
          {
            category: 'Plumbing',
            itemDescription: 'Bathroom faucet replacement kit',
            quantity: 1,
            unit: 'ea',
            status: 'planned',
            selectedEquivalentGroup: 'bathroom_sink_faucet_standard',
            procurementState: 'ordered',
            vendorActionState: 'in_progress',
            assignedVendorUserId: 'local_user_val_vendor',
            assignedVendorDisplayName: 'Val Vendor',
            notes: 'Standard chrome faucet for vanity replacement.',
            roomLabel: 'Bathroom',
            taskIndex: 0,
          },
        ],
      },
    ],
  },
  outlet_attention: {
    key: 'outlet_attention',
    favoriteEquivalentGroups: ['duplex_outlet_standard_white', 'smoke_detector_standard_battery'],
    inspections: [
      {
        titleSuffix: 'Electrical Punch Review',
        status: 'draft',
        notes: 'Seeded attention case for a blocked outlet replacement.',
        findingSeeds: [
          {
            area: 'Kitchen backsplash',
            category: 'electrical',
            severity: 'major',
            priority: 'urgent',
            status: 'open',
            description: 'Kitchen outlet is cracked and trips when small appliances are plugged in.',
            notes: 'Hold for breaker panel verification before replacement.',
            recommendedTrade: 'electrical',
          },
        ],
        taskSeeds: [
          {
            title: 'Replace damaged receptacle',
            trade: 'electrical',
            priority: 'urgent',
            status: 'blocked',
            estimatedEffortMinutes: 45,
            notes: 'Needs breaker labeling confirmation before work starts.',
            findingIndex: 0,
          },
        ],
        materialSeeds: [
          {
            category: 'Electrical & Lighting',
            itemDescription: 'White duplex outlet 15A replacement',
            quantity: 1,
            unit: 'ea',
            status: 'reviewed',
            notes: 'Hold until electrician confirms circuit condition.',
            roomLabel: 'Kitchen',
            taskIndex: 0,
          },
        ],
      },
    ],
  },
  blinds_turn: {
    key: 'blinds_turn',
    favoriteEquivalentGroups: ['blind_white_35x64_standard'],
    inspections: [
      {
        titleSuffix: 'Bedroom Turn Progress',
        status: 'in_progress',
        notes: 'Seeded turn work for damaged window coverings.',
        findingSeeds: [
          {
            area: 'Primary bedroom window',
            category: 'fixture',
            severity: 'moderate',
            priority: 'medium',
            status: 'resolved',
            description: 'Bedroom blinds are bent and missing slats.',
            notes: 'Replace with standard white 35x64 blinds.',
            recommendedTrade: 'fixture',
          },
        ],
        taskSeeds: [
          {
            title: 'Install replacement blinds',
            trade: 'fixture',
            priority: 'medium',
            status: 'ready',
            estimatedEffortMinutes: 35,
            notes: 'Measure brackets before install and confirm anchor set.',
            findingIndex: 0,
          },
        ],
        materialSeeds: [
          {
            category: 'Windows & Coverings',
            itemDescription: 'White blind 35x64 standard replacement',
            quantity: 1,
            unit: 'ea',
            status: 'planned',
            selectedEquivalentGroup: 'blind_white_35x64_standard',
            procurementState: 'activated',
            vendorActionState: 'assigned',
            assignedVendorUserId: 'local_user_val_vendor',
            assignedVendorDisplayName: 'Val Vendor',
            notes: 'Common blind size for bedrooms and living rooms.',
            roomLabel: 'Bedroom',
            taskIndex: 0,
          },
        ],
      },
    ],
  },
  paint_closeout: {
    key: 'paint_closeout',
    favoriteEquivalentGroups: ['interior_wall_paint_touchup_neutral', 'trim_semigloss_white_standard'],
    inspections: [
      {
        titleSuffix: 'Move-out Paint Refresh',
        status: 'completed',
        notes: 'Seeded completed paint refresh with closed scope.',
        findingSeeds: [
          {
            area: 'Living room wall',
            category: 'paint',
            severity: 'minor',
            priority: 'medium',
            status: 'resolved',
            description: 'Living room wall scuffs required touch-up paint.',
            notes: 'Touch-up completed during turn prep.',
            recommendedTrade: 'paint',
          },
        ],
        taskSeeds: [
          {
            title: 'Touch up wall paint',
            trade: 'paint',
            priority: 'medium',
            status: 'done',
            estimatedEffortMinutes: 60,
            notes: 'Matched neutral eggshell wall paint.',
            findingIndex: 0,
          },
        ],
        materialSeeds: [
          {
            category: 'Interior Finishes',
            itemDescription: 'Neutral wall touch-up paint',
            quantity: 1,
            unit: 'gal',
            status: 'fulfilled',
            selectedEquivalentGroup: 'interior_wall_paint_touchup_neutral',
            procurementState: 'fulfilled',
            verificationStatus: 'verified',
            notes: 'Paint used and closed out in completed turn.',
            roomLabel: 'Living Room',
            taskIndex: 0,
          },
        ],
      },
    ],
  },
  drywall_heavy: {
    key: 'drywall_heavy',
    favoriteEquivalentGroups: ['drywall_patch_standard', 'interior_wall_paint_touchup_neutral'],
    inspections: [
      {
        titleSuffix: 'Heavy Turn Scope',
        status: 'in_progress',
        notes: 'Seeded heavy turn inspection with multiple open findings.',
        findingSeeds: [
          {
            area: 'Hallway wall',
            category: 'drywall',
            severity: 'major',
            priority: 'high',
            status: 'open',
            description: 'Drywall hole by hallway corner requires patching.',
            notes: 'Damage likely from furniture move-out.',
            recommendedTrade: 'drywall',
          },
          {
            area: 'Living room wall',
            category: 'paint',
            severity: 'moderate',
            priority: 'medium',
            status: 'reviewed',
            description: 'Wall scuffs and patch marks need paint touch-up after drywall repair.',
            notes: 'Coordinate paint after patch cure time.',
            recommendedTrade: 'paint',
          },
        ],
        taskSeeds: [
          {
            title: 'Patch damaged drywall',
            trade: 'drywall',
            priority: 'high',
            status: 'blocked',
            estimatedEffortMinutes: 90,
            notes: 'Awaiting moisture check before closing wall cavity.',
            findingIndex: 0,
          },
          {
            title: 'Touch up walls after repair',
            trade: 'paint',
            priority: 'medium',
            status: 'ready',
            estimatedEffortMinutes: 50,
            notes: 'Prep paint after drywall patch passes inspection.',
            findingIndex: 1,
          },
        ],
        materialSeeds: [
          {
            category: 'Interior Finishes',
            itemDescription: 'Drywall patch repair kit',
            quantity: 1,
            unit: 'kit',
            status: 'reviewed',
            notes: 'Hold until drywall opening is cleared.',
            roomLabel: 'Hallway',
            taskIndex: 0,
          },
          {
            category: 'Interior Finishes',
            itemDescription: 'Wall touch-up paint neutral eggshell',
            quantity: 1,
            unit: 'gal',
            status: 'planned',
            notes: 'Needed after patch repair is complete.',
            roomLabel: 'Living Room',
            taskIndex: 1,
          },
        ],
      },
    ],
  },
  filter_followup: {
    key: 'filter_followup',
    favoriteEquivalentGroups: ['hvac_filter_standard', 'smoke_detector_standard_battery'],
    inspections: [
      {
        titleSuffix: 'Maintenance Follow-up',
        status: 'in_progress',
        notes: 'Seeded HVAC follow-up inspection with light active work.',
        findingSeeds: [
          {
            area: 'Mechanical closet',
            category: 'appliance',
            severity: 'minor',
            priority: 'medium',
            status: 'resolved',
            description: 'HVAC filter is overdue for replacement and airflow is reduced.',
            notes: 'Install fresh filter and document size on mechanical panel.',
            recommendedTrade: 'appliance',
          },
        ],
        taskSeeds: [
          {
            title: 'Replace HVAC air filter',
            trade: 'appliance',
            priority: 'medium',
            status: 'ready',
            estimatedEffortMinutes: 20,
            notes: 'Confirm filter size from unit cheat sheet before install.',
            findingIndex: 0,
          },
        ],
        materialSeeds: [
          {
            category: 'Appliances',
            itemDescription: 'Standard HVAC filter replacement',
            quantity: 1,
            unit: 'ea',
            status: 'planned',
            notes: 'Use common filter size stocked for this unit type.',
            roomLabel: 'Mechanical Closet',
            taskIndex: 0,
          },
        ],
      },
    ],
  },
  multi_history_turn: {
    key: 'multi_history_turn',
    favoriteEquivalentGroups: ['bathroom_sink_faucet_standard', 'blind_white_35x64_standard', 'drywall_patch_standard'],
    inspections: [
      {
        titleSuffix: 'Archived Turn Archive',
        status: 'completed',
        notes: 'Historical seeded turn with all work closed out.',
        findingSeeds: [],
        taskSeeds: [],
        materialSeeds: [],
      },
      {
        titleSuffix: 'Current Full Turn',
        status: 'in_progress',
        notes: 'Seeded active full-turn inspection with multiple scope types.',
        findingSeeds: [
          {
            area: 'Bathroom vanity',
            category: 'plumbing',
            severity: 'moderate',
            priority: 'high',
            status: 'open',
            description: 'Bathroom faucet leaking at the sink fixture and finish is pitted.',
            notes: 'Replacement preferred over repair due to finish condition.',
            recommendedTrade: 'plumbing',
          },
          {
            area: 'Guest bedroom window',
            category: 'fixture',
            severity: 'moderate',
            priority: 'medium',
            status: 'reviewed',
            description: 'Bedroom blinds damaged and missing several slats.',
            notes: 'Match standard white blind used elsewhere in the portfolio.',
            recommendedTrade: 'fixture',
          },
          {
            area: 'Entry wall',
            category: 'drywall',
            severity: 'major',
            priority: 'high',
            status: 'reviewed',
            description: 'Drywall impact damage requires patch and paint.',
            notes: 'Prime before touch-up paint.',
            recommendedTrade: 'drywall',
          },
        ],
        taskSeeds: [
          {
            title: 'Replace vanity faucet',
            trade: 'plumbing',
            priority: 'high',
            status: 'ready',
            estimatedEffortMinutes: 60,
            notes: 'Use portfolio standard faucet where possible.',
            findingIndex: 0,
          },
          {
            title: 'Install bedroom blinds',
            trade: 'fixture',
            priority: 'medium',
            status: 'in_progress',
            estimatedEffortMinutes: 40,
            notes: 'Confirm bracket spacing from old blind before install.',
            findingIndex: 1,
          },
          {
            title: 'Patch and finish entry wall',
            trade: 'drywall',
            priority: 'high',
            status: 'ready',
            estimatedEffortMinutes: 120,
            notes: 'Patch, sand, prime, and coordinate paint touch-up.',
            findingIndex: 2,
          },
        ],
        materialSeeds: [
          {
            category: 'Plumbing',
            itemDescription: 'Bathroom faucet standard replacement',
            quantity: 1,
            unit: 'ea',
            status: 'planned',
            notes: 'Portfolio standard bathroom faucet group.',
            roomLabel: 'Bathroom',
            taskIndex: 0,
          },
          {
            category: 'Windows & Coverings',
            itemDescription: 'White faux wood blind 35x64',
            quantity: 1,
            unit: 'ea',
            status: 'ordered',
            notes: 'Replacement blind already approved and ordered.',
            roomLabel: 'Bedroom',
            taskIndex: 1,
          },
          {
            category: 'Interior Finishes',
            itemDescription: 'Drywall patch kit and touch-up paint',
            quantity: 1,
            unit: 'set',
            status: 'planned',
            notes: 'Bundle kit for patch and finish work.',
            roomLabel: 'Entry',
            taskIndex: 2,
          },
        ],
      },
    ],
  },
};

export class DevSeedService {
  static readonly SEED_BATCH = 'demo-portfolio-v1';
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
        .filter((key) => key !== '::'),
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
      metadata: {
        seedBatch: this.SEED_BATCH,
      },
    });

    try {
      await this.clearSeedData(orgId, userId, true);

      const seedMarker = this.buildSeedMarker();
      const layouts = await LayoutTemplateService.listActive(orgId);
      const layoutIds = layouts.map((layout) => layout.id);

      const seededCatalogItems = await this.seedCatalogItems(orgId, seedMarker);
      const unitsToCreate = this.buildSeedPortfolio();
      const catalogByEquivalentGroup = this.groupCatalogItemsByEquivalentGroup(seededCatalogItems);

      let createdUnits = 0;
      let createdInspections = 0;

      for (let index = 0; index < unitsToCreate.length; index += 1) {
        const unitSeed = unitsToCreate[index];
        const scenario = SCENARIO_DEFINITIONS[unitSeed.scenarioKey];
        const assignedLayoutTemplateId = this.resolveSeedLayoutTemplateId(unitSeed, layouts) || (layoutIds.length > 0 ? layoutIds[index % layoutIds.length] : null);
        const favoriteProductIds = this.resolveFavoriteProductIds(
          scenario.favoriteEquivalentGroups,
          catalogByEquivalentGroup,
          seededCatalogItems,
          index,
        );

        const createdUnit = await UnitService.createUnit(orgId, {
          ...unitSeed,
          assignedLayoutTemplateId,
          favoriteProductIds,
          seedMarker,
          managementData: {
            ...unitSeed.managementData,
            seedMarker,
          },
        });
        createdUnits += 1;
        createdInspections += await this.seedInspectionsForUnit(
          orgId,
          userId,
          createdUnit,
          unitSeed.scenarioKey,
          seedMarker,
          catalogByEquivalentGroup,
        );
      }

      const result: SeedCounts = {
        facilities: 3,
        buildings: 9,
        units: createdUnits,
        inspections: createdInspections,
        catalogItems: seededCatalogItems.length,
      };

      ClientLoggerService.info('Checking seeded demo data visibility.', {
        category: 'developer_tools',
        eventType: 'demo_seed.visibility_check_started',
        screen: 'FeedbackManagement',
        contextIds: { orgId, userId },
        metadata: {
          seedBatch: this.SEED_BATCH,
        },
      });

      const summary = await this.getSeedSummary(orgId);
      const visibilityMatches =
        summary.seededUnits === result.units &&
        summary.seededInspections === result.inspections &&
        summary.facilities === result.facilities &&
        summary.buildings === result.buildings;

      if (!visibilityMatches) {
        ClientLoggerService.error('Seeded demo data did not match expected visibility counts.', {
          category: 'developer_tools',
          eventType: 'demo_seed.visibility_check_failed',
          screen: 'FeedbackManagement',
          contextIds: { orgId, userId },
          metadata: {
            seedBatch: this.SEED_BATCH,
            expected: result,
            actual: summary,
          },
        });
        throw new Error('Demo data was created but did not verify as visible in the current org context.');
      }

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

      ClientLoggerService.info('Seeded demo data verified and refresh broadcast sent.', {
        category: 'developer_tools',
        eventType: 'demo_seed.visibility_fixed',
        screen: 'FeedbackManagement',
        contextIds: { orgId, userId },
        metadata: { ...summary },
      });

      this.dispatchRefreshEvent({
        orgId,
        userId,
        action: 'seeded',
        summary,
      });

      return result;
    } catch (error) {
      ClientLoggerService.error('Developer demo data seed failed.', {
        category: 'developer_tools',
        eventType: 'demo_seed.failed',
        screen: 'FeedbackManagement',
        contextIds: { orgId, userId },
        metadata: {
          seedBatch: this.SEED_BATCH,
          error,
        },
      });
      throw error;
    }
  }

  static async clearSeedData(orgId: string, userId: string, silent = false): Promise<ClearSeedCounts> {
    try {
      const [units, inspections, catalogItems] = await Promise.all([
        UnitService.listUnits(orgId),
        InspectionService.listInspections(orgId),
        CatalogService.getItems(orgId),
      ]);

      const seededInspections = inspections.filter((inspection) => inspection.seedMarker?.isSeedData);
      const seededUnits = units.filter((unit) => unit.seedMarker?.isSeedData || unit.managementData?.seedMarker?.isSeedData);
      const seededCatalogItems = catalogItems.filter((item) => item.seedMarker?.isSeedData);

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
          metadata: {
            seedBatch: this.SEED_BATCH,
            ...result,
          },
        });
      }

      return result;
    } catch (error) {
      ClientLoggerService.error('Developer demo data clear failed.', {
        category: 'developer_tools',
        eventType: 'demo_seed.clear_failed',
        screen: 'FeedbackManagement',
        contextIds: { orgId, userId },
        metadata: {
          seedBatch: this.SEED_BATCH,
          error,
        },
      });
      throw error;
    }
  }

  private static buildSeedMarker(): SeedMarker {
    return {
      isSeedData: true,
      seedBatch: this.SEED_BATCH,
    };
  }

  private static async seedCatalogItems(orgId: string, seedMarker: SeedMarker): Promise<CatalogItem[]> {
    const catalogDefinitions: Array<
      Pick<
        CatalogItem,
        | 'name'
        | 'description'
        | 'categoryName'
        | 'topLevelCategory'
        | 'subcategory'
        | 'equivalentGroup'
        | 'functionalTags'
        | 'vendor'
        | 'importSource'
        | 'defaultQty'
        | 'unit'
        | 'defaultTier'
        | 'tags'
        | 'options'
      >
    > = [
      {
        name: 'Standard Air Filter 16x25x1',
        description: 'Fictional demo filter for HVAC maintenance turn prep.',
        categoryName: 'Small Replacement Parts',
        topLevelCategory: 'Appliances',
        subcategory: 'Small Replacement Parts',
        equivalentGroup: 'hvac_filter_standard',
        functionalTags: ['task:replace_filter', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Turn Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'filter'],
        options: [],
      },
      {
        name: 'Standard Air Filter 20x25x1',
        description: 'Fictional demo filter for HVAC maintenance turn prep.',
        categoryName: 'Small Replacement Parts',
        topLevelCategory: 'Appliances',
        subcategory: 'Small Replacement Parts',
        equivalentGroup: 'hvac_filter_standard',
        functionalTags: ['task:replace_filter', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Turn Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'filter'],
        options: [],
      },
      {
        name: 'Eggshell Wall Paint White',
        description: 'Fictional demo touch-up paint for unit turns.',
        categoryName: 'Paint & Primers',
        topLevelCategory: 'Interior Finishes',
        subcategory: 'Paint & Primers',
        equivalentGroup: 'interior_wall_paint_touchup_neutral',
        functionalTags: ['task:paint_touchup', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Finish Depot',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'gal',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'paint'],
        options: [],
      },
      {
        name: 'Semi-Gloss Trim Paint',
        description: 'Fictional demo trim paint for unit refresh work.',
        categoryName: 'Trim & Molding',
        topLevelCategory: 'Interior Finishes',
        subcategory: 'Trim & Molding',
        equivalentGroup: 'trim_semigloss_white_standard',
        functionalTags: ['task:paint_touchup', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Finish Depot',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'qt',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'paint'],
        options: [],
      },
      {
        name: 'Smoke Detector Battery Pack',
        description: 'Fictional demo battery pack for detector maintenance.',
        categoryName: 'Bulbs & Drivers',
        topLevelCategory: 'Electrical & Lighting',
        subcategory: 'Bulbs & Drivers',
        equivalentGroup: 'smoke_detector_standard_battery',
        functionalTags: ['task:replace_detector_battery', 'grade:budget', 'turn:quick_turn'],
        vendor: 'Safety Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'pack',
        defaultTier: Tier.BUDGET,
        tags: ['seed', 'battery'],
        options: [],
      },
      {
        name: 'White Duplex Outlet 15A',
        description: 'Fictional demo replacement outlet used in turnover repairs.',
        categoryName: 'Switches & Outlets',
        topLevelCategory: 'Electrical & Lighting',
        subcategory: 'Switches & Outlets',
        equivalentGroup: 'duplex_outlet_standard_white',
        functionalTags: ['task:replace_outlet', 'room:kitchen', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Turn Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'electrical'],
        options: [],
      },
      {
        name: 'Standard Bathroom Faucet Chrome',
        description: 'Fictional demo faucet used for standard bathroom sink replacement.',
        categoryName: 'Faucets & Fixtures',
        topLevelCategory: 'Plumbing',
        subcategory: 'Faucets & Fixtures',
        equivalentGroup: 'bathroom_sink_faucet_standard',
        functionalTags: ['task:replace_faucet', 'room:bathroom', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Turn Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'plumbing', 'faucet'],
        options: [],
      },
      {
        name: 'Budget Bathroom Faucet Brushed Nickel',
        description: 'Fictional demo alternate faucet for standard sink replacement.',
        categoryName: 'Faucets & Fixtures',
        topLevelCategory: 'Plumbing',
        subcategory: 'Faucets & Fixtures',
        equivalentGroup: 'bathroom_sink_faucet_standard',
        functionalTags: ['task:replace_faucet', 'room:bathroom', 'grade:budget', 'turn:quick_turn'],
        vendor: 'Budget Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.BUDGET,
        tags: ['seed', 'plumbing', 'faucet'],
        options: [],
      },
      {
        name: 'White Faux Wood Blind 35x64',
        description: 'Fictional demo blind used for common bedroom and living room replacements.',
        categoryName: 'Blinds & Shades',
        topLevelCategory: 'Windows & Coverings',
        subcategory: 'Blinds & Shades',
        equivalentGroup: 'blind_white_35x64_standard',
        functionalTags: ['task:install_blinds', 'room:bedroom', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Window Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'window', 'blind'],
        options: [],
      },
      {
        name: 'White Vinyl Blind 35x64',
        description: 'Fictional demo alternate blind for common unit turnover replacements.',
        categoryName: 'Blinds & Shades',
        topLevelCategory: 'Windows & Coverings',
        subcategory: 'Blinds & Shades',
        equivalentGroup: 'blind_white_35x64_standard',
        functionalTags: ['task:install_blinds', 'room:bedroom', 'grade:budget', 'turn:quick_turn'],
        vendor: 'Window Supply Co.',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.BUDGET,
        tags: ['seed', 'window', 'blind'],
        options: [],
      },
      {
        name: 'Drywall Patch Repair Kit',
        description: 'Fictional demo wall repair kit for standard patch work.',
        categoryName: 'Wall Repair',
        topLevelCategory: 'Interior Finishes',
        subcategory: 'Wall Repair',
        equivalentGroup: 'drywall_patch_standard',
        functionalTags: ['task:patch_drywall', 'grade:standard', 'turn:quick_turn'],
        vendor: 'Finish Depot',
        importSource: 'csv',
        defaultQty: 1,
        unit: 'kit',
        defaultTier: Tier.STANDARD,
        tags: ['seed', 'drywall', 'patch'],
        options: [],
      },
    ];

    const created: CatalogItem[] = [];
    for (const definition of catalogDefinitions) {
      created.push(
        await CatalogService.addItem(orgId, {
          ...definition,
          seedMarker,
        }),
      );
    }
    return created;
  }

  private static async seedInspectionsForUnit(
    orgId: string,
    userId: string,
    unit: Unit,
    scenarioKey: ScenarioKey,
    seedMarker: SeedMarker,
    catalogByEquivalentGroup: Record<string, CatalogItem[]>,
  ): Promise<number> {
    const scenario = SCENARIO_DEFINITIONS[scenarioKey];
    let createdInspections = 0;

    for (let inspectionIndex = 0; inspectionIndex < scenario.inspections.length; inspectionIndex += 1) {
      const inspectionSeed = scenario.inspections[inspectionIndex];
      const inspection = await InspectionService.createInspection(
        orgId,
        unit.id,
        `${unit.name} ${inspectionSeed.titleSuffix}`,
        userId,
        {
          notes: inspectionSeed.notes,
        },
      );

      const updatedInspection: Inspection = {
        ...inspection,
        status: inspectionSeed.status,
        notes: inspectionSeed.notes,
        seedMarker,
      };

      await InspectionService.updateInspection(orgId, updatedInspection, userId);

      createdInspections += 1;
      await this.seedScopeForInspection(
        orgId,
        userId,
        unit,
        updatedInspection,
        inspectionSeed,
        seedMarker,
        scenarioKey,
        inspectionIndex,
        catalogByEquivalentGroup,
      );
    }

    return createdInspections;
  }

  private static async seedScopeForInspection(
    orgId: string,
    userId: string,
    unit: Unit,
    inspection: Inspection,
    inspectionSeed: ScenarioInspectionSeed,
    seedMarker: SeedMarker,
    scenarioKey: ScenarioKey,
    inspectionIndex: number,
    catalogByEquivalentGroup: Record<string, CatalogItem[]>,
  ) {
    const createdFindings: Finding[] = [];

    for (let findingIndex = 0; findingIndex < inspectionSeed.findingSeeds.length; findingIndex += 1) {
      const findingSeed = inspectionSeed.findingSeeds[findingIndex];
      createdFindings.push(
        await FindingService.createFinding(
          orgId,
          {
            orgId,
            inspectionId: inspection.id,
            unitId: unit.id,
            area: findingSeed.area,
            category: findingSeed.category,
            severity: findingSeed.severity,
            priority: findingSeed.priority,
            status: findingSeed.status,
            description: findingSeed.description,
            notes: findingSeed.notes,
            recommendedTrade: findingSeed.recommendedTrade,
            photoIds: [],
            metadata: {
              seedMarker,
              scenarioKey,
              inspectionIndex,
            },
          },
          userId,
        ),
      );
    }

    const createdTasks = [];
    for (let taskIndex = 0; taskIndex < inspectionSeed.taskSeeds.length; taskIndex += 1) {
      const taskSeed = inspectionSeed.taskSeeds[taskIndex];
      const finding = createdFindings[taskSeed.findingIndex];
      if (!finding) continue;

      createdTasks.push(
        await RepairTaskService.createTask(
          orgId,
          {
            orgId,
            inspectionId: inspection.id,
            unitId: unit.id,
            findingIds: [finding.id],
            title: taskSeed.title,
            trade: taskSeed.trade,
            priority: taskSeed.priority,
            status: taskSeed.status,
            estimatedEffortMinutes: taskSeed.estimatedEffortMinutes,
            notes: taskSeed.notes,
            metadata: {
              seedMarker,
              scenarioKey,
              inspectionIndex,
            },
          },
          userId,
        ),
      );
    }

    for (let materialIndex = 0; materialIndex < inspectionSeed.materialSeeds.length; materialIndex += 1) {
      const materialSeed = inspectionSeed.materialSeeds[materialIndex];
      const task = createdTasks[materialSeed.taskIndex];
      if (!task) continue;

      await MaterialRequirementService.createRequirement(
        orgId,
        {
          orgId,
          inspectionId: inspection.id,
          repairTaskId: task.id,
          category: materialSeed.category,
          itemDescription: materialSeed.itemDescription,
          quantity: materialSeed.quantity,
          unit: materialSeed.unit,
          confidence: 'high',
          source: 'manual',
          status: materialSeed.status,
          procurementState: materialSeed.procurementState,
          vendorActionState: materialSeed.vendorActionState,
          verificationStatus: materialSeed.verificationStatus,
          closeoutIssueState: materialSeed.closeoutIssueState,
          assignedVendorUserId: materialSeed.assignedVendorUserId,
          assignedVendorDisplayName: materialSeed.assignedVendorDisplayName,
          selectedMatch: this.buildSelectedProcurementOption(
            materialSeed.selectedEquivalentGroup,
            catalogByEquivalentGroup,
          ),
          notes: materialSeed.notes,
          roomLabel: materialSeed.roomLabel,
          sourceFindingId: task.findingIds[0],
          metadata: {
            seedMarker,
            scenarioKey,
            inspectionIndex,
          },
        },
        userId,
      );
    }
  }

  private static buildSelectedProcurementOption(
    equivalentGroup: string | undefined,
    catalogByEquivalentGroup: Record<string, CatalogItem[]>,
  ): SelectedProcurementOption | undefined {
    if (!equivalentGroup) return undefined;
    const item = catalogByEquivalentGroup[equivalentGroup]?.[0];
    if (!item) return undefined;

    return {
      catalogItemId: item.id,
      catalogItemName: item.name,
      optionName: item.name,
      category: item.categoryName,
      unit: item.unit,
      vendor: item.vendor,
      confidenceScore: 1,
      confidenceBand: 'manual',
      rationale: ['Seeded deterministic procurement selection.'],
      selectedAt: Date.now(),
    };
  }

  private static buildSeedPortfolio(): UnitSeedRecord[] {
    const facilities = [
      {
        facilityName: 'Lakeside Commons',
        streetBase: '1200 Harbor View Dr',
        city: 'Grandville',
        state: 'MI',
        zip: '49418',
        buildings: [
          { buildingName: 'Building A', prefix: 'LC-A', floorBase: 100 },
          { buildingName: 'Building B', prefix: 'LC-B', floorBase: 200 },
          { buildingName: 'Building C', prefix: 'LC-C', floorBase: 300 },
        ],
      },
      {
        facilityName: 'Maple Ridge Estates',
        streetBase: '8800 Maple Ridge Ln',
        city: 'Holland',
        state: 'MI',
        zip: '49423',
        buildings: [
          { buildingName: 'Building D', prefix: 'MR-D', floorBase: 400 },
          { buildingName: 'Building E', prefix: 'MR-E', floorBase: 500 },
          { buildingName: 'Building F', prefix: 'MR-F', floorBase: 600 },
        ],
      },
      {
        facilityName: 'Harbor Point Residences',
        streetBase: '4100 Marina Point Pkwy',
        city: 'Muskegon',
        state: 'MI',
        zip: '49441',
        buildings: [
          { buildingName: 'Building G', prefix: 'HP-G', floorBase: 700 },
          { buildingName: 'Building H', prefix: 'HP-H', floorBase: 800 },
          { buildingName: 'Building I', prefix: 'HP-I', floorBase: 900 },
        ],
      },
    ];

    const layoutNotes = [
      'Corner layout with extra daylight in the living room.',
      'Stacked utility closet with hallway storage.',
      'Galley kitchen layout with dining nook.',
      'Split-bedroom layout used for roommate plans.',
    ];

    const units: UnitSeedRecord[] = [];
    let index = 0;

    for (const facility of facilities) {
      for (const building of facility.buildings) {
        for (let unitOffset = 1; unitOffset <= 6; unitOffset += 1) {
          const unitNumber = String(building.floorBase + unitOffset);
          const bedrooms = (index % 3) + 1;
          const bathrooms = [1, 1.5, 2][index % 3];
          const squareFootage = 720 + index * 18 + bedrooms * 65;
          const unitCode = `${building.prefix}-${unitNumber}`;
          const scenarioKey = SCENARIO_ORDER[index % SCENARIO_ORDER.length];
          const finishPackage = ['Standard Turn Finish', 'Harbor Neutral Package', 'Maple Classic Package'][index % 3];

          units.push({
            name: `Unit ${unitNumber}`,
            unitCode,
            facilityName: facility.facilityName,
            buildingName: building.buildingName,
            address1: facility.streetBase,
            address2: `Unit ${unitNumber}`,
            city: facility.city,
            state: facility.state,
            zip: facility.zip,
            notes: `${unitCode} is a fictional ${bedrooms} bed / ${bathrooms} bath unit assigned to the ${finishPackage}. Scenario: ${scenarioKey.replaceAll('_', ' ')}.`,
            managementData: this.buildManagementData(index, squareFootage, bedrooms, bathrooms, layoutNotes[index % layoutNotes.length]),
            scenarioKey,
          });

          index += 1;
        }
      }
    }

    return units;
  }

  private static resolveSeedLayoutTemplateId(unitSeed: UnitSeedRecord, layouts: Awaited<ReturnType<typeof LayoutTemplateService.listActive>>) {
    const bedrooms = unitSeed.managementData.physicalDetails?.bedrooms ?? null;
    const bathrooms = unitSeed.managementData.physicalDetails?.bathrooms ?? null;
    if (bedrooms === null || bathrooms === null) return null;

    const exactMatch =
      layouts.find((layout) => layout.bedrooms === bedrooms && layout.bathroomsFull + layout.bathroomsHalf === bathrooms) ||
      layouts.find((layout) => layout.bedrooms === bedrooms && layout.bathroomsFull === Math.floor(bathrooms)) ||
      layouts.find((layout) => layout.bedrooms === bedrooms) ||
      layouts.find((layout) => layout.bedrooms === Math.max(0, Math.min(2, bedrooms)) && layout.bathroomsFull >= Math.floor(bathrooms)) ||
      null;

    return exactMatch?.id || null;
  }

  private static buildManagementData(
    index: number,
    squareFootage: number,
    bedrooms: number,
    bathrooms: number,
    floorPlanNotes: string,
  ): UnitManagementData {
    const applianceSet = [
      { refrigerator: 'Whirlpool', range: 'GE', dishwasher: 'Frigidaire', hvac: 'Carrier' },
      { refrigerator: 'Samsung', range: 'Whirlpool', dishwasher: 'Bosch', hvac: 'Lennox' },
      { refrigerator: 'GE', range: 'Amana', dishwasher: 'GE', hvac: 'Trane' },
      { refrigerator: 'LG', range: 'Frigidaire', dishwasher: 'KitchenAid', hvac: 'Goodman' },
    ][index % 4];

    const applianceLogs: ApplianceLogEntry[] = [
      {
        type: 'refrigerator',
        brand: applianceSet.refrigerator,
        modelNumber: `RF-${1000 + index}`,
        serialNumber: `FR-${2020 + index}-${7000 + index}`,
        installationDate: this.shiftedDate(index, -900),
      },
      {
        type: 'range',
        brand: applianceSet.range,
        modelNumber: `RG-${1100 + index}`,
        serialNumber: `RG-${2021 + index}-${7100 + index}`,
        installationDate: this.shiftedDate(index, -780),
      },
      {
        type: 'dishwasher',
        brand: applianceSet.dishwasher,
        modelNumber: `DW-${1200 + index}`,
        serialNumber: `DW-${2022 + index}-${7200 + index}`,
        installationDate: this.shiftedDate(index, -650),
      },
      {
        type: 'hvac',
        brand: applianceSet.hvac,
        modelNumber: `HV-${1300 + index}`,
        serialNumber: `HV-${2019 + index}-${7300 + index}`,
        installationDate: this.shiftedDate(index, -1200),
      },
    ];

    const maintenanceHistory: MaintenanceEntry[] = [
      {
        date: this.shiftedDate(index, -180),
        title: 'HVAC seasonal service',
        vendor: 'Comfort Air Services',
        cost: 129,
        notes: 'Standard cooling-season maintenance and filter replacement.',
      },
      {
        date: this.shiftedDate(index, -95),
        title: 'Replaced garbage disposal',
        vendor: 'Harbor Plumbing Co.',
        cost: 185,
        notes: 'Tenant reported jammed unit; replaced with matching 1/2 HP disposal.',
      },
      {
        date: this.shiftedDate(index, -35),
        title: 'Touch-up paint and wall patching',
        vendor: 'Turn Crew A',
        cost: 240,
        notes: 'Patched hallway scuffs and refreshed living room wall sections.',
      },
    ];

    const warrantyInfo: WarrantyEntry[] = [
      {
        item: 'HVAC condenser',
        provider: applianceSet.hvac,
        warrantyEndsOn: this.shiftedDate(index, 365 * 3),
        notes: 'Parts warranty registered by installer.',
      },
      {
        item: 'Dishwasher',
        provider: 'Manufacturer standard warranty',
        warrantyEndsOn: this.shiftedDate(index, 365),
        notes: 'Labor excluded after first year.',
      },
    ];

    const keyLog: KeyLogEntry[] = [
      {
        holder: 'Property Management Office',
        role: 'management',
        keyCount: 2,
        notes: 'Primary lockbox set.',
      },
      {
        holder: index % 2 === 0 ? 'Maintenance Team A' : 'Maintenance Team B',
        role: 'maintenance',
        keyCount: 1,
        notes: 'Shared for active service response coverage.',
      },
      {
        holder: 'Current Resident',
        role: 'tenant',
        keyCount: 2,
        notes: 'Standard issue set.',
      },
    ];

    return {
      physicalDetails: {
        squareFootage,
        bedrooms,
        bathrooms,
        ceilingHeightFt: index % 2 === 0 ? 8 : 9,
        floorPlanNotes,
        roomMeasurements: [
          { roomName: 'Living Room', widthFt: 14 + (index % 2), lengthFt: 16 + (index % 3) },
          { roomName: 'Kitchen', widthFt: 9 + (index % 2), lengthFt: 11 },
          { roomName: 'Primary Bedroom', widthFt: 12, lengthFt: 13 + (index % 2) },
          ...(bedrooms > 1 ? [{ roomName: 'Second Bedroom', widthFt: 10, lengthFt: 11 }] : []),
          ...(bedrooms > 2 ? [{ roomName: 'Third Bedroom', widthFt: 10, lengthFt: 10 }] : []),
        ],
        windowSizes: [
          { location: 'Living Room North', widthIn: 35, heightIn: 64 },
          { location: 'Primary Bedroom', widthIn: 29, heightIn: 58 },
          ...(bedrooms > 1 ? [{ location: 'Second Bedroom', widthIn: 29, heightIn: 58 }] : []),
        ],
        doorWidthsIn: [30, 32, 36],
      },
      applianceLogs,
      paintCodes: {
        walls: ['Sherwin-Williams Agreeable Gray SW7029', 'Behr Silver Drop 790C-2', 'Accessible Beige SW7036'][index % 3],
        trim: ['Behr Ultra Pure White', 'Sherwin-Williams Extra White SW7006'][index % 2],
        ceilings: ['Flat White', 'Sherwin-Williams Ceiling Bright White'][index % 2],
      },
      utilityInfo: {
        waterAccountNumber: `WTR-${500000 + index}`,
        gasAccountNumber: `GAS-${600000 + index}`,
        electricAccountNumber: `ELE-${700000 + index}`,
        waterMeterLocation: 'Basement utility wall near water heater',
        gasMeterLocation: 'Exterior east side meter bank',
        electricMeterLocation: 'Exterior service panel by rear entry',
      },
      maintenanceCheatSheet: {
        airFilterSize: ['16x25x1', '20x25x1', '14x20x1'][index % 3],
        smokeDetectorBatteryType: ['AA', '9V'][index % 2],
        mainWaterShutoffLocation: index % 2 === 0 ? 'Under kitchen sink shutoff panel' : 'Basement mechanical room main valve',
      },
      maintenanceHistory,
      warrantyInfo,
      keyLog,
      moveHistory: {
        moveInChecklistSummary: 'Move-in checklist completed with timestamped photos in acceptable condition.',
        moveOutChecklistSummary: 'Most recent move-out noted standard turn work, appliance cleaning, and touch-up follow-up.',
      },
    };
  }

  private static groupCatalogItemsByEquivalentGroup(items: CatalogItem[]) {
    return items.reduce<Record<string, CatalogItem[]>>((accumulator, item) => {
      const key = item.equivalentGroup || '__uncategorized__';
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(item);
      return accumulator;
    }, {});
  }

  private static resolveFavoriteProductIds(
    preferredGroups: string[],
    catalogByEquivalentGroup: Record<string, CatalogItem[]>,
    catalogItems: CatalogItem[],
    index: number,
  ): string[] {
    const selected = preferredGroups.flatMap((group) => catalogByEquivalentGroup[group]?.slice(0, 1) || []);
    if (selected.length >= 3) {
      return selected.slice(0, 3).map((item) => item.id);
    }

    const fallbackItems = Array.from({ length: 3 }, (_, offset) => catalogItems[(index + offset) % catalogItems.length]).filter(
      (item): item is CatalogItem => Boolean(item),
    );

    return [...selected, ...fallbackItems]
      .map((item) => item.id)
      .filter((itemId, itemIndex, array) => array.indexOf(itemId) === itemIndex)
      .slice(0, 3);
  }

  private static shiftedDate(index: number, offsetDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays - index);
    return date.toISOString().slice(0, 10);
  }

  private static dispatchRefreshEvent(detail: {
    orgId: string;
    userId: string;
    action: 'seeded' | 'cleared';
    summary: SeedSummary;
  }) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(this.REFRESH_EVENT, { detail }));
  }
}
