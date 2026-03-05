import { LocalDbAdapter } from './LocalDbAdapter';
import { IndexedDbAdapter } from './IndexedDbAdapter';
import { CapacitorSqliteAdapter } from './CapacitorSqliteAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';

export const createLocalDbAdapter = (): LocalDbAdapter => {
  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();

  if (isCapacitor) {
    // For now, we return the placeholder. In future, we can check if the plugin is available.
    return new CapacitorSqliteAdapter();
  }

  if (typeof window === 'undefined' || !window.indexedDB) {
    return new LocalStorageAdapter();
  }

  return new IndexedDbAdapter();
};
