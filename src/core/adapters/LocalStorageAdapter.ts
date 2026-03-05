import { LocalDbAdapter } from './LocalDbAdapter';

export class LocalStorageAdapter implements LocalDbAdapter {
  async getItem<T>(key: string): Promise<T | null> {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  }
  async setItem<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  }
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
  async clear(): Promise<void> {
    localStorage.clear();
  }
}
