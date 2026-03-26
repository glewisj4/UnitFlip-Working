export interface User {
  id: string;
  name: string;
  email?: string;
}

export interface Org {
  id: string;
  name: string;
}

export type Role = 'developer' | 'admin' | 'manager' | 'vendor';

export type IdentityProvider = 'local';

export type Permission =
  | 'dashboard:view'
  | 'rooms:view'
  | 'catalog:view'
  | 'inspection:view'
  | 'portfolio:view'
  | 'templates:view'
  | 'procurement:view'
  | 'admin:view'
  | 'feedback_management:view'
  | 'developer_tools:view';

export interface LocalSession {
  user: User;
  org: Org;
  role: Role;
  permissions: Permission[];
  identityProvider: IdentityProvider;
  lastSignedInAt: string;
}

export type FeatureFlagKey = 
  | 'public_share_links'
  | 'pdf_reports'
  | 'ai_photo_analysis'
  | 'offline_mode'
  | 'advanced_audit_logs'
  | 'remote_uploads';

export type FeatureFlags = Record<FeatureFlagKey, boolean>;
