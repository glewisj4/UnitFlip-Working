import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export interface ShareRegistryRecord {
  id: string;
  orgId: string;
  token: string;
  resourceId: string;
  inspectionId?: string;
  expiresAt: number;
  createdAt: number;
  createdByUserId: string;
  createdByRole: string;
  resourceBucket?: string;
  resourcePath?: string;
  resourceContentType?: string;
  resourceLabel?: string;
  revokedAt?: number;
  revokedByUserId?: string;
}

export const REPORTS_BUCKET = 'reports';
const SHARE_REGISTRY_PREFIX = '_share_links';
const SHARE_ACCESS_PREFIX = '_share_access';

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export const decodeOrgIdFromToken = (token: string): string | null => {
  try {
    const [encodedOrgId] = token.split('.');
    if (!encodedOrgId) return null;
    const normalized = encodedOrgId.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return atob(`${normalized}${padding}`);
  } catch (_error) {
    return null;
  }
};

export const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return toHex(new Uint8Array(digest));
};

export const getShareRegistryPath = (orgId: string, tokenHash: string) =>
  `${SHARE_REGISTRY_PREFIX}/${orgId}/${tokenHash}.json`;

export const getShareAccessLogPath = (orgId: string, tokenHash: string, action: string, timestamp: number) =>
  `${SHARE_ACCESS_PREFIX}/${orgId}/${tokenHash}/${timestamp}_${action}.json`;

export const ensureReportsBucket = async (supabaseAdmin: SupabaseClient) => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    throw error;
  }

  if (!buckets.some((bucket) => bucket.name === REPORTS_BUCKET)) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(REPORTS_BUCKET, {
      public: false,
      fileSizeLimit: '10MB',
    });
    if (createError && !createError.message.toLowerCase().includes('already exists')) {
      throw createError;
    }
  }
};

export const writeShareRegistryRecord = async (
  supabaseAdmin: SupabaseClient,
  record: ShareRegistryRecord
) => {
  const tokenHash = await hashToken(record.token);
  const registryPath = getShareRegistryPath(record.orgId, tokenHash);
  const body = JSON.stringify(record, null, 2);
  const { error } = await supabaseAdmin.storage
    .from(REPORTS_BUCKET)
    .upload(registryPath, new Blob([body], { type: 'application/json; charset=utf-8' }), {
      upsert: true,
      contentType: 'application/json; charset=utf-8',
    });

  if (error) {
    throw error;
  }

  return { tokenHash, registryPath };
};

export const readShareRegistryRecord = async (
  supabaseAdmin: SupabaseClient,
  token: string
): Promise<ShareRegistryRecord | null> => {
  const orgId = decodeOrgIdFromToken(token);
  if (!orgId) {
    return null;
  }

  const tokenHash = await hashToken(token);
  const registryPath = getShareRegistryPath(orgId, tokenHash);
  const { data, error } = await supabaseAdmin.storage.from(REPORTS_BUCKET).download(registryPath);

  if (error) {
    if (error.message.toLowerCase().includes('not found')) {
      return null;
    }
    throw error;
  }

  const text = await data.text();
  return JSON.parse(text) as ShareRegistryRecord;
};
