import { CatalogService } from './CatalogService';
import { ProductInstanceService } from './ProductInstanceService';
import { BundleRuleService } from './BundleRuleService';
import { ImportService } from './ImportService';
import { AuditLogService } from './AuditLogService';
import { AuditEventType } from '../models/audit';
import { CatalogItem, ProductInstance, BundleRule, StagedProduct } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';

const adapter = createLocalDbAdapter();

export interface MergePreview {
  source: CatalogItem;
  target: CatalogItem;
  mergedItem: CatalogItem;
  references: {
    productInstances: ProductInstance[];
    bundleTriggers: BundleRule[];
    bundleCompanions: BundleRule[];
    stagedProducts: { batchId: string; product: StagedProduct }[];
  };
  blockers: string[];
}

export class CatalogMergeService {
  
  static async previewMerge(orgId: string, sourceId: string, targetId: string): Promise<MergePreview> {
    const source = await CatalogService.getItem(orgId, sourceId);
    const target = await CatalogService.getItem(orgId, targetId);

    if (!source || !target) {
      throw new Error('Source or target item not found.');
    }

    // 1. Find Product Instances
    const allInstances = await ProductInstanceService.listInstances(orgId);
    const productInstances = allInstances.filter(i => i.catalogItemId === sourceId);

    // 2. Find Bundle Rules
    const allRules = await BundleRuleService.getRules(orgId);
    const bundleTriggers = allRules.filter(r => r.triggerCatalogItemId === sourceId);
    const bundleCompanions = allRules.filter(r => r.companions.some(c => c.catalogItemId === sourceId));

    // 3. Find Staged Products
    const batches = await ImportService.listImportBatches(orgId);
    const stagedProducts: { batchId: string; product: StagedProduct }[] = [];
    
    for (const batch of batches) {
      const products = await ImportService.listStagedProducts(batch.id);
      const matches = products.filter(p => 
        p.approvedCatalogItemId === sourceId || 
        p.duplicateTargetId === sourceId
      );
      matches.forEach(p => stagedProducts.push({ batchId: batch.id, product: p }));
    }

    // 4. Merge Fields (Target wins, Source fills gaps)
    const mergedItem: CatalogItem = { ...target };
    
    if (!mergedItem.itemNumber && source.itemNumber) mergedItem.itemNumber = source.itemNumber;
    if (!mergedItem.modelNumber && source.modelNumber) mergedItem.modelNumber = source.modelNumber;
    if (!mergedItem.brand && source.brand) mergedItem.brand = source.brand;
    if (!mergedItem.imageUrl && source.imageUrl) mergedItem.imageUrl = source.imageUrl;
    if (!mergedItem.description && source.description) mergedItem.description = source.description;
    if (!mergedItem.defaultPrice && source.defaultPrice) mergedItem.defaultPrice = source.defaultPrice;
    
    // Merge tags
    const targetTags = new Set(target.tags || []);
    (source.tags || []).forEach(t => targetTags.add(t));
    mergedItem.tags = Array.from(targetTags);

    const blockers: string[] = [];
    // Add logic to identify blockers if any (e.g. locked records, etc.)

    return {
      source,
      target,
      mergedItem,
      references: {
        productInstances,
        bundleTriggers,
        bundleCompanions,
        stagedProducts
      },
      blockers
    };
  }

  static async executeMerge(orgId: string, sourceId: string, targetId: string, userId: string): Promise<void> {
    const preview = await this.previewMerge(orgId, sourceId, targetId);

    if (preview.blockers.length > 0) {
      throw new Error(`Merge blocked: ${preview.blockers.join(', ')}`);
    }

    // 1. Update Product Instances
    for (const instance of preview.references.productInstances) {
      await ProductInstanceService.updateInstance(orgId, instance.id, { catalogItemId: targetId });
    }

    // 2. Update Bundle Rules (Triggers)
    for (const rule of preview.references.bundleTriggers) {
      const existingTargetRule = await BundleRuleService.getRuleByTrigger(orgId, targetId);
      
      if (existingTargetRule) {
        // Target already has a rule. Merge companions.
        const combinedCompanions = [...existingTargetRule.companions];
        rule.companions.forEach(c => {
            if (!combinedCompanions.some(ec => ec.catalogItemId === c.catalogItemId)) {
                combinedCompanions.push(c);
            }
        });
        
        await BundleRuleService.upsertRule(orgId, targetId, combinedCompanions, existingTargetRule.enabled);
        await BundleRuleService.deleteRule(orgId, rule.id);
      } else {
        // Create new rule for target, delete old
        await BundleRuleService.upsertRule(orgId, targetId, rule.companions, rule.enabled);
        await BundleRuleService.deleteRule(orgId, rule.id);
      }
    }

    // 3. Update Bundle Rules (Companions)
    for (const rule of preview.references.bundleCompanions) {
      const newCompanions = rule.companions.map(c => {
        if (c.catalogItemId === sourceId) {
          return { ...c, catalogItemId: targetId };
        }
        return c;
      });
      
      // Deduplicate companions
      const uniqueCompanions = newCompanions.filter((c, index, self) => 
        index === self.findIndex(t => t.catalogItemId === c.catalogItemId)
      );
      
      await BundleRuleService.upsertRule(orgId, rule.triggerCatalogItemId, uniqueCompanions, rule.enabled);
    }

    // 4. Update Staged Products
    for (const item of preview.references.stagedProducts) {
       const stagedKey = `unitflip_staged_products_v1:${item.batchId}`;
       const products = await adapter.getItem<StagedProduct[]>(stagedKey) || [];
       const index = products.findIndex(p => p.id === item.product.id);
       if (index !== -1) {
         let updated = false;
         if (products[index].approvedCatalogItemId === sourceId) {
           products[index].approvedCatalogItemId = targetId;
           updated = true;
         }
         if (products[index].duplicateTargetId === sourceId) {
           products[index].duplicateTargetId = targetId;
           updated = true;
         }
         if (updated) {
            await adapter.setItem(stagedKey, products);
         }
       }
    }

    // 5. Update Target Item
    await CatalogService.updateItem(orgId, targetId, preview.mergedItem);

    // 6. Delete Source Item
    await CatalogService.deleteItem(orgId, sourceId);

    // 7. Audit Log
    await AuditLogService.logEvent({
      orgId,
      userId,
      userRole: 'admin', // Assuming admin for now or passed in
      type: 'CATALOG_ITEM_MERGED',
      entityType: 'CatalogItem',
      entityId: targetId,
      message: `Merged item ${sourceId} into ${targetId}`,
      metadata: {
        sourceId,
        targetId,
        referencesMoved: {
          productInstances: preview.references.productInstances.length,
          bundleTriggers: preview.references.bundleTriggers.length,
          bundleCompanions: preview.references.bundleCompanions.length,
          stagedProducts: preview.references.stagedProducts.length
        }
      }
    });
  }
}
