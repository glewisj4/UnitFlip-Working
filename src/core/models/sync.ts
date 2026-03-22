export type SyncOpStatus = 'pending' | 'in_flight' | 'succeeded' | 'failed';

export type SyncOpType =
  | 'UPSERT_UNIT'
  | 'UPSERT_INSPECTION'
  | 'UPSERT_FINDING'
  | 'DELETE_FINDING'
  | 'UPSERT_REPAIR_TASK'
  | 'DELETE_REPAIR_TASK'
  | 'UPSERT_MATERIAL_REQUIREMENT'
  | 'DELETE_MATERIAL_REQUIREMENT'
  | 'ATTACH_PHOTO'
  | 'DETACH_PHOTO'
  | 'UPLOAD_PHOTO'
  | 'AUDIT_EVENT'
  | 'GENERATE_REPORT'
  | 'CREATE_SHARE_LINK'
  | 'REVOKE_SHARE_LINK'
  | 'SHARE_ACCESS_EVENT'
  | 'RETENTION_POLICY_UPDATED'
  | 'RETENTION_PURGE_APPROVED'
  | 'RETENTION_ARCHIVE_EXPORTED'
  | 'ARCHIVE_EXPORTED'
  | 'RETENTION_PHOTO_PURGED';

export interface SyncOp {
  id: string;
  orgId: string;
  userId: string;
  ts: number;
  type: SyncOpType;
  status: SyncOpStatus;
  attemptCount: number;
  lastAttemptAt?: number;
  errorMessage?: string;
  payload: Record<string, unknown>;
}
