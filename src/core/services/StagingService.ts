import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { StagedProduct, CatalogItem, Tier } from '../models/types';
import { createId } from '../../services/storage';
import { CatalogService } from './CatalogService';

const adapter = createLocalDbAdapter();

export class StagingService {
  private static getStagedKey(importBatchId: string) {
    return `unitflip_staged_products_v1:${importBatchId}`;
  }

  static async updateStagedProduct(
    importBatchId: string,
    productId: string,
    updates: Partial<StagedProduct>
  ): Promise<StagedProduct> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    const index = products.findIndex((p) => p.id === productId);
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
    options: { categoryId?: string } = {}
  ): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    for (const id of productIds) {
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) continue;

      const staged = products[index];
      if (staged.status === 'APPROVED') continue;

      // Create Catalog Item
      const newItem: CatalogItem = {
        id: createId(),
        orgId,
        name: staged.normalizedTitle,
        description: staged.notes || '',
        categoryId: options.categoryId || staged.suggestedCategoryId || undefined,
        tags: ['Imported', 'Lowe\'s'],
        defaultQty: staged.qty || 1,
        unit: 'ea',
        defaultTier: Tier.STANDARD,
        options: [
          {
            id: createId(),
            name: staged.normalizedTitle,
            price: staged.unitPrice || 0,
            sku: staged.itemNumber || '',
            modelNumber: staged.modelNumber || undefined,
            tier: Tier.STANDARD,
            imageUrl: undefined, // No image from PDF yet
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await CatalogService.addItem(orgId, newItem);

      // Update Staged Status
      products[index] = {
        ...staged,
        status: 'APPROVED',
        approvedCatalogItemId: newItem.id,
      };
    }

    await adapter.setItem(this.getStagedKey(importBatchId), products);
  }

  static async reject(importBatchId: string, productIds: string[]): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    for (const id of productIds) {
      const index = products.findIndex((p) => p.id === id);
      if (index !== -1) {
        products[index] = { ...products[index], status: 'REJECTED' };
      }
    }

    await adapter.setItem(this.getStagedKey(importBatchId), products);
  }

  static async updateProduct(importBatchId: string, productId: string, updates: Partial<StagedProduct>) {
    return this.updateStagedProduct(importBatchId, productId, updates);
  }

  static async mergeDuplicates(
    importBatchId: string,
    primaryId: string,
    duplicateIds: string[]
  ): Promise<void> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    if (!products) throw new Error('Batch not found');

    const primaryIndex = products.findIndex((p) => p.id === primaryId);
    if (primaryIndex === -1) throw new Error('Primary product not found');

    for (const dupId of duplicateIds) {
      const dupIndex = products.findIndex((p) => p.id === dupId);
      if (dupIndex !== -1) {
        products[dupIndex] = {
          ...products[dupIndex],
          status: 'MERGED',
          duplicateOfStagedProductId: primaryId,
        };
      }
    }

    await adapter.setItem(this.getStagedKey(importBatchId), products);
  }
}
