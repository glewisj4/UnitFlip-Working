import { Category } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { createId } from '../../services/storage';
import { CatalogService } from './CatalogService';
import { buildCategoryPath, getDescendants } from '../../utils/categoryPath';

const adapter = createLocalDbAdapter();

export class CategoryService {
  private static getStoreKey(orgId: string) {
    return `unitflip_categories_v1:${orgId}`;
  }

  static async getCategories(orgId: string): Promise<Category[]> {
    const data = await adapter.getItem<Category[]>(this.getStoreKey(orgId));
    if (!data) return [];

    // Migration: ensure parentId is set (from parentCategoryId if needed) and dates are strings
    return data.map(c => ({
      ...c,
      parentId: c.parentId ?? c.parentCategoryId ?? null,
      // If createdAt is a number, convert to ISO string
      createdAt: typeof c.createdAt === 'number' ? new Date(c.createdAt).toISOString() : c.createdAt,
      updatedAt: typeof c.updatedAt === 'number' ? new Date(c.updatedAt).toISOString() : c.updatedAt,
      isActive: c.isActive ?? true,
      sortOrder: c.sortOrder ?? 0,
      path: c.path ?? '',
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      keywordHints: Array.isArray(c.keywordHints) ? c.keywordHints : [],
      lowesCategoryHints: Array.isArray(c.lowesCategoryHints) ? c.lowesCategoryHints : [],
    }));
  }

  static async saveCategories(orgId: string, categories: Category[]): Promise<void> {
    await adapter.setItem(this.getStoreKey(orgId), categories);
  }

  static async addCategory(orgId: string, name: string, parentId?: string | null): Promise<Category> {
    const categories = await this.getCategories(orgId);

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name cannot be empty.');

    // Check for duplicates within the same parent scope
    const duplicate = categories.find(
      c => c.name.toLowerCase() === trimmed.toLowerCase() && 
           (c.parentId || null) === (parentId || null)
    );
    
    if (duplicate) {
      const parentName = parentId 
        ? categories.find(c => c.id === parentId)?.name 
        : 'Top-level';
      throw new Error(`Category "${trimmed}" already exists under ${parentName}.`);
    }

    // Calculate sort order (append to end)
    const siblings = categories.filter(c => (c.parentId || null) === (parentId || null));
    const maxSortOrder = siblings.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const newCategory: Category = {
      id: createId(),
      orgId,
      name: trimmed,
      parentId: parentId || null,
      sortOrder: maxSortOrder + 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      path: '', 
    };

    // Calculate path
    newCategory.path = buildCategoryPath(newCategory, categories);

    categories.push(newCategory);
    await this.saveCategories(orgId, categories);
    return newCategory;
  }

  static async updateCategory(orgId: string, categoryId: string, updates: Partial<Category>): Promise<Category> {
    const categories = await this.getCategories(orgId);
    const index = categories.findIndex(c => c.id === categoryId);
    if (index === -1) throw new Error('Category not found');

    const original = categories[index];
    
    // Guard against self-parenting or cycles if parentId is changing
    if (updates.parentId && updates.parentId !== original.parentId) {
      if (updates.parentId === categoryId) {
        throw new Error('Cannot assign category as its own parent.');
      }
      const descendants = getDescendants(categoryId, categories);
      if (descendants.some(d => d.id === updates.parentId)) {
        throw new Error('Cannot assign category to one of its descendants.');
      }
    }

    const updatedCategory = {
      ...original,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Update in array temporarily to calculate paths
    categories[index] = updatedCategory;

    // If name or parent changed, recalculate paths for self and descendants
    if (updates.name || (updates.parentId !== undefined && updates.parentId !== original.parentId)) {
      updatedCategory.path = buildCategoryPath(updatedCategory, categories);
      
      const descendants = getDescendants(categoryId, categories);
      for (const desc of descendants) {
        const dIndex = categories.findIndex(c => c.id === desc.id);
        if (dIndex !== -1) {
          categories[dIndex].path = buildCategoryPath(categories[dIndex], categories);
        }
      }
    }

    await this.saveCategories(orgId, categories);
    return updatedCategory;
  }

  static async deleteCategory(orgId: string, categoryId: string): Promise<void> {
    const categories = await this.getCategories(orgId);
    
    // Check for children
    const hasChildren = categories.some(c => c.parentId === categoryId);
    if (hasChildren) {
      throw new Error('Cannot delete category with subcategories. Please move or delete them first.');
    }

    // Check for products
    const products = await CatalogService.getItems(orgId);
    const hasProducts = products.some(p => p.categoryId === categoryId);
    if (hasProducts) {
      throw new Error('Cannot delete category with assigned products. Please reassign them first.');
    }

    const filtered = categories.filter(c => c.id !== categoryId);
    await this.saveCategories(orgId, filtered);
  }

  static async reorderCategories(orgId: string, parentId: string | null, orderedIds: string[]): Promise<void> {
    const categories = await this.getCategories(orgId);
    
    let hasUpdates = false;
    const updatesToProcess: string[] = [];

    orderedIds.forEach((id, index) => {
      const catIndex = categories.findIndex(c => c.id === id);
      if (catIndex !== -1) {
        const cat = categories[catIndex];
        if (cat.sortOrder !== index || cat.parentId !== parentId) {
           const oldParentId = cat.parentId;
           
           categories[catIndex].sortOrder = index;
           categories[catIndex].parentId = parentId;
           categories[catIndex].updatedAt = new Date().toISOString();
           hasUpdates = true;

           if (parentId !== oldParentId) {
             updatesToProcess.push(id);
           }
        }
      }
    });

    // Recalculate paths for moved items and their descendants
    if (updatesToProcess.length > 0) {
      for (const id of updatesToProcess) {
        const catIndex = categories.findIndex(c => c.id === id);
        if (catIndex !== -1) {
          categories[catIndex].path = buildCategoryPath(categories[catIndex], categories);
          
          const descendants = getDescendants(id, categories);
          for (const desc of descendants) {
             const dIndex = categories.findIndex(c => c.id === desc.id);
             if (dIndex !== -1) {
               categories[dIndex].path = buildCategoryPath(categories[dIndex], categories);
             }
          }
        }
      }
    }

    if (hasUpdates) {
      await this.saveCategories(orgId, categories);
    }
  }

  static async assignProductsToCategory(orgId: string, productIds: string[], categoryId: string): Promise<void> {
    // Verify category exists
    const categories = await this.getCategories(orgId);
    const category = categories.find(c => c.id === categoryId);
    if (!category) throw new Error('Category not found');

    for (const productId of productIds) {
      await CatalogService.updateItem(orgId, productId, { 
        categoryId: categoryId,
        categoryName: category.name // Denormalize for performance
      });
    }
  }

  static async getCategoryTree(orgId: string): Promise<CategoryNode[]> {
    const categories = await this.getCategories(orgId);
    
    // Sort by sortOrder
    categories.sort((a, b) => a.sortOrder - b.sortOrder);

    const buildTree = (parentId: string | null): CategoryNode[] => {
      return categories
        .filter(c => (c.parentId || null) === (parentId || null))
        .map(c => ({
          ...c,
          children: buildTree(c.id)
        }));
    };

    return buildTree(null);
  }

  static async rebuildPaths(orgId: string): Promise<void> {
    const categories = await this.getCategories(orgId);
    let changed = false;

    for (let i = 0; i < categories.length; i++) {
      const newPath = buildCategoryPath(categories[i], categories);
      if (categories[i].path !== newPath) {
        categories[i].path = newPath;
        changed = true;
      }
    }

    if (changed) {
      await this.saveCategories(orgId, categories);
    }
  }
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}
