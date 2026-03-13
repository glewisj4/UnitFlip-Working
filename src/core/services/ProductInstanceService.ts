import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ProductInstance, ListRef } from '../models/types';
import { createId } from '../../services/storage';

const STORAGE_KEY_PREFIX = 'unitflip_product_instances_v1:';
const adapter = createLocalDbAdapter();

export const ProductInstanceService = {
  getStoreKey(orgId: string) {
    return `${STORAGE_KEY_PREFIX}${orgId}`;
  },

  async listInstances(orgId: string, listRef?: ListRef): Promise<ProductInstance[]> {
    const instances = await adapter.getItem<ProductInstance[]>(this.getStoreKey(orgId));
    if (!instances) return [];

    if (listRef) {
      return instances.filter(i => i.listRef.kind === listRef.kind && i.listRef.id === listRef.id);
    }
    return instances;
  },

  async saveInstances(orgId: string, instances: ProductInstance[]): Promise<void> {
    await adapter.setItem(this.getStoreKey(orgId), instances);
  },

  async addInstance(orgId: string, instance: Omit<ProductInstance, 'id' | 'orgId' | 'addedAt' | 'updatedAt'>): Promise<ProductInstance> {
    const instances = await this.listInstances(orgId);
    const newInstance: ProductInstance = {
      ...instance,
      id: createId(),
      orgId,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    instances.push(newInstance);
    await this.saveInstances(orgId, instances);
    return newInstance;
  },

  async updateInstance(orgId: string, instanceId: string, updates: Partial<ProductInstance>): Promise<ProductInstance> {
    const instances = await this.listInstances(orgId);
    const index = instances.findIndex(i => i.id === instanceId);
    if (index === -1) throw new Error('Instance not found');

    const updated = {
      ...instances[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    instances[index] = updated;
    await this.saveInstances(orgId, instances);
    return updated;
  },

  async deleteInstance(orgId: string, instanceId: string): Promise<void> {
    const instances = await this.listInstances(orgId);
    const filtered = instances.filter(i => i.id !== instanceId);
    await this.saveInstances(orgId, filtered);
  }
};
