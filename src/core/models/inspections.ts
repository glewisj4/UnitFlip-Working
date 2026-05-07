import {
  GeneratedInspectionItem,
  GeneratedInspectionSection,
  InspectionTemplateSnapshot,
} from './templates';

export interface SeedMarker {
  isSeedData: true;
  seedBatch: string;
}

export interface RoomMeasurement {
  roomName: string;
  widthFt: number;
  lengthFt: number;
}

export interface WindowSize {
  location: string;
  widthIn: number;
  heightIn: number;
}

export interface UnitPhysicalDetails {
  squareFootage?: number;
  bedrooms?: number;
  bathrooms?: number;
  ceilingHeightFt?: number;
  floorPlanNotes?: string;
  roomMeasurements?: RoomMeasurement[];
  windowSizes?: WindowSize[];
  doorWidthsIn?: number[];
}

export type ApplianceType = 'refrigerator' | 'range' | 'dishwasher' | 'hvac';

export interface ApplianceLogEntry {
  type: ApplianceType;
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  installationDate?: string;
}

export interface PaintCodes {
  walls?: string;
  trim?: string;
  ceilings?: string;
}

export interface UtilityInfo {
  waterAccountNumber?: string;
  gasAccountNumber?: string;
  electricAccountNumber?: string;
  waterMeterLocation?: string;
  gasMeterLocation?: string;
  electricMeterLocation?: string;
}

export interface MaintenanceCheatSheet {
  airFilterSize?: string;
  smokeDetectorBatteryType?: string;
  mainWaterShutoffLocation?: string;
}

export interface MaintenanceEntry {
  date: string;
  title: string;
  vendor?: string;
  cost?: number;
  notes?: string;
}

export interface WarrantyEntry {
  item: string;
  provider?: string;
  warrantyEndsOn?: string;
  notes?: string;
}

export interface KeyLogEntry {
  holder: string;
  role?: string;
  keyCount?: number;
  notes?: string;
}

export interface MoveHistory {
  moveInChecklistSummary?: string;
  moveOutChecklistSummary?: string;
}

export interface UnitManagementData {
  seedMarker?: SeedMarker;
  physicalDetails?: UnitPhysicalDetails;
  applianceLogs?: ApplianceLogEntry[];
  paintCodes?: PaintCodes;
  utilityInfo?: UtilityInfo;
  maintenanceCheatSheet?: MaintenanceCheatSheet;
  maintenanceHistory?: MaintenanceEntry[];
  warrantyInfo?: WarrantyEntry[];
  keyLog?: KeyLogEntry[];
  moveHistory?: MoveHistory;
}

export interface Unit {
  id: string;
  orgId: string;
  name: string;
  unitCode?: string;
  facilityName?: string;
  buildingName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  assignedLayoutTemplateId?: string | null;
  favoriteProductIds?: string[];
  budgetThreshold?: number;
  notes?: string;
  managementData?: UnitManagementData;
  seedMarker?: SeedMarker;
  createdAt: number;
  updatedAt: number;
  status?: 'active' | 'archived';
}

export type InspectionStatus = 'draft' | 'in_progress' | 'completed';

export interface Inspection {
  id: string;
  orgId: string;
  unitId: string;
  title: string;
  status: InspectionStatus;
  isInspectionFinalized?: boolean;
  createdAt: number;
  updatedAt: number;
  createdByUserId: string;
  lastEditedByUserId?: string;
  notes?: string;
  roomSelections?: string[];
  productIds?: string[];
  photoIds: string[];
  templateSnapshot?: InspectionTemplateSnapshot;
  generatedSections?: GeneratedInspectionSection[];
  generatedItems?: GeneratedInspectionItem[];
  seedMarker?: SeedMarker;
}
