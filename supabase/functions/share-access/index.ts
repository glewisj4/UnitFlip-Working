import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';
import {
  REPORTS_BUCKET,
  ShareRegistryRecord,
  decodeOrgIdFromToken,
  ensureReportsBucket,
  getShareAccessLogPath,
  hashToken,
  readShareRegistryRecord,
  writeShareRegistryRecord,
} from '../_shared/shareRegistry.ts';

type ShareAccessRequest =
  | {
      action: 'REGISTER_LINK';
      link?: ShareRegistryRecord;
    }
  | {
      action: 'REVOKE_LINK';
      orgId?: string;
      token?: string;
      revokedAt?: number;
      revokedByUserId?: string;
    }
  | {
      action: 'VIEW' | 'DOWNLOAD';
      token?: string;
      userAgent?: string;
      referrer?: string;
    };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse();
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: 'Supabase function is missing required environment configuration.' },
        500
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    await ensureReportsBucket(supabaseAdmin);

    const body = (await req.json()) as ShareAccessRequest;

    if (body.action === 'REGISTER_LINK') {
      const link = body.link;
      if (
        !link?.id ||
        !link.orgId ||
        !link.token ||
        !link.resourceId ||
        !link.createdAt ||
        !link.createdByUserId ||
        !link.createdByRole ||
        !link.expiresAt
      ) {
        return jsonResponse({ error: 'A complete share link payload is required.' }, 400);
      }

      const record: ShareRegistryRecord = {
        ...link,
        resourceBucket: link.resourceBucket || REPORTS_BUCKET,
        resourcePath: link.resourcePath || `${link.orgId}/${link.resourceId}/report.html`,
        resourceContentType: link.resourceContentType || 'text/html; charset=utf-8',
        resourceLabel: link.resourceLabel || 'Inspection report',
      };

      await writeShareRegistryRecord(supabaseAdmin, record);
      return jsonResponse({ status: 'ok' });
    }

    if (body.action === 'REVOKE_LINK') {
      if (!body.orgId || !body.token) {
        return jsonResponse({ error: 'orgId and token are required to revoke a share link.' }, 400);
      }

      const existing = await readShareRegistryRecord(supabaseAdmin, body.token);
      if (!existing) {
        return jsonResponse({ status: 'not_found' });
      }

      await writeShareRegistryRecord(supabaseAdmin, {
        ...existing,
        revokedAt: body.revokedAt || Date.now(),
        revokedByUserId: body.revokedByUserId,
      });

      return jsonResponse({ status: 'ok' });
    }

    if (!body.token) {
      return jsonResponse({ error: 'token is required.' }, 400);
    }

    const link = await readShareRegistryRecord(supabaseAdmin, body.token);
    const orgId = link?.orgId || decodeOrgIdFromToken(body.token);
    if (!orgId) {
      return jsonResponse({ status: 'not_found' });
    }

    const tokenHash = await hashToken(body.token);
    const timestamp = Date.now();
    const success = Boolean(link) && !link?.revokedAt && timestamp <= (link?.expiresAt || 0);
    const failureReason = !link
      ? 'NOT_FOUND'
      : link.revokedAt
        ? 'REVOKED'
        : timestamp > link.expiresAt
          ? 'EXPIRED'
          : undefined;

    const logRecord = {
      id: `${tokenHash.slice(0, 12)}_${timestamp}`,
      ts: timestamp,
      orgId,
      token: body.token,
      action: body.action,
      userAgent: body.userAgent || req.headers.get('user-agent') || undefined,
      referrer: body.referrer || req.headers.get('referer') || undefined,
      resourceType: 'report_pdf',
      resourceId: link?.resourceId || 'unknown',
      success,
      failureReason,
    };

    const logPath = getShareAccessLogPath(orgId, tokenHash, body.action, timestamp);
    const { error } = await supabaseAdmin.storage
      .from(REPORTS_BUCKET)
      .upload(logPath, new Blob([JSON.stringify(logRecord, null, 2)], { type: 'application/json; charset=utf-8' }), {
        upsert: true,
        contentType: 'application/json; charset=utf-8',
      });

    if (error) {
      throw error;
    }

    return jsonResponse({ status: 'ok' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected edge function error.';
    return jsonResponse({ error: message }, 400);
  }
});
