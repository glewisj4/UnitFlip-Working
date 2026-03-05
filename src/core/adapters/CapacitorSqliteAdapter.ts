import { LocalDbAdapter } from './LocalDbAdapter';

export class CapacitorSqliteAdapter implements LocalDbAdapter {
  constructor() {
    // Placeholder for initialization
  }

  async getItem<T>(key: string): Promise<T | null> {
    throw new Error("SQLite adapter not enabled yet. Install Capacitor + SQLite plugin.");
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    throw new Error("SQLite adapter not enabled yet. Install Capacitor + SQLite plugin.");
  }

  async removeItem(key: string): Promise<void> {
    throw new Error("SQLite adapter not enabled yet. Install Capacitor + SQLite plugin.");
  }

  async clear(): Promise<void> {
    throw new Error("SQLite adapter not enabled yet. Install Capacitor + SQLite plugin.");
  }
}
