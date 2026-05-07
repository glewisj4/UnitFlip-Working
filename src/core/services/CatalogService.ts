import { CatalogItem, Tier } from '../models/types';
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

    if (!items || items.length === 0) {
      const oldData = await adapter.getItem<any>('unitflip_db_v2');
      if (oldData && oldData.products) {
        items = oldData.products.map((product: any) =>
          this.normalizeItem({
            id: product.id,
            orgId,
            title: product.name || 'Untitled',
            name: product.name || 'Untitled',
            normalizedTitle: normalizeTitle(product.name || 'Untitled'),
            categoryId: undefined,
            categoryName: product.category,
            topLevelCategory: product.category,
            description: product.description,
            tags: [],
            functionalTags: [],
            defaultQty: product.quantity || 1,
            unit: product.unit || 'ea',
            defaultTier: product.options?.[0]?.tier || Tier.STANDARD,
            options: product.options || [],
            defaultPrice: product.defaultPrice,
            isActive: true,
            importSource: 'manual',
            createdAt: product.createdAt || Date.now(),
            updatedAt: Date.now(),
          }),
        );
        await this.saveItems(orgId, items);
      }
    }

    return (items || []).map((item) => this.normalizeItem(item));
  }

  static async getItem(orgId: string, itemId: string): Promise<CatalogItem | undefined> {
    const items = await this.getItems(orgId);
    return items.find((item) => item.id === itemId);
  }

  static async saveItems(orgId: string, items: CatalogItem[]): Promise<void> {
    await adapter.setItem(this.getStoreKey(orgId), items.map((item) => this.normalizeItem(item)));
  }

  static async addItem(orgId: string, item: Partial<CatalogItem>): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const title = (item.title || item.name || '').trim();
    if (!title) throw new Error('Title is required');
    if (item.defaultPrice !== undefined && item.defaultPrice < 0) throw new Error('Price must be >= 0');

    if (item.itemNumber) {
      const duplicate = items.find((entry) => entry.itemNumber === item.itemNumber);
      if (duplicate) {
        throw new Error(`Item number "${item.itemNumber}" already exists.`);
      }
    }

    const newItem = this.normalizeItem({
      ...item,
      id: createId(),
      orgId,
      title,
      name: title,
      normalizedTitle: normalizeTitle(title),
      tags: item.tags || [],
      functionalTags: item.functionalTags || [],
      defaultQty: item.defaultQty || 1,
      unit: item.unit || 'ea',
      defaultTier: item.defaultTier || Tier.STANDARD,
      options: item.options || [],
      isActive: item.isActive ?? true,
      importSource: item.importSource || 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as CatalogItem);

    items.push(newItem);
    await this.saveItems(orgId, items);

    await AuditLogService.logEvent({
      orgId,
      userId: item.createdBy || 'system',
      userRole: 'manager',
      type: 'CATALOG_ITEM_CREATED',
      entityId: newItem.id,
      message: `Created catalog item: ${newItem.title}`,
    });

    return newItem;
  }

  static async updateItem(orgId: string, itemId: string, updates: Partial<CatalogItem>): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) throw new Error('Item not found');

    if (updates.title === '') throw new Error('Title cannot be empty');
    if (updates.defaultPrice !== undefined && updates.defaultPrice < 0) throw new Error('Price must be >= 0');
    if (updates.itemNumber && updates.itemNumber !== items[index].itemNumber) {
      const duplicate = items.find((entry) => entry.itemNumber === updates.itemNumber && entry.id !== itemId);
      if (duplicate) {
        throw new Error(`Item number "${updates.itemNumber}" already exists.`);
      }
    }

    const nextTitle = (updates.title || updates.name || items[index].title || items[index].name || '').trim();
    const categoryChanged =
      updates.categoryId !== undefined &&
      updates.categoryId !== items[index].categoryId;
    const updatedItem = this.normalizeItem({
      ...items[index],
      ...updates,
      categoryAssignment: categoryChanged
        ? {
            ...(items[index].categoryAssignment || {
              assignmentMethod: 'manual_review',
              confidence: 1,
              matchedSignals: [],
              needsReview: false,
            }),
            assignedCategoryId: updates.categoryId,
            assignmentMethod: 'manual_review',
            confidence: 1,
            matchedSignals: ['Category updated manually in catalog review.'],
            needsReview: false,
            reviewedAt: new Date().toISOString(),
            reviewedBy: updates.updatedBy || 'system',
          }
        : updates.categoryAssignment || items[index].categoryAssignment,
      title: nextTitle,
      name: nextTitle,
      normalizedTitle: normalizeTitle(nextTitle),
      updatedAt: new Date().toISOString(),
    } as CatalogItem);

    items[index] = updatedItem;
    await this.saveItems(orgId, items);

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
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;

    await this.saveItems(
      orgId,
      items.filter((entry) => entry.id !== itemId),
    );

    await AuditLogService.logEvent({
      orgId,
      userId: 'system',
      userRole: 'manager',
      type: 'CATALOG_ITEM_DELETED',
      entityId: itemId,
      message: `Deleted catalog item: ${item.title}`,
    });
  }

  static async duplicateItem(orgId: string, itemId: string): Promise<CatalogItem> {
    const items = await this.getItems(orgId);
    const item = items.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Item not found');

    const title = `${item.title} (Copy)`;
    const newItem = this.normalizeItem({
      ...item,
      id: createId(),
      title,
      name: title,
      normalizedTitle: normalizeTitle(title),
      itemNumber: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    items.push(newItem);
    await this.saveItems(orgId, items);

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

  private static normalizeItem(item: CatalogItem): CatalogItem {
    const title = (item.title || item.name || 'Untitled').trim() || 'Untitled';
    const createdAt =
      typeof item.createdAt === 'number' ? new Date(item.createdAt).toISOString() : item.createdAt || new Date().toISOString();
    const updatedAt =
      typeof item.updatedAt === 'number' ? new Date(item.updatedAt).toISOString() : item.updatedAt || new Date().toISOString();

    return {
      ...item,
      title,
      name: item.name || title,
      normalizedTitle: item.normalizedTitle || normalizeTitle(title),
      tags: Array.isArray(item.tags) ? item.tags : [],
      functionalTags: Array.isArray(item.functionalTags) ? item.functionalTags : [],
      topLevelCategory: item.topLevelCategory || item.categoryName || item.category,
      subcategory: item.subcategory || undefined,
      equivalentGroup: item.equivalentGroup || undefined,
      archetypeId: item.archetypeId || item.equivalentGroup || undefined,
      vendor: item.vendor || item.options?.[0]?.brand || item.brand || undefined,
      importSource: item.importSource || 'manual',
      sourceRef: item.sourceRef || item.options?.[0]?.url || undefined,
      imageUrl: item.imageUrl || item.options?.[0]?.imageUrl || undefined,
      keywordHints: Array.isArray(item.keywordHints) ? item.keywordHints : [],
      lowesCategoryHint: item.lowesCategoryHint || undefined,
      sourceConfidence:
        item.sourceConfidence === 'high' || item.sourceConfidence === 'medium' || item.sourceConfidence === 'low'
          ? item.sourceConfidence
          : undefined,
      lastReviewedAt: item.lastReviewedAt || undefined,
      packSize:
        typeof item.packSize === 'number'
          ? item.packSize
          : typeof item.options?.[0]?.packSize === 'number'
            ? item.options?.[0]?.packSize
            : undefined,
      coverage: item.coverage || item.options?.[0]?.coverage || undefined,
      categoryAssignment: item.categoryAssignment
        ? {
            ...item.categoryAssignment,
            assignedCategoryId: item.categoryAssignment.assignedCategoryId || item.categoryId,
            confidence:
              typeof item.categoryAssignment.confidence === 'number' ? item.categoryAssignment.confidence : 0,
            matchedSignals: Array.isArray(item.categoryAssignment.matchedSignals)
              ? item.categoryAssignment.matchedSignals
              : [],
            needsReview: Boolean(item.categoryAssignment.needsReview),
          }
        : undefined,
      options: Array.isArray(item.options) ? item.options : [],
      defaultQty: item.defaultQty || 1,
      unit: item.unit || 'ea',
      defaultTier: item.defaultTier || item.options?.[0]?.tier || Tier.STANDARD,
      isActive: item.isActive ?? true,
      createdAt,
      updatedAt,
    };
  }
}
