export enum Tier {
  BUDGET = 'Budget',
  STANDARD = 'Standard',
  PREMIUM = 'Premium',
}

export type CatalogSourceConfidence = 'high' | 'medium' | 'low';

export interface CatalogArchetype {
  id: string;
  displayName: string;
  categoryHint: string;
  keywords: string[];
  unitType: string;
  lowesCategoryHint?: string;
  equivalentGroup?: string;
}

export enum ProductStatus {
  PLANNING = 'Planning',
  REPLACED = 'Replaced',
  REFRESHED = 'Refreshed',
  REPAIRED = 'Repaired',
  ORDERED = 'Ordered',
  INSTALLED = 'Installed',
}

export interface ProductOption {
  id: string;
  name: string;
  price: number;
  sku: string;
  url?: string;
  tier: Tier;
  imageUrl?: string;
  description?: string;
  brand?: string;
  modelNumber?: string;
  packSize?: number;
  coverage?: string;
}

export interface Category {
  id: string;
  orgId: string;
  name: string;
  parentId?: string | null;
  path?: string;
  sortOrder: number;
  isActive?: boolean;
  createdAt: string | number;
  updatedAt: string | number;
  aliases?: string[];
  keywordHints?: string[];
  lowesCategoryHints?: string[];

  // Legacy fields for backward compatibility during migration
  parentCategoryId?: string | null;
  color?: string;
  icon?: string;
}

export type CatalogCategoryAssignmentMethod =
  | 'provided_exact'
  | 'provided_alias'
  | 'org_memory'
  | 'keyword_heuristic'
  | 'fallback_uncategorized'
  | 'manual_review';

export interface CatalogCategoryAssignment {
  assignedCategoryId?: string;
  assignmentMethod: CatalogCategoryAssignmentMethod;
  confidence: number;
  matchedSignals: string[];
  needsReview: boolean;
  sourceCategoryPath?: string;
  sourceTitleFingerprint?: string;
  sourceHintLabel?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface CatalogCategoryCorrectionMemory {
  id: string;
  orgId: string;
  matchType: 'category_path' | 'title_fingerprint';
  matchValue: string;
  categoryId: string;
  categoryName?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  notes?: string;
}

export interface CatalogItem {
  id: string;
  orgId: string;

  // Canonical and legacy title fields coexist for migration compatibility.
  title: string;
  normalizedTitle: string;
  name: string;

  itemNumber?: string;
  modelNumber?: string;
  brand?: string;

  categoryId?: string;
  categoryName?: string;
  topLevelCategory?: string;
  subcategory?: string;
  equivalentGroup?: string;
  archetypeId?: string;
  functionalTags?: string[];
  vendor?: string;
  importSource?: 'manual' | 'csv' | 'text_paste' | 'quote_pdf' | 'quick_add' | 'manual_lowes';

  defaultPrice?: number;
  priceSource?: string;
  imageUrl?: string;
  description?: string;
  tags: string[];

  isActive: boolean;

  source?: string;
  sourceRef?: string;
  categoryAssignment?: CatalogCategoryAssignment;

  createdAt: string | number;
  updatedAt: string | number;
  createdBy?: string;
  updatedBy?: string;

  lastVerifiedAt?: string;
  notes?: string;
  keywordHints?: string[];
  lowesCategoryHint?: string;
  sourceConfidence?: CatalogSourceConfidence;
  lastReviewedAt?: string;
  packSize?: number;
  coverage?: string;

  // Legacy fields for backward compatibility
  defaultQty?: number;
  unit?: string;
  defaultTier?: Tier;
  options?: ProductOption[];
  roomId?: string;
  category?: string;
  status?: ProductStatus;
  actualCost?: number;
  quantity?: number;
  seedMarker?: {
    isSeedData: true;
    seedBatch: string;
  };
}

export interface BundleCompanion {
  catalogItemId: string;
  defaultQty: number;
  required: boolean;
  note?: string;
}

export interface BundleRule {
  id: string;
  orgId: string;
  triggerCatalogItemId: string;
  companions: BundleCompanion[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ListRef {
  kind: 'inspection' | 'room' | 'repairKit' | 'unit';
  id: string;
}

export interface ProductInstance {
  id: string;
  orgId: string;
  listRef: ListRef;
  catalogItemId: string;
  qty: number;
  unit: string;
  selectedOptionId?: string;
  status: ProductStatus;
  notes?: string;
  addedAt: string | number;
  updatedAt: string | number;
}

export interface Room {
  id: string;
  name: string;
  icon: string;
  description?: string;
  budget: number;
}

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  defaultPrice: number;
  tier: Tier;
}

export interface RepairTemplate {
  id: string;
  name: string;
  description: string;
  items: TemplateItem[];
}

export interface AppState {
  rooms: Room[];
  products: CatalogItem[];
  categories: Category[];
  bundleRules: BundleRule[];
  repairTemplates: RepairTemplate[];
}

export type ImportBatchStatus = 'PARSING' | 'FAILED' | 'STAGED' | 'APPROVED' | 'DELETED';

export interface ImportBatch {
  id: string;
  orgId: string;
  source: 'LOWES_QUOTE_PDF';
  status: ImportBatchStatus;
  quoteNumber: string | null;
  storeNumber: string | null;
  createdDate: string | null;
  validUntil: string | null;
  subtotal: number | null;
  estimatedTotal: number | null;
  filename: string;
  fileRef: string;
  createdAt: string;
  createdBy: string | null;
}

export type StagedProductStatus = 'STAGED' | 'APPROVED' | 'MERGED' | 'REJECTED' | 'NEEDS_REVIEW';

export interface StagedProduct {
  id: string;
  orgId: string;
  importBatchId: string;
  lineNumber: number;
  rawTitle: string;
  normalizedTitle: string;
  itemNumber: string | null;
  modelNumber: string | null;
  fulfillment?: string | null;
  type: string | null;
  unitPrice: number | null;
  qty: number | null;
  lineTotal?: number | null;
  status: StagedProductStatus;
  suggestedCategoryId: string | null;
  approvedCatalogItemId: string | null;
  duplicateOfStagedProductId: string | null;
  notes: string | null;
  createdAt: string;
  imageUrl?: string | null;
  duplicateCandidate?: boolean;
  duplicateTargetId?: string | null;
}
