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
export const CHECKLIST_ITEM_TYPES = ['inspection', 'conditional', 'always_replace'] as const;
export const CHECKLIST_ITEM_INPUT_MODES = ['none', 'count', 'dimensions', 'area'] as const;
export const CHECKLIST_DEFAULT_ACTION_MODES = ['inspect', 'always_replace'] as const;
export const TURNOVER_PRESET_IDS = ['luxury', 'standard', 'budget'] as const;
export const TURNOVER_PRESET_PRODUCT_TIERS = ['high', 'mid', 'low'] as const;
export const CHECKLIST_OVERRIDE_SCOPE_TYPES = ['organization', 'property', 'unit'] as const;

export const GENERATED_INSPECTION_ITEM_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'blocked',
  'not_applicable',
  'failed',
] as const;
export const FOCUSED_ITEM_ACTIONS = ['good', 'repair', 'replace'] as const;

export type LayoutUnitType = (typeof LAYOUT_UNIT_TYPES)[number];
export type LayoutRoomType = (typeof LAYOUT_ROOM_TYPES)[number];
export type ChecklistApplicationMode = (typeof CHECKLIST_APPLICATION_MODES)[number];
export type ChecklistItemType = (typeof CHECKLIST_ITEM_TYPES)[number];
export type ChecklistItemInputMode = (typeof CHECKLIST_ITEM_INPUT_MODES)[number];
export type ChecklistDefaultActionMode = (typeof CHECKLIST_DEFAULT_ACTION_MODES)[number];
export type TurnoverPresetId = (typeof TURNOVER_PRESET_IDS)[number];
export type TurnoverPresetProductTier = (typeof TURNOVER_PRESET_PRODUCT_TIERS)[number];
export type ChecklistOverrideScopeType = (typeof CHECKLIST_OVERRIDE_SCOPE_TYPES)[number];
export type GeneratedInspectionItemStatus = (typeof GENERATED_INSPECTION_ITEM_STATUSES)[number];
export type FocusedItemAction = (typeof FOCUSED_ITEM_ACTIONS)[number];

export interface ChecklistItemMaterialReference {
  catalogItemId?: string;
  label?: string;
  unit?: string;
}

export interface ChecklistItemInputValue {
  quantity?: number;
  dimensions?: {
    width: number;
    height: number;
    unit?: 'in' | 'ft';
  };
  area?: number;
  updatedAt?: number;
}

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
  repairOptions?: string[];
  replaceOptions?: string[];
  requiresMeasurements?: boolean;
  dataFields?: string[];
  lowesCategory?: string;
  supportsAlwaysReplace?: boolean;
  defaultActionMode?: ChecklistDefaultActionMode;
  itemType?: ChecklistItemType;
  inputMode?: ChecklistItemInputMode;
  defaultQuantity?: number;
  materialReference?: ChecklistItemMaterialReference;
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

export interface TurnoverPresetRule {
  templateItemId: string;
  actionMode?: ChecklistDefaultActionMode;
  preferredReplaceOption?: string;
  preferredProductTier?: TurnoverPresetProductTier;
  notes?: string;
}

export interface TurnoverPreset {
  id: TurnoverPresetId;
  label: string;
  description: string;
  preferredProductTier?: TurnoverPresetProductTier;
  rules: TurnoverPresetRule[];
}

export interface ChecklistScopedOverride {
  id: string;
  organizationId: string;
  scopeType: ChecklistOverrideScopeType;
  scopeRefId: string;
  templateItemId: string;
  actionMode?: ChecklistDefaultActionMode;
  preferredReplaceOption?: string;
  preferredProductTier?: TurnoverPresetProductTier;
  notes?: string;
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
  turnoverPresetId?: TurnoverPresetId | null;
  turnoverPresetLabel?: string | null;
  turnoverPresetProductTier?: TurnoverPresetProductTier | null;
  appliedScopedOverrideIds?: string[];
  generatedAt: number;
}

export interface GeneratedInspectionItem {
  id: string;
  sourceTemplateItemId: string;
  sourceRecipeSectionId: string;
  label: string;
  category: string;
  repairOptions: string[];
  replaceOptions: string[];
  requiresMeasurements: boolean;
  dataFields: string[];
  lowesCategory?: string;
  supportsAlwaysReplace: boolean;
  defaultActionMode: ChecklistDefaultActionMode;
  preferredReplaceOption?: string;
  preferredProductTier?: TurnoverPresetProductTier;
  turnoverPresetId?: TurnoverPresetId | null;
  turnoverPresetNotes?: string;
  scopedOverrideId?: string;
  scopedOverrideScopeType?: ChecklistOverrideScopeType;
  scopedOverrideScopeRefId?: string;
  scopedOverrideNotes?: string;
  itemType: ChecklistItemType;
  inputMode: ChecklistItemInputMode;
  status: GeneratedInspectionItemStatus;
  required: boolean;
  photoIds: string[];
  defaultQuantity?: number;
  materialReference?: ChecklistItemMaterialReference;
  inputValue?: ChecklistItemInputValue;
  roomType?: LayoutRoomType;
  roomLabel?: string;
  notes?: string;
  focusedAction?: FocusedItemAction;
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
