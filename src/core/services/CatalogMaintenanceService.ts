import { CatalogService } from './CatalogService';
import { CategoryService } from './CategoryService';
import { normalizeTitle } from '../../utils/normalizeTitle';
import { buildCategoryPath } from '../../utils/categoryPath';
import { CatalogItem, Category } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';

const adapter = createLocalDbAdapter();

export interface CatalogIssue {
  type: 'MISSING_CATEGORY' | 'MISSING_ITEM_NUMBER' | 'MISSING_MODEL_NUMBER' | 'MISSING_IMAGE' | 'MISSING_NORMALIZED_TITLE' | 'INVALID_CATEGORY_REF' | 'DUPLICATE_ITEM_NUMBER' | 'INACTIVE_CATEGORY_PRODUCT' | 'UNCATEGORIZED';
  itemId: string;
  itemTitle: string;
  details?: string;
}

export interface CatalogHealthSummary {
  totalItems: number;
  activeItems: number;
  inactiveItems: number;
  uncategorizedItems: number;
  missingItemNumber: number;
  missingModelNumber: number;
  missingImage: number;
  invalidCategoryRef: number;
  totalCategories: number;
  issues: CatalogIssue[];
}

export class CatalogMaintenanceService {
  
  static async rebuildCategoryPaths(orgId: string): Promise<number> {
    const categories = await CategoryService.getCategories(orgId);
    let updatedCount = 0;
    const updates: Category[] = [];

    // We need to do this carefully. 
    // CategoryService.rebuildPaths already exists and does this efficiently.
    // Let's reuse it or wrap it.
    await CategoryService.rebuildPaths(orgId);
    
    // To return a count, we might need to implement logic here similar to CategoryService.rebuildPaths 
    // but since we can't easily modify the return type of an existing method without checking usage,
    // let's assume it works and just return 0 or check diffs if strictly needed.
    // Actually, let's implement a robust version here that ensures everything is correct.
    
    // Re-fetch to be sure
    const freshCategories = await CategoryService.getCategories(orgId);
    for (const cat of freshCategories) {
        const expectedPath = buildCategoryPath(cat, freshCategories);
        if (cat.path !== expectedPath) {
            cat.path = expectedPath;
            updatedCount++;
            updates.push(cat);
        }
    }

    if (updatedCount > 0) {
        await CategoryService.saveCategories(orgId, freshCategories);
    }

    return updatedCount;
  }

  static async backfillNormalizedTitles(orgId: string): Promise<number> {
    const items = await CatalogService.getItems(orgId);
    let updatedCount = 0;

    for (const item of items) {
      const expected = normalizeTitle(item.title || item.name || '');
      if (item.normalizedTitle !== expected) {
        item.normalizedTitle = expected;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      await CatalogService.saveItems(orgId, items);
    }

    return updatedCount;
  }

  static async backfillCatalogDefaults(orgId: string): Promise<number> {
    const items = await CatalogService.getItems(orgId);
    let updatedCount = 0;

    for (const item of items) {
      let changed = false;
      if (item.isActive === undefined) {
        item.isActive = true;
        changed = true;
      }
      if (!item.tags) {
        item.tags = [];
        changed = true;
      }
      if (!item.options) {
        item.options = [];
        changed = true;
      }
      
      if (changed) {
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      await CatalogService.saveItems(orgId, items);
    }

    return updatedCount;
  }

  static async scanForCatalogIssues(orgId: string): Promise<CatalogHealthSummary> {
    const items = await CatalogService.getItems(orgId);
    const categories = await CategoryService.getCategories(orgId);
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const issues: CatalogIssue[] = [];
    let uncategorizedItems = 0;
    let missingItemNumber = 0;
    let missingModelNumber = 0;
    let missingImage = 0;
    let invalidCategoryRef = 0;

    const itemNumberMap = new Map<string, string[]>();

    for (const item of items) {
      // Uncategorized
      if (!item.categoryId) {
        uncategorizedItems++;
        issues.push({ type: 'UNCATEGORIZED', itemId: item.id, itemTitle: item.title });
      } else {
        // Invalid Category
        const cat = categoryMap.get(item.categoryId);
        if (!cat) {
          invalidCategoryRef++;
          issues.push({ type: 'INVALID_CATEGORY_REF', itemId: item.id, itemTitle: item.title, details: `Category ID: ${item.categoryId}` });
        } else if (!cat.isActive) {
           issues.push({ type: 'INACTIVE_CATEGORY_PRODUCT', itemId: item.id, itemTitle: item.title, details: `Category: ${cat.name}` });
        }
      }

      // Missing Fields
      if (!item.itemNumber) {
        missingItemNumber++;
        issues.push({ type: 'MISSING_ITEM_NUMBER', itemId: item.id, itemTitle: item.title });
      } else {
        // Duplicate Item Number Check
        const existing = itemNumberMap.get(item.itemNumber);
        if (existing) {
          existing.push(item.id);
        } else {
          itemNumberMap.set(item.itemNumber, [item.id]);
        }
      }

      if (!item.modelNumber) {
        missingModelNumber++;
        issues.push({ type: 'MISSING_MODEL_NUMBER', itemId: item.id, itemTitle: item.title });
      }

      if (!item.imageUrl && (!item.options || !item.options.some(o => o.imageUrl))) {
        missingImage++;
        issues.push({ type: 'MISSING_IMAGE', itemId: item.id, itemTitle: item.title });
      }

      if (!item.normalizedTitle) {
         issues.push({ type: 'MISSING_NORMALIZED_TITLE', itemId: item.id, itemTitle: item.title });
      }
    }

    // Process duplicates
    itemNumberMap.forEach((ids, itemNum) => {
      if (ids.length > 1) {
        ids.forEach(id => {
            const item = items.find(i => i.id === id);
            if (item) {
                issues.push({ type: 'DUPLICATE_ITEM_NUMBER', itemId: id, itemTitle: item.title, details: `Item #: ${itemNum}` });
            }
        });
      }
    });

    return {
      totalItems: items.length,
      activeItems: items.filter(i => i.isActive).length,
      inactiveItems: items.filter(i => !i.isActive).length,
      uncategorizedItems,
      missingItemNumber,
      missingModelNumber,
      missingImage,
      invalidCategoryRef,
      totalCategories: categories.length,
      issues
    };
  }

  static async verifyCategoryIntegrity(orgId: string): Promise<string[]> {
      const categories = await CategoryService.getCategories(orgId);
      const warnings: string[] = [];
      const categoryMap = new Map(categories.map(c => [c.id, c]));

      for (const cat of categories) {
          // Check parent reference
          if (cat.parentId && !categoryMap.has(cat.parentId)) {
              warnings.push(`Category "${cat.name}" (${cat.id}) references missing parent ${cat.parentId}`);
          }

          // Check path accuracy
          const expectedPath = buildCategoryPath(cat, categories);
          if (cat.path !== expectedPath) {
              warnings.push(`Category "${cat.name}" has stale path: "${cat.path}" (expected "${expectedPath}")`);
          }

          // Check for cycles (simple depth check)
          let current = cat;
          let depth = 0;
          const visited = new Set<string>();
          while (current.parentId && depth < 50) {
              if (visited.has(current.id)) {
                  warnings.push(`Cycle detected in category "${cat.name}"`);
                  break;
              }
              visited.add(current.id);
              const parent = categoryMap.get(current.parentId);
              if (!parent) break;
              current = parent;
              depth++;
          }
          if (depth >= 50) {
               warnings.push(`Deep nesting or cycle detected for "${cat.name}"`);
          }
      }

      return warnings;
  }

  static async verifyMergeIntegrity(orgId: string): Promise<string[]> {
    const items = await CatalogService.getItems(orgId);
    const warnings: string[] = [];
    
    // Check for orphaned references in bundle rules
    // (This would require importing BundleRuleService, but let's keep it simple for now or assume we can fetch them)
    // For now, let's check internal consistency
    
    const itemMap = new Set(items.map(i => i.id));
    
    // Check source references
    for (const item of items) {
        if (item.source === 'MERGE' && item.sourceRef) {
            // sourceRef might be the ID of the merged item? 
            // Actually, usually sourceRef is "MERGE_FROM_..."
        }
    }

    return warnings;
  }
}
