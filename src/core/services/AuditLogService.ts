import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { AuditEvent, AuditEventType } from '../models/audit';
import { createId } from '../../services/storage';

const STORAGE_KEY = 'unitflip_audit_log_v1';
const adapter = createLocalDbAdapter();

export const AuditLogService = {
  async logEvent(event: Omit<AuditEvent, 'id' | 'ts'> & { id?: string; ts?: number }): Promise<void> {
    try {
      const fullEvent: AuditEvent = {
        id: event.id || createId(),
        ts: event.ts || Date.now(),
        ...event,
      };

      // For MVP, we append to an array. In a real app, this would be an indexed store.
      // We read the whole log, append, and write back. This is not performant for large logs
      // but fine for a local-first MVP.
      const logs = (await adapter.getItem<AuditEvent[]>(STORAGE_KEY)) || [];
      logs.push(fullEvent);
      await adapter.setItem(STORAGE_KEY, logs);
    } catch (error) {
      console.warn('Failed to log audit event', error);
    }
  },

  async listEvents(params?: {
    orgId?: string;
    limit?: number;
    offset?: number;
    types?: AuditEventType[];
  }): Promise<AuditEvent[]> {
    try {
      const logs = (await adapter.getItem<AuditEvent[]>(STORAGE_KEY)) || [];
      let filtered = logs;

      if (params?.orgId) {
        filtered = filtered.filter((e) => e.orgId === params.orgId);
      }

      if (params?.types && params.types.length > 0) {
        filtered = filtered.filter((e) => params.types!.includes(e.type));
      }

      // Sort newest first
      filtered.sort((a, b) => b.ts - a.ts);

      const offset = params?.offset || 0;
      const limit = params?.limit || 50;

      return filtered.slice(offset, offset + limit);
    } catch (error) {
      console.warn('Failed to list audit events', error);
      return [];
    }
  },

  async clearEvents(orgId?: string): Promise<void> {
    try {
      if (orgId) {
        const logs = (await adapter.getItem<AuditEvent[]>(STORAGE_KEY)) || [];
        const remaining = logs.filter((e) => e.orgId !== orgId);
        await adapter.setItem(STORAGE_KEY, remaining);
      } else {
        await adapter.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Failed to clear audit events', error);
    }
  },
};
