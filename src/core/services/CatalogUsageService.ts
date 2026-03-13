import { ProductInstanceService } from './ProductInstanceService';
import { BundleRuleService } from './BundleRuleService';
import { InspectionService } from './InspectionService';
import { CatalogItem, BundleRule } from '../models/types';

export interface ProductUsageSummary {
  instanceCount: number;
  recentInspections: { id: string; title: string; date: string }[];
  bundleRules: {
    asTrigger: BundleRule[];
    asCompanion: BundleRule[];
  };
  isImported: boolean;
  source?: string;
}

export const CatalogUsageService = {
  async getUsageSummary(orgId: string, item: CatalogItem): Promise<ProductUsageSummary> {
    // 1. Get Instances
    const allInstances = await ProductInstanceService.listInstances(orgId);
    const itemInstances = allInstances.filter(i => i.catalogItemId === item.id);
    
    // 2. Get Recent Inspections
    const inspectionIds = new Set(
      itemInstances
        .filter(i => i.listRef.kind === 'inspection')
        .map(i => i.listRef.id)
    );
    
    const allInspections = await InspectionService.listInspections(orgId);
    const recentInspections = allInspections
      .filter(i => inspectionIds.has(i.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5)
      .map(i => ({
        id: i.id,
        title: i.title,
        date: new Date(i.updatedAt).toLocaleDateString()
      }));

    // 3. Get Bundle Rules
    const allRules = await BundleRuleService.getRules(orgId);
    const asTrigger = allRules.filter(r => r.triggerCatalogItemId === item.id);
    const asCompanion = allRules.filter(r => r.companions.some(c => c.catalogItemId === item.id));

    return {
      instanceCount: itemInstances.length,
      recentInspections,
      bundleRules: {
        asTrigger,
        asCompanion
      },
      isImported: !!item.source,
      source: item.source
    };
  },

  async getDeactivationWarnings(orgId: string, item: CatalogItem): Promise<string[]> {
    const summary = await this.getUsageSummary(orgId, item);
    const warnings: string[] = [];

    if (summary.instanceCount > 0) {
      warnings.push(`Used in ${summary.instanceCount} inspections/lists.`);
    }

    if (summary.bundleRules.asTrigger.length > 0) {
      warnings.push(`Triggers ${summary.bundleRules.asTrigger.length} bundle rules.`);
    }

    if (summary.bundleRules.asCompanion.length > 0) {
      warnings.push(`Appears as a companion in ${summary.bundleRules.asCompanion.length} bundle rules.`);
    }
    
    // Check if recently used (e.g. last 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentUsage = summary.recentInspections.some(i => new Date(i.date).getTime() > thirtyDaysAgo);
    
    if (recentUsage) {
        warnings.push('Has been used in inspections within the last 30 days.');
    }

    return warnings;
  }
};
