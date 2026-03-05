import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { SyncOp, SyncOpStatus } from '../models/sync';
import { createId } from '../../services/storage';

const STORAGE_KEY_PREFIX = 'unitflip_sync_queue_v1:';
const adapter = createLocalDbAdapter();

export const SyncQueueService = {
  async enqueue(
    orgId: string,
    op: Omit<SyncOp, 'id' | 'ts' | 'status' | 'attemptCount' | 'orgId'> & { id?: string; ts?: number }
  ): Promise<SyncOp> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const queue = (await adapter.getItem<SyncOp[]>(key)) || [];

    const newOp: SyncOp = {
      id: op.id || createId(),
      ts: op.ts || Date.now(),
      status: 'pending',
      attemptCount: 0,
      orgId,
      ...op,
    } as SyncOp;

    // Add to end of queue
    queue.push(newOp);
    await adapter.setItem(key, queue);
    return newOp;
  },

  async list(
    orgId: string,
    opts?: { status?: SyncOpStatus; limit?: number }
  ): Promise<SyncOp[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const queue = (await adapter.getItem<SyncOp[]>(key)) || [];

    let filtered = queue;
    if (opts?.status) {
      filtered = filtered.filter((op) => op.status === opts.status);
    }

    // Sort by timestamp ascending (oldest first)
    filtered.sort((a, b) => a.ts - b.ts);

    if (opts?.limit) {
      filtered = filtered.slice(0, opts.limit);
    }

    return filtered;
  },

  async update(orgId: string, op: SyncOp): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const queue = (await adapter.getItem<SyncOp[]>(key)) || [];

    const updatedQueue = queue.map((existing) =>
      existing.id === op.id ? op : existing
    );

    await adapter.setItem(key, updatedQueue);
  },

  async remove(orgId: string, opId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const queue = (await adapter.getItem<SyncOp[]>(key)) || [];

    const updatedQueue = queue.filter((op) => op.id !== opId);
    await adapter.setItem(key, updatedQueue);
  },
  
  async getQueueSize(orgId: string): Promise<number> {
      const key = `${STORAGE_KEY_PREFIX}${orgId}`;
      const queue = (await adapter.getItem<SyncOp[]>(key)) || [];
      return queue.filter(op => op.status === 'pending' || op.status === 'failed').length;
  }
};
