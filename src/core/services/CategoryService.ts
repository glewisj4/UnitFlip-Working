import { Category } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { createId } from '../../services/storage';

const adapter = createLocalDbAdapter();

export class CategoryService {
  private static getStoreKey(orgId: string) {
    return `unitflip_categories_v1:${orgId}`;
  }

  static async getCategories(orgId: string): Promise<Category[]> {
    const categories = await adapter.getItem<Category[]>(this.getStoreKey(orgId));
    return categories || [];
  }

  static async saveCategories(orgId: string, categories: Category[]): Promise<void> {
    await adapter.setItem(this.getStoreKey(orgId), categories);
  }

  static async addCategory(orgId: string, name: string, parentCategoryId?: string | null): Promise<Category> {
    const categories = await this.getCategories(orgId);

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name cannot be empty.');

    // Check for duplicates within the same parent scope
    const duplicate = categories.find(
      c => c.name.toLowerCase() === trimmed.toLowerCase() && 
           (c.parentCategoryId || null) === (parentCategoryId || null)
    );
    
    if (duplicate) {
      const parentName = parentCategoryId 
        ? categories.find(c => c.id === parentCategoryId)?.name 
        : 'Top-level';
      throw new Error(`Category "${trimmed}" already exists under ${parentName}.`);
    }

    const newCategory: Category = {
      id: createId(),
      orgId,
      name: trimmed,
      parentCategoryId: parentCategoryId || null,
      sortOrder: categories.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    categories.push(newCategory);
    await this.saveCategories(orgId, categories);
    return newCategory;
  }

  static async getSubcategories(orgId: string, parentCategoryId: string): Promise<Category[]> {
    const categories = await this.getCategories(orgId);
    return categories.filter(c => c.parentCategoryId === parentCategoryId);
  }

  static async updateCategory(orgId: string, categoryId: string, updates: Partial<Category>): Promise<Category> {
    const categories = await this.getCategories(orgId);
    const index = categories.findIndex(c => c.id === categoryId);
    if (index === -1) throw new Error('Category not found');

    const updatedCategory = {
      ...categories[index],
      ...updates,
      updatedAt: Date.now(),
    };
    categories[index] = updatedCategory;
    await this.saveCategories(orgId, categories);
    return updatedCategory;
  }

  static async renameCategory(orgId: string, categoryId: string, newName: string): Promise<void> {
    const categories = await this.getCategories(orgId);
    const index = categories.findIndex(c => c.id === categoryId);
    if (index === -1) throw new Error('Category not found');

    categories[index] = {
      ...categories[index],
      name: newName,
      updatedAt: Date.now(),
    };
    await this.saveCategories(orgId, categories);
  }

  static async deleteCategory(orgId: string, categoryId: string): Promise<void> {
    const categories = await this.getCategories(orgId);
    
    // Promote subcategories to top-level
    const updatedCategories = categories.map(c => {
      if (c.parentCategoryId === categoryId) {
        return { ...c, parentCategoryId: null, updatedAt: Date.now() };
      }
      return c;
    });

    const filtered = updatedCategories.filter(c => c.id !== categoryId);
    await this.saveCategories(orgId, filtered);
  }
}
