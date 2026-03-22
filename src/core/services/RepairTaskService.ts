import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { RepairTask } from '../models/operations';
import { createPrefixedId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';

const STORAGE_KEY_PREFIX = 'unitflip_repair_tasks_v1:';
const adapter = createLocalDbAdapter();

type RepairTaskCreateInput = Omit<RepairTask, 'id' | 'createdAt' | 'updatedAt'>;

export const RepairTaskService = {
  async listTasks(
    orgId: string,
    filters?: { inspectionId?: string; unitId?: string }
  ): Promise<RepairTask[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const tasks = (await adapter.getItem<RepairTask[]>(key)) || [];

    return tasks
      .filter((task) => {
        if (filters?.inspectionId && task.inspectionId !== filters.inspectionId) return false;
        if (filters?.unitId && task.unitId !== filters.unitId) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async createTask(orgId: string, task: RepairTaskCreateInput, userId: string): Promise<RepairTask> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const tasks = (await adapter.getItem<RepairTask[]>(key)) || [];
    const now = Date.now();

    const newTask: RepairTask = {
      ...task,
      id: createPrefixedId('tsk_'),
      createdAt: now,
      updatedAt: now,
    };

    tasks.push(newTask);
    await adapter.setItem(key, tasks);
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_REPAIR_TASK',
      userId,
      payload: newTask as unknown as Record<string, unknown>,
    });

    return newTask;
  },

  async updateTask(orgId: string, task: RepairTask, userId: string): Promise<RepairTask> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const tasks = (await adapter.getItem<RepairTask[]>(key)) || [];
    const updatedTask = { ...task, updatedAt: Date.now() };

    await adapter.setItem(
      key,
      tasks.map((existing) => (existing.id === task.id ? updatedTask : existing))
    );
    await SyncQueueService.enqueue(orgId, {
      type: 'UPSERT_REPAIR_TASK',
      userId,
      payload: updatedTask as unknown as Record<string, unknown>,
    });

    return updatedTask;
  },

  async replaceForInspection(
    orgId: string,
    inspectionId: string,
    replacementTasks: RepairTaskCreateInput[],
    userId: string
  ): Promise<RepairTask[]> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const existingTasks = (await adapter.getItem<RepairTask[]>(key)) || [];
    const remainingTasks = existingTasks.filter((task) => task.inspectionId !== inspectionId);
    const now = Date.now();
    const createdTasks = replacementTasks.map((task, index) => ({
      ...task,
      id: createPrefixedId('tsk_'),
      createdAt: now + index,
      updatedAt: now + index,
    }));

    await adapter.setItem(key, [...remainingTasks, ...createdTasks]);

    const removedTasks = existingTasks.filter((task) => task.inspectionId === inspectionId);
    for (const task of removedTasks) {
      await SyncQueueService.enqueue(orgId, {
        type: 'DELETE_REPAIR_TASK',
        userId,
        payload: { repairTaskId: task.id },
      });
    }

    for (const task of createdTasks) {
      await SyncQueueService.enqueue(orgId, {
        type: 'UPSERT_REPAIR_TASK',
        userId,
        payload: task as unknown as Record<string, unknown>,
      });
    }

    return createdTasks;
  },

  async deleteTask(orgId: string, taskId: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${orgId}`;
    const tasks = (await adapter.getItem<RepairTask[]>(key)) || [];
    await adapter.setItem(
      key,
      tasks.filter((task) => task.id !== taskId)
    );
    await SyncQueueService.enqueue(orgId, {
      type: 'DELETE_REPAIR_TASK',
      userId,
      payload: { repairTaskId: taskId },
    });
  },
};
