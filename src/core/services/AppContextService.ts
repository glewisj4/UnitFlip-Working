import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { LocalSession, Org, Role, User } from '../models/auth';
import { AuthPolicyService } from './AuthPolicyService';

const STORAGE_KEY = 'unitflip_app_context_v1';
const adapter = createLocalDbAdapter();

interface LegacyAppContextData {
  user?: User;
  org?: Org;
  role?: string;
}

interface LocalSignInInput {
  displayName: string;
  orgName: string;
  role: Role;
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'default';

const normalizeRole = (role?: string): Role => {
  if (role === 'developer' || role === 'admin' || role === 'manager' || role === 'vendor') {
    return role;
  }

  if (role === 'contractor') return 'vendor';
  return 'vendor';
};

const buildLocalSession = ({ displayName, orgName, role }: LocalSignInInput): LocalSession => {
  const normalizedDisplayName = displayName.trim() || 'Local User';
  const normalizedOrgName = orgName.trim() || 'My Organization';
  const userSlug = slugify(normalizedDisplayName);
  const orgSlug = slugify(normalizedOrgName);

  return {
    user: {
      id: `local_user_${userSlug}`,
      name: normalizedDisplayName,
      email: `${userSlug}@local.unitflip`,
    },
    org: {
      id: `local_org_${orgSlug}`,
      name: normalizedOrgName,
    },
    role,
    permissions: AuthPolicyService.getPermissionsForRole(role),
    identityProvider: 'local',
    lastSignedInAt: new Date().toISOString(),
  };
};

const upgradeLegacyContext = (legacy: LegacyAppContextData | null | undefined): LocalSession | null => {
  if (!legacy?.user || !legacy.org) return null;

  return {
    user: legacy.user,
    org: legacy.org,
    role: normalizeRole(legacy.role),
    permissions: AuthPolicyService.getPermissionsForRole(normalizeRole(legacy.role)),
    identityProvider: 'local',
    lastSignedInAt: new Date().toISOString(),
  };
};

export const AppContextService = {
  async getContext(): Promise<LocalSession | null> {
    try {
      const stored = await adapter.getItem<LocalSession | LegacyAppContextData>(STORAGE_KEY);
      if (!stored) return null;

      if ('identityProvider' in stored && stored.identityProvider === 'local' && Array.isArray(stored.permissions)) {
        return {
          ...stored,
          permissions: AuthPolicyService.getPermissionsForRole(normalizeRole(stored.role)),
          role: normalizeRole(stored.role),
        };
      }

      const upgraded = upgradeLegacyContext(stored as LegacyAppContextData);
      if (upgraded) {
        await adapter.setItem(STORAGE_KEY, upgraded);
      }
      return upgraded;
    } catch (error) {
      console.error('Failed to load app context', error);
      return null;
    }
  },

  async signInLocal(input: LocalSignInInput): Promise<LocalSession> {
    const session = buildLocalSession(input);
    await adapter.setItem(STORAGE_KEY, session);
    return session;
  },

  async signOut(): Promise<void> {
    try {
      await adapter.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear app context', error);
    }
  },

  async setRole(role: Role): Promise<LocalSession | null> {
    try {
      const context = await this.getContext();
      if (!context) return null;

      const updated: LocalSession = {
        ...context,
        role,
        permissions: AuthPolicyService.getPermissionsForRole(role),
        lastSignedInAt: new Date().toISOString(),
      };
      await adapter.setItem(STORAGE_KEY, updated);
      return updated;
    } catch (error) {
      console.error('Failed to set role', error);
      return null;
    }
  },

  async setOrg(org: Org): Promise<LocalSession | null> {
    try {
      const context = await this.getContext();
      if (!context) return null;

      const updated: LocalSession = {
        ...context,
        org: { ...org },
      };
      await adapter.setItem(STORAGE_KEY, updated);
      return updated;
    } catch (error) {
      console.error('Failed to set org', error);
      return null;
    }
  },
};
