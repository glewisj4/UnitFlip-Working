export enum Tier {
  BUDGET = 'Budget',
  STANDARD = 'Standard',
  PREMIUM = 'Premium',
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
}

export interface Category {
  id: string;
  orgId: string;
  name: string;
  parentId?: string | null;
  path?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  
  // Legacy fields for backward compatibility during migration
  parentCategoryId?: string | null;
  color?: string;
  icon?: string;
}

export interface CatalogItem {
  id: string;
  orgId: string;
  
  title: string;
  normalizedTitle: string;
  
  itemNumber?: string;
  modelNumber?: string;
  brand?: string;
  
  categoryId?: string;
  categoryName?: string; // Denormalized for quick access
  
  defaultPrice?: number;
  priceSource?: string;
  
  imageUrl?: string;
  
  description?: string;
  tags?: string[];
  
  isActive: boolean;
  
  source?: string;
  sourceRef?: string;
  
  createdAt: string; // ISO
  updatedAt: string; // ISO
  createdBy?: string;
  updatedBy?: string;
  
  lastVerifiedAt?: string;
  notes?: string;

  // Legacy fields for backward compatibility
  name?: string;
  defaultQty?: number;
  unit?: string;
  defaultTier?: Tier;
  options?: ProductOption[];
  roomId?: string;
  category?: string;
  status?: ProductStatus;
  actualCost?: number;
  quantity?: number;
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
  addedAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Room {
  id: string;
  name: string;
  icon: string; // Lucide icon name
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
  createdDate: string | null; // ISO date
  validUntil: string | null; // ISO date
  subtotal: number | null;
  estimatedTotal: number | null;
  filename: string;
  fileRef: string; // reference to stored PDF blob
  createdAt: string; // ISO
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
  type: string | null;
  unitPrice: number | null;
  qty: number | null;
  status: StagedProductStatus;
  suggestedCategoryId: string | null;
  approvedCatalogItemId: string | null;
  duplicateOfStagedProductId: string | null;
  notes: string | null;
  createdAt: string; // ISO
  
  // New fields
  imageUrl?: string | null;
  duplicateCandidate?: boolean;
  duplicateTargetId?: string | null;
}
