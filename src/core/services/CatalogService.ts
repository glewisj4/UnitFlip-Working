import { CatalogItem, Category, ProductOption, Tier } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { createId } from '../../services/storage';
import { normalizeTitle } from '../../utils/normalizeTitle';
import { AuditLogService } from './AuditLogService';

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
          title: p.name,
          normalizedTitle: normalizeTitle(p.name),
          categoryId: undefined,
          categoryName: p.category,
          description: p.description,
          tags: [],
          defaultQty: p.quantity || 1,
          unit: p.unit || 'ea',
          defaultTier: p.options?.[0]?.tier || Tier.STANDARD,
          options: p.options || [],
          isActive: true,
          createdAt: new Date(p.createdAt || Date.now()).toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        await this.saveItems(orgId, items);
      }
    }
    
    // Ensure all items have new fields populated
    if (items) {
      return items.map(i => ({
        ...i,
        title: i.title || i.name || 'Untitled',
        normalizedTitle: i.normalizedTitle || normalizeTitle(i.title || i.name || ''),
        isActive: i.isActive ?? true,
        createdAt: typeof i.createdAt === 'number' ? new Date(i.createdAt).toISOString() : i.createdAt,
        updatedAt: typeof i.updatedAt === 'number' ? new Date(i.updatedAt).toISOString() : i.updatedAt,
      }));
    }

    return items || [];
  }

  static async getItem(orgId: string, itemId: string): Promise<CatalogItem | undefined> {
    const items = await this.getItems(orgId);
    return items.find(i => i.id === itemId);
  }

  static async saveItems(orgId: string, items: CatalogItem[]): Promise<void> {
    await adapter.setItem(this.getStoreKey(orgId), items);
  }

  static async addItem(orgId: string, item: Partial<CatalogItem>): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    
    // Validate
    if (!item.title) throw new Error('Title is required');
    if (item.defaultPrice !== undefined && item.defaultPrice < 0) throw new Error('Price must be >= 0');

    // Check uniqueness of itemNumber if provided
    if (item.itemNumber) {
      const duplicate = items.find(i => i.itemNumber === item.itemNumber);
      if (duplicate) {
        throw new Error(`Item number "${item.itemNumber}" already exists.`);
      }
    }

    const newItem: CatalogItem = {
      id: createId(),
      orgId,
      title: item.title,
      normalizedTitle: normalizeTitle(item.title),
      itemNumber: item.itemNumber,
      modelNumber: item.modelNumber,
      brand: item.brand,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      defaultPrice: item.defaultPrice,
      priceSource: item.priceSource,
      imageUrl: item.imageUrl,
      description: item.description,
      tags: item.tags || [],
      isActive: item.isActive ?? true,
      source: item.source,
      sourceRef: item.sourceRef,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
      lastVerifiedAt: item.lastVerifiedAt,
      notes: item.notes,
      // Legacy fields
      name: item.title,
      defaultQty: item.defaultQty || 1,
      unit: item.unit || 'ea',
      defaultTier: item.defaultTier || Tier.STANDARD,
      options: item.options || [],
    };

    items.push(newItem);
    await this.saveItems(orgId, items);

    // Audit Log
    await AuditLogService.logEvent({
      orgId,
      userId: item.createdBy || 'system',
      userRole: 'manager', // Default
      type: 'CATALOG_ITEM_CREATED',
      entityId: newItem.id,
      message: `Created catalog item: ${newItem.title}`,
    });

    return newItem;
  }

  static async updateItem(orgId: string, itemId: string, updates: Partial<CatalogItem>): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const index = items.findIndex(i => i.id === itemId);
    if (index === -1) throw new Error('Item not found');

    // Validate
    if (updates.title === '') throw new Error('Title cannot be empty');
    if (updates.defaultPrice !== undefined && updates.defaultPrice < 0) throw new Error('Price must be >= 0');

    // Check uniqueness of itemNumber if provided and changed
    if (updates.itemNumber && updates.itemNumber !== items[index].itemNumber) {
      const duplicate = items.find(i => i.itemNumber === updates.itemNumber && i.id !== itemId);
      if (duplicate) {
        throw new Error(`Item number "${updates.itemNumber}" already exists.`);
      }
    }

    const updatedItem = {
      ...items[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    if (updates.title) {
      updatedItem.normalizedTitle = normalizeTitle(updates.title);
      updatedItem.name = updates.title; // Sync legacy field
    }

    items[index] = updatedItem;
    await this.saveItems(orgId, items);

    // Audit Log
    await AuditLogService.logEvent({
      orgId,
      userId: updates.updatedBy || 'system',
      userRole: 'manager',
      type: 'CATALOG_ITEM_UPDATED',
      entityId: updatedItem.id,
      message: `Updated catalog item: ${updatedItem.title}`,
    });

    return updatedItem;
  }

  static async deleteItem(orgId: string, itemId: string): Promise<void> {
    const items = await this.getItems(orgId);
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const filtered = items.filter(i => i.id !== itemId);
    await this.saveItems(orgId, filtered);

    // Audit Log
    await AuditLogService.logEvent({
      orgId,
      userId: 'system', // We don't have userId here easily without passing it
      userRole: 'manager',
      type: 'CATALOG_ITEM_DELETED',
      entityId: itemId,
      message: `Deleted catalog item: ${item.title}`,
    });
  }

  static async duplicateItem(orgId: string, itemId: string): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const item = items.find(i => i.id === itemId);
    if (!item) throw new Error('Item not found');

    const newItem: CatalogItem = {
      ...item,
      id: createId(),
      title: `${item.title} (Copy)`,
      normalizedTitle: normalizeTitle(`${item.title} (Copy)`),
      itemNumber: undefined, // Clear unique fields
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.push(newItem);
    await this.saveItems(orgId, items);

    // Audit Log
    await AuditLogService.logEvent({
      orgId,
      userId: 'system',
      userRole: 'manager',
      type: 'CATALOG_ITEM_CREATED',
      entityId: newItem.id,
      message: `Duplicated catalog item: ${newItem.title}`,
    });

    return newItem;
  }
}
