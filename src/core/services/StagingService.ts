import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { StagedProduct, CatalogItem, Tier } from '../models/types';
import { createId } from '../../services/storage';
import { CatalogService } from './CatalogService';
import { AuditLogService } from './AuditLogService';

const adapter = createLocalDbAdapter();

export class StagingService {
  private static getStagedKey(importBatchId: string) {
    return `unitflip_staged_products_v1:${importBatchId}`;
  }

  static async updateStagedProduct(
    importBatchId: string,
    productId: string,
    updates: Partial<StagedProduct>,
  ): Promise<StagedProduct> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    const index = products.findIndex((product) => product.id === productId);
    if (index === -1) throw new Error('Product not found');

    const updated = { ...products[index], ...updates };
    products[index] = updated;
    await adapter.setItem(this.getStagedKey(importBatchId), products);
    return updated;
  }

  static async approve(
    orgId: string,
    importBatchId: string,
    productIds: string[],
    options: { categoryId?: string } = {},
  ): Promise<{ approved: number; failed: number; errors: string[] }> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    let approvedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const id of productIds) {
      const index = products.findIndex((product) => product.id === id);
      if (index === -1) continue;

      const staged = products[index];
      if (staged.status === 'APPROVED') continue;

      const categoryId = options.categoryId || staged.suggestedCategoryId;
      if (!categoryId) {
        errors.push(`Item "${staged.rawTitle}" skipped: Missing category.`);
        failedCount++;
        continue;
      }

      const title = staged.normalizedTitle || staged.rawTitle;

      try {
        const createdItem = await CatalogService.addItem(orgId, {
          title,
          name: title,
          description: staged.notes || '',
          categoryId,
          tags: ['Imported', "Lowe's"],
          functionalTags: ['import:quote_pdf'],
          vendor: "Lowe's Quote Import",
          importSource: 'quote_pdf',
          defaultQty: staged.qty || 1,
          unit: 'ea',
          defaultTier: Tier.STANDARD,
          defaultPrice: staged.unitPrice || 0,
          itemNumber: staged.itemNumber || undefined,
          modelNumber: staged.modelNumber || undefined,
          imageUrl: staged.imageUrl || undefined,
          options: [
            {
              id: createId(),
              name: title,
              price: staged.unitPrice || 0,
              sku: staged.itemNumber || '',
              modelNumber: staged.modelNumber || undefined,
              tier: Tier.STANDARD,
              imageUrl: staged.imageUrl || undefined,
            },
          ],
          source: 'IMPORT',
          sourceRef: importBatchId,
          createdBy: 'system',
        });

        products[index] = {
          ...staged,
          status: 'APPROVED',
          approvedCatalogItemId: createdItem.id,
        };
        approvedCount++;

        await AuditLogService.logEvent({
          orgId,
          userId: 'system',
          userRole: 'manager',
          type: 'STAGED_ITEM_APPROVED',
          entityId: staged.id,
          message: `Approved staged item: ${staged.rawTitle} -> Catalog Item: ${createdItem.title}`,
        });
      } catch (error: any) {
        errors.push(`Failed to create item "${title}": ${error.message}`);
        failedCount++;
      }
    }

    await adapter.setItem(this.getStagedKey(importBatchId), products);
    return { approved: approvedCount, failed: failedCount, errors };
  }

  static async reject(importBatchId: string, productIds: string[]): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    for (const id of productIds) {
      const index = products.findIndex((product) => product.id === id);
      if (index !== -1) {
        products[index] = { ...products[index], status: 'REJECTED' };
      }
    }

    await adapter.setItem(this.getStagedKey(importBatchId), products);
  }

  static async updateProduct(importBatchId: string, productId: string, updates: Partial<StagedProduct>) {
    return this.updateStagedProduct(importBatchId, productId, updates);
  }

  static async mergeDuplicates(importBatchId: string, primaryId: string, duplicateIds: string[]): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    const primaryIndex = products.findIndex((product) => product.id === primaryId);
    if (primaryIndex === -1) throw new Error('Primary product not found');

    for (const duplicateId of duplicateIds) {
      const duplicateIndex = products.findIndex((product) => product.id === duplicateId);
      if (duplicateIndex !== -1) {
        products[duplicateIndex] = {
          ...products[duplicateIndex],
          status: 'MERGED',
          duplicateOfStagedProductId: primaryId,
        };
      }
    }

    await adapter.setItem(this.getStagedKey(importBatchId), products);
  }

  static async mergeToCatalog(importBatchId: string, stagedId: string, catalogItemId: string): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    const index = products.findIndex((product) => product.id === stagedId);
    if (index === -1) throw new Error('Product not found');

    products[index] = {
      ...products[index],
      status: 'MERGED',
      approvedCatalogItemId: catalogItemId,
    };

    await adapter.setItem(this.getStagedKey(importBatchId), products);
  }

  static async mergeToCatalogWithUpdate(
    orgId: string,
    importBatchId: string,
    stagedId: string,
    catalogItemId: string,
  ): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    const index = products.findIndex((product) => product.id === stagedId);
    if (index === -1) throw new Error('Product not found');

    const staged = products[index];
    const catalogItem = await CatalogService.getItem(orgId, catalogItemId);
    if (catalogItem) {
      const updates: Partial<CatalogItem> = {};
      if (!catalogItem.itemNumber && staged.itemNumber) updates.itemNumber = staged.itemNumber;
      if (!catalogItem.modelNumber && staged.modelNumber) updates.modelNumber = staged.modelNumber;
      if (!catalogItem.imageUrl && staged.imageUrl) updates.imageUrl = staged.imageUrl;
      if (!catalogItem.description && staged.notes) updates.description = staged.notes;

      if (Object.keys(updates).length > 0) {
        await CatalogService.updateItem(orgId, catalogItemId, {
          ...updates,
          updatedBy: 'system',
        });
      }
    }

    products[index] = {
      ...staged,
      status: 'MERGED',
      approvedCatalogItemId: catalogItemId,
    };

    await adapter.setItem(this.getStagedKey(importBatchId), products);

    await AuditLogService.logEvent({
      orgId,
      userId: 'system',
      userRole: 'manager',
      type: 'STAGED_ITEM_MERGED',
      entityId: staged.id,
      message: `Merged staged item: ${staged.rawTitle} -> Catalog Item: ${catalogItem?.title}`,
    });
  }

  static async assignCategory(importBatchId: string, productIds: string[], categoryId: string): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    let hasUpdates = false;
    for (const id of productIds) {
      const index = products.findIndex((product) => product.id === id);
      if (index !== -1) {
        products[index] = {
          ...products[index],
          suggestedCategoryId: categoryId,
        };
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      await adapter.setItem(this.getStagedKey(importBatchId), products);
    }
  }
}
