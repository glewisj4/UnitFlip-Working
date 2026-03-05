import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { User, Org, Role } from '../models/auth';

const STORAGE_KEY = 'unitflip_app_context_v1';
const adapter = createLocalDbAdapter();

interface AppContextData {
  user: User;
  org: Org;
  role: Role;
}

// Default stub data for MVP
const DEFAULT_CONTEXT: AppContextData = {
  user: { id: 'user_1', name: 'Demo User', email: 'demo@unitflip.com' },
  org: { id: 'org_1', name: 'My Organization' },
  role: 'admin'
};

export const AppContextService = {
  async getContext(): Promise<AppContextData> {
    try {
      const context = await adapter.getItem<AppContextData>(STORAGE_KEY);
      return context || DEFAULT_CONTEXT;
    } catch (error) {
      console.error('Failed to load app context', error);
      return DEFAULT_CONTEXT;
    }
  },

  async setRole(role: Role): Promise<void> {
    try {
      const context = await this.getContext();
      context.role = role;
      await adapter.setItem(STORAGE_KEY, context);
    } catch (error) {
      console.error('Failed to set role', error);
    }
  },

  async setOrg(org: Org): Promise<void> {
    try {
      const context = await this.getContext();
      context.org = org;
      await adapter.setItem(STORAGE_KEY, context);
    } catch (error) {
      console.error('Failed to set org', error);
    }
  }
};
