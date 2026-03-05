export interface User {
  id: string;
  name: string;
  email?: string;
}

export interface Org {
  id: string;
  name: string;
}

export type Role = 'admin' | 'manager' | 'contractor' | 'viewer';

export type FeatureFlagKey = 
  | 'public_share_links'
  | 'pdf_reports'
  | 'ai_photo_analysis'
  | 'offline_mode'
  | 'advanced_audit_logs'
  | 'remote_uploads';

export type FeatureFlags = Record<FeatureFlagKey, boolean>;
