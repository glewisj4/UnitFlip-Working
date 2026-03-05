import { useCallback } from 'react';
import { useAppContext } from './useAppContext';
import { AuditLogService } from '../services/AuditLogService';
import { AuditEventType } from '../models/audit';

export function useAuditLogger() {
  const { user, org, role } = useAppContext();

  const log = useCallback(
    (
      type: AuditEventType,
      payload?: {
        entityType?: string;
        entityId?: string;
        message?: string;
        metadata?: Record<string, unknown>;
      }
    ) => {
      if (!user || !org || !role) {
        console.warn('Audit log skipped: Missing user context');
        return;
      }

      AuditLogService.logEvent({
        orgId: org.id,
        userId: user.id,
        userRole: role,
        type,
        ...payload,
      });
    },
    [user, org, role]
  );

  return { log };
}
