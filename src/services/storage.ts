import { AppState, RepairTemplate } from '../core/models/types';
import { createLocalDbAdapter } from '../core/adapters/createLocalDbAdapter';
import { createInitialAppState, DEFAULT_REPAIR_TEMPLATES } from '../core/seed/initialData';
import { IndexedDbAdapter } from '../core/adapters/IndexedDbAdapter';

const STORAGE_KEY = 'unitflip_db_v2';

const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const REPAIR_TEMPLATES = DEFAULT_REPAIR_TEMPLATES;

const adapter = createLocalDbAdapter();

export const getStoredData = async (): Promise<AppState> => {
  try {
    // Migration Logic: Check if we need to migrate from LocalStorage to IndexedDB
    if (adapter instanceof IndexedDbAdapter) {
      const dbData = await adapter.getItem<AppState>(STORAGE_KEY);
      if (!dbData) {
        // Check if data exists in LocalStorage
        const localDataString = localStorage.getItem(STORAGE_KEY);
        if (localDataString) {
          try {
            const localData = JSON.parse(localDataString);
            console.log('Migrating data from LocalStorage to IndexedDB...');
            await adapter.setItem(STORAGE_KEY, localData);
            // Optional: Clear LocalStorage after successful migration
            // localStorage.removeItem(STORAGE_KEY); 
            return localData;
          } catch (e) {
            console.error('Failed to parse LocalStorage data during migration', e);
          }
        }
      }
    }

    const data = await adapter.getItem<AppState>(STORAGE_KEY);
    if (data) {
      // Migration: Add repairTemplates if missing
      if (!data.repairTemplates) {
        data.repairTemplates = DEFAULT_REPAIR_TEMPLATES;
      }
      return data;
    }
    // Initialize if empty
    const initialData = createInitialAppState();
    await adapter.setItem(STORAGE_KEY, initialData);
    return initialData;
  } catch (e) {
    console.error("Failed to load data", e);
    return createInitialAppState();
  }
};

export const saveData = async (data: AppState) => {
  try {
    await adapter.setItem(STORAGE_KEY, data);
  } catch (e) {
    console.error("Failed to save data", e);
  }
};

export const createId = generateId;
