export const LAYOUT_UNIT_TYPES = ['apartment', 'townhome', 'condo', 'single_family'] as const;

export const LAYOUT_ROOM_TYPES = [
  'entry',
  'living_room',
  'dining_room',
  'kitchen',
  'bedroom',
  'bathroom',
  'hallway',
  'closet',
  'laundry',
  'utility',
  'storage',
  'balcony',
  'patio',
  'garage',
  'office',
  'other',
] as const;

export const CHECKLIST_APPLICATION_MODES = ['unit', 'each_room_type', 'specific_room_type'] as const;

export const GENERATED_INSPECTION_ITEM_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'blocked',
  'not_applicable',
  'failed',
] as const;

export type LayoutUnitType = (typeof LAYOUT_UNIT_TYPES)[number];
export type LayoutRoomType = (typeof LAYOUT_ROOM_TYPES)[number];
export type ChecklistApplicationMode = (typeof CHECKLIST_APPLICATION_MODES)[number];
export type GeneratedInspectionItemStatus = (typeof GENERATED_INSPECTION_ITEM_STATUSES)[number];

export interface LayoutRoomBlueprint {
  id: string;
  roomType: LayoutRoomType;
  label: string;
  order: number;
  sequence?: number;
  required: boolean;
}

export interface LayoutTemplate {
  id: string;
  orgId: string | null;
  name: string;
  slug: string;
  unitType: LayoutUnitType;
  bedrooms: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  roomBlueprint: LayoutRoomBlueprint[];
  defaultChecklistTemplateId: string | null;
  isSystem: boolean;
  isActive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChecklistItemTemplate {
  id: string;
  label: string;
  category: string;
  required: boolean;
  photoRecommended?: boolean;
  severityDefault?: 'low' | 'medium' | 'high';
}

export interface ChecklistRecipeSection {
  id: string;
  title: string;
  appliesTo: ChecklistApplicationMode;
  roomType?: LayoutRoomType;
  order: number;
  items: ChecklistItemTemplate[];
}

export interface ChecklistTemplate {
  id: string;
  orgId: string | null;
  name: string;
  slug: string;
  recipeSections: ChecklistRecipeSection[];
  isSystem: boolean;
  isActive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface LayoutChecklistMapping {
  id: string;
  orgId: string | null;
  layoutTemplateId: string;
  checklistTemplateId: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InspectionTemplateSnapshot {
  layoutTemplateId: string;
  layoutTemplateVersion: number;
  checklistTemplateId: string;
  checklistTemplateVersion: number;
  generatedAt: number;
}

export interface GeneratedInspectionItem {
  id: string;
  sourceTemplateItemId: string;
  sourceRecipeSectionId: string;
  label: string;
  category: string;
  status: GeneratedInspectionItemStatus;
  required: boolean;
  photoIds: string[];
  roomType?: LayoutRoomType;
  roomLabel?: string;
  notes?: string;
  order: number;
  severity?: 'low' | 'medium' | 'high';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  findingIds?: string[];
  repairTaskIds?: string[];
  materialRequirementIds?: string[];
  completedAt?: number;
  updatedAt?: number;
}

export interface GeneratedInspectionSection {
  id: string;
  sourceRecipeSectionId: string;
  title: string;
  roomType?: LayoutRoomType;
  roomLabel?: string;
  order: number;
  items: GeneratedInspectionItem[];
}
