import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { FeatureFlags, FeatureFlagKey } from '../models/auth';

const STORAGE_KEY = 'unitflip_feature_flags_v1';
const adapter = createLocalDbAdapter();

const DEFAULT_FLAGS: FeatureFlags = {
  public_share_links: false,
  pdf_reports: false,
  ai_photo_analysis: false,
  offline_mode: true,
  advanced_audit_logs: false,
  remote_uploads: false,
};

export const FeatureFlagService = {
  async getFlags(orgId: string): Promise<FeatureFlags> {
    try {
      const allFlags = await adapter.getItem<Record<string, FeatureFlags>>(STORAGE_KEY);
      return (allFlags && allFlags[orgId]) ? { ...DEFAULT_FLAGS, ...allFlags[orgId] } : DEFAULT_FLAGS;
    } catch (error) {
      console.error('Failed to load feature flags', error);
      return DEFAULT_FLAGS;
    }
  },

  async setFlag(orgId: string, key: FeatureFlagKey, value: boolean): Promise<void> {
    try {
      const allFlags = await adapter.getItem<Record<string, FeatureFlags>>(STORAGE_KEY) || {};
      const orgFlags = allFlags[orgId] || { ...DEFAULT_FLAGS };
      
      orgFlags[key] = value;
      allFlags[orgId] = orgFlags;
      
      await adapter.setItem(STORAGE_KEY, allFlags);
    } catch (error) {
      console.error('Failed to set feature flag', error);
    }
  },

  async setFlags(orgId: string, flags: FeatureFlags): Promise<void> {
    try {
      const allFlags = await adapter.getItem<Record<string, FeatureFlags>>(STORAGE_KEY) || {};
      allFlags[orgId] = flags;
      await adapter.setItem(STORAGE_KEY, allFlags);
    } catch (error) {
      console.error('Failed to set feature flags', error);
    }
  },

  async isEnabled(orgId: string, key: FeatureFlagKey): Promise<boolean> {
    const flags = await this.getFlags(orgId);
    return !!flags[key];
  }
};
