import { Permission, Role } from '../models/auth';

export type AppView =
  | 'dashboard'
  | 'rooms'
  | 'room-detail'
  | 'products'
  | 'repair-kits'
  | 'import-wizard'
  | 'checklist'
  | 'inspections'
  | 'unit-management'
  | 'templates'
  | 'procurement'
  | 'admin'
  | 'feedback-management';

const ROLE_PERMISSION_MAP: Record<Role, Permission[]> = {
  developer: [
    'dashboard:view',
    'rooms:view',
    'catalog:view',
    'inspection:view',
    'portfolio:view',
    'templates:view',
    'procurement:view',
    'admin:view',
    'feedback_management:view',
    'developer_tools:view',
  ],
  admin: [
    'dashboard:view',
    'rooms:view',
    'catalog:view',
    'inspection:view',
    'portfolio:view',
    'templates:view',
    'procurement:view',
    'admin:view',
  ],
  manager: [
    'dashboard:view',
    'rooms:view',
    'catalog:view',
    'inspection:view',
    'portfolio:view',
    'templates:view',
    'procurement:view',
  ],
  vendor: ['procurement:view'],
};

const VIEW_PERMISSION_MAP: Record<AppView, Permission> = {
  dashboard: 'dashboard:view',
  rooms: 'rooms:view',
  'room-detail': 'rooms:view',
  products: 'catalog:view',
  'repair-kits': 'catalog:view',
  'import-wizard': 'catalog:view',
  checklist: 'inspection:view',
  inspections: 'inspection:view',
  'unit-management': 'portfolio:view',
  templates: 'templates:view',
  procurement: 'procurement:view',
  admin: 'admin:view',
  'feedback-management': 'feedback_management:view',
};

export const AuthPolicyService = {
  getPermissionsForRole(role: Role): Permission[] {
    return [...ROLE_PERMISSION_MAP[role]];
  },

  hasPermission(permissions: Permission[] | null | undefined, permission: Permission): boolean {
    return Boolean(permissions?.includes(permission));
  },

  canAccessView(permissions: Permission[] | null | undefined, view: AppView): boolean {
    return this.hasPermission(permissions, VIEW_PERMISSION_MAP[view]);
  },

  canActivateProcurement(role: Role | null | undefined, permissions: Permission[] | null | undefined): boolean {
    return role !== 'vendor' && this.hasPermission(permissions, 'procurement:view');
  },

  canManageVendorAssignments(role: Role | null | undefined, permissions: Permission[] | null | undefined): boolean {
    return role !== 'vendor' && this.hasPermission(permissions, 'procurement:view');
  },

  canManageProcurementVerification(role: Role | null | undefined, permissions: Permission[] | null | undefined): boolean {
    return role !== 'vendor' && this.hasPermission(permissions, 'procurement:view');
  },

  canManageCloseoutExceptions(role: Role | null | undefined, permissions: Permission[] | null | undefined): boolean {
    return role !== 'vendor' && this.hasPermission(permissions, 'procurement:view');
  },

  canPerformVendorActions(role: Role | null | undefined, permissions: Permission[] | null | undefined): boolean {
    return role === 'vendor' && this.hasPermission(permissions, 'procurement:view');
  },

  getDefaultViewForRole(role: Role): AppView {
    if (role === 'vendor') return 'procurement';
    if (role === 'manager') return 'unit-management';
    return 'inspections';
  },
};
