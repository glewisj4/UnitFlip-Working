import { BundleRule, BundleCompanion } from '../models/types';
import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { createId } from '../../services/storage';

const adapter = createLocalDbAdapter();

export class BundleRuleService {
  private static getStoreKey(orgId: string) {
    return `unitflip_bundle_rules_v1:${orgId}`;
  }

  static async getRules(orgId: string): Promise<BundleRule[]> {
    const rules = await adapter.getItem<BundleRule[]>(this.getStoreKey(orgId));
    return rules || [];
  }

  static async saveRules(orgId: string, rules: BundleRule[]): Promise<void> {
    await adapter.setItem(this.getStoreKey(orgId), rules);
  }

  static async getRuleByTrigger(orgId: string, triggerId: string): Promise<BundleRule | null> {
    const rules = await this.getRules(orgId);
    return rules.find(r => r.triggerCatalogItemId === triggerId && r.enabled) || null;
  }

  static async upsertRule(orgId: string, triggerId: string, companions: BundleCompanion[], enabled: boolean = true): Promise<BundleRule> {
    const rules = await this.getRules(orgId);
    const index = rules.findIndex(r => r.triggerCatalogItemId === triggerId);

    if (index !== -1) {
      const updatedRule: BundleRule = {
        ...rules[index],
        companions,
        enabled,
        updatedAt: Date.now(),
      };
      rules[index] = updatedRule;
      await this.saveRules(orgId, rules);
      return updatedRule;
    } else {
      const newRule: BundleRule = {
        id: createId(),
        orgId,
        triggerCatalogItemId: triggerId,
        companions,
        enabled,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      rules.push(newRule);
      await this.saveRules(orgId, rules);
      return newRule;
    }
  }

  static async deleteRule(orgId: string, ruleId: string): Promise<void> {
    const rules = await this.getRules(orgId);
    const filtered = rules.filter(r => r.id !== ruleId);
    await this.saveRules(orgId, filtered);
  }
}
