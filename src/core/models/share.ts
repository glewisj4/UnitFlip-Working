import { Role } from './auth';

export type ShareResourceType = 'report_pdf';

export interface ShareLink {
  id: string;                 // internal id
  orgId: string;
  createdAt: number;
  createdByUserId: string;
  createdByRole: Role;

  token: string;              // public token, unguessable
  resourceType: ShareResourceType;
  resourceId: string;         // reportId (preferred)
  inspectionId?: string;
  resourceBucket?: string;
  resourcePath?: string;
  resourceContentType?: string;
  resourceLabel?: string;

  expiresAt: number;          // default now + 7 days
  revokedAt?: number;
  revokedByUserId?: string;

  note?: string;
}

export interface ShareAccessEvent {
  id: string;
  ts: number;
  orgId: string;
  token: string;
  action: 'VIEW' | 'DOWNLOAD';
  userAgent?: string;
  referrer?: string;
  ipHint?: string;           // optional placeholder (real IP server-side later)
  resourceType: ShareResourceType;
  resourceId: string;
  success: boolean;
  failureReason?: 'EXPIRED' | 'REVOKED' | 'NOT_FOUND';
}
