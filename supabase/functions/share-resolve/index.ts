import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';
import { ensureReportsBucket, readShareRegistryRecord } from '../_shared/shareRegistry.ts';

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

    const { token } = (await req.json()) as { token?: string };

    if (!token) {
      return jsonResponse({ error: 'token is required.' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    await ensureReportsBucket(supabaseAdmin);

    const link = await readShareRegistryRecord(supabaseAdmin, token);

    if (!link) {
      return jsonResponse({ status: 'not_found' });
    }

    if (link.revokedAt) {
      return jsonResponse({ status: 'revoked' });
    }

    if (Date.now() > link.expiresAt) {
      return jsonResponse({ status: 'expired' });
    }

    const bucket = link.resourceBucket || 'reports';
    const path = link.resourcePath || `${link.orgId}/${link.resourceId}/report.html`;
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 900);

    if (error) {
      throw error;
    }

    return jsonResponse({
      status: 'ok',
      bucket,
      path,
      url: data.signedUrl,
      expiresAt: link.expiresAt,
      contentType: link.resourceContentType || 'text/html; charset=utf-8',
      title: link.resourceLabel || 'Inspection report',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected edge function error.';
    return jsonResponse({ error: message }, 400);
  }
});
