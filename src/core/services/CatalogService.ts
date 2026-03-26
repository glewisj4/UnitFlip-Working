import { CatalogItem, Category, ProductOption, Tier } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { createId } from '../../services/storage';

const adapter = createLocalDbAdapter();

export class CatalogService {
  private static getStoreKey(orgId: string) {
    return `unitflip_catalog_items_v1:${orgId}`;
  }

  static async getItems(orgId: string): Promise<CatalogItem[]> {
    let items = await adapter.getItem<CatalogItem[]>(this.getStoreKey(orgId));
    
    // Migration: If no catalog items found, try to migrate from old products
    if (!items || items.length === 0) {
      const oldData = await adapter.getItem<any>('unitflip_db_v2');
      if (oldData && oldData.products) {
        items = oldData.products.map((p: any) => ({
          id: p.id,
          orgId,
          name: p.name,
          categoryId: undefined,
          categoryName: p.category,
          topLevelCategory: p.category,
          subcategory: undefined,
          equivalentGroup: undefined,
          functionalTags: [],
          vendor: undefined,
          importSource: 'manual',
          description: p.description,
          tags: [],
          defaultQty: p.quantity || 1,
          unit: p.unit || 'ea',
          defaultTier: p.options?.[0]?.tier || Tier.STANDARD,
          options: p.options || [],
          createdAt: p.createdAt || Date.now(),
          updatedAt: Date.now(),
        }));
        await this.saveItems(orgId, items);
      }
    }

    return (items || []).map((item) => this.normalizeItem(item));
  }

  static async getItem(orgId: string, itemId: string): Promise<CatalogItem | undefined> {
    const items = await this.getItems(orgId);
    return items.find(i => i.id === itemId);
  }

  static async saveItems(orgId: string, items: CatalogItem[]): Promise<void> {
    await adapter.setItem(this.getStoreKey(orgId), items);
  }

  static async addItem(orgId: string, item: Omit<CatalogItem, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const newItem = this.normalizeItem({
      ...item,
      id: createId(),
      orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    items.push(newItem);
    await this.saveItems(orgId, items);
    return newItem;
  }

  static async updateItem(orgId: string, itemId: string, updates: Partial<CatalogItem>): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) throw new Error('Item not found');

    const updatedItem = this.normalizeItem({
      ...items[index],
      ...updates,
      updatedAt: Date.now(),
    });
    items[index] = updatedItem;
    await this.saveItems(orgId, items);
    return updatedItem;
  }

  static async deleteItem(orgId: string, itemId: string): Promise<void> {
    const items = await this.getItems(orgId);
    const filtered = items.filter(i => i.id !== itemId);
    await this.saveItems(orgId, filtered);
  }

  static async duplicateItem(orgId: string, itemId: string): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const item = items.find(i => i.id === itemId);
    if (!item) throw new Error('Item not found');

    const newItem = this.normalizeItem({
      ...item,
      id: createId(),
      name: `${item.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    items.push(newItem);
    await this.saveItems(orgId, items);
    return newItem;
  }

  private static normalizeItem(item: CatalogItem): CatalogItem {
    return {
      ...item,
      tags: Array.isArray(item.tags) ? item.tags : [],
      functionalTags: Array.isArray(item.functionalTags) ? item.functionalTags : [],
      topLevelCategory: item.topLevelCategory || item.categoryName || item.category,
      subcategory: item.subcategory || undefined,
      equivalentGroup: item.equivalentGroup || undefined,
      vendor: item.vendor || item.options?.[0]?.brand || undefined,
      importSource: item.importSource || 'manual',
      options: Array.isArray(item.options) ? item.options : [],
    };
  }
}
