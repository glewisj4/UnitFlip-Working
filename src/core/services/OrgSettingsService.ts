import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';

export interface OrgSettings {
  media: {
    photoMaxBytes: number;
    thumbMaxBytes: number;
    minQuality: number;
    maxDimension: number;
    thumbMaxDimension: number;
  };
  retention: {
    retentionDays: number;
    autoPurgeEnabled: boolean;
    approvalWindowDays: number;
  };
}

const SETTINGS_KEY_PREFIX = 'unitflip_org_settings_v1:';
const adapter = createLocalDbAdapter();

const DEFAULT_SETTINGS: OrgSettings = {
  media: {
    photoMaxBytes: 600_000,
    thumbMaxBytes: 80_000,
    minQuality: 0.5,
    maxDimension: 2200,
    thumbMaxDimension: 480,
  },
  retention: {
    retentionDays: 730,
    autoPurgeEnabled: false,
    approvalWindowDays: 30,
  },
};

export const OrgSettingsService = {
  async getSettings(orgId: string): Promise<OrgSettings> {
    const key = `${SETTINGS_KEY_PREFIX}${orgId}`;
    const settings = await adapter.getItem<OrgSettings>(key);
    return settings || { ...DEFAULT_SETTINGS };
  },

  async updateSettings(orgId: string, partial: Partial<OrgSettings>): Promise<void> {
    const current = await this.getSettings(orgId);
    const updated = { ...current, ...partial };
    const key = `${SETTINGS_KEY_PREFIX}${orgId}`;
    await adapter.setItem(key, updated);
  },
};
