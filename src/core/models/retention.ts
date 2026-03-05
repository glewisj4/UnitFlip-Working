export interface RetentionPolicy {
  orgId: string;
  retentionDays: number;          // default 730
  autoPurgeEnabled: boolean;      // default false
  approvalWindowDays: number;     // default 30
  updatedAt: number;
  updatedByUserId?: string;
}

export type PendingPurgeStatus = 'pending' | 'approved' | 'archived' | 'purged' | 'skipped';

export interface PendingPurgeItem {
  id: string;
  orgId: string;
  photoId: string;
  eligibleAt: number;             // timestamp when it became eligible
  createdAt: number;              // when this pending item was created
  status: PendingPurgeStatus;
  approvedAt?: number;
  approvedByUserId?: string;
  archivedAt?: number;
  purgedAt?: number;
  reason?: string;
}
