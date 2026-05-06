import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { renderInspectionReportHtml } from '../_shared/reportRenderer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REPORTS_BUCKET = 'reports';

type GenerateReportRequest = {
  orgId?: string;
  reportId?: string;
  inspectionId?: string;
  options?: {
    includePhotos?: boolean;
    photoLayout?: 'grid' | 'full';
    includeCosts?: boolean;
  };
  snapshot?: Record<string, unknown> | null;
  inspection?: {
    id: string;
    title: string;
    status: string;
    notes?: string;
    createdAt: number;
    updatedAt: number;
    photoCount: number;
  } | null;
  unit?: {
    id: string;
    name: string;
    unitCode?: string;
    facilityName?: string;
    buildingName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const ensureReportsBucket = async (supabaseAdmin: SupabaseClient) => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw error;

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Report generation is not configured.' }, 500);
    }

    const body = (await req.json()) as GenerateReportRequest;
    const orgId = body.orgId?.trim();
    const reportId = body.reportId?.trim();
    const inspectionId = body.inspectionId?.trim();

    if (!orgId || !reportId || !inspectionId) {
      return jsonResponse({ error: 'orgId, reportId, and inspectionId are required.' }, 400);
    }

    if (!body.snapshot && !body.inspection) {
      return jsonResponse({ error: 'A report snapshot or inspection summary is required.' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    await ensureReportsBucket(supabaseAdmin);

    const generatedAt = Date.now();
    const reportPath = `${orgId}/${reportId}/report.html`;
    const metadataPath = `${orgId}/${reportId}/report.json`;
    const html = renderInspectionReportHtml({
      orgId,
      reportId,
      inspectionId,
      inspection: body.inspection || undefined,
      unit: body.unit || undefined,
      snapshot: body.snapshot
        ? {
            ...body.snapshot,
            generatedAt,
          }
        : { generatedAt },
    });

    const { error: htmlError } = await supabaseAdmin.storage
      .from(REPORTS_BUCKET)
      .upload(reportPath, new Blob([html], { type: 'text/html; charset=utf-8' }), {
        upsert: true,
        contentType: 'text/html; charset=utf-8',
      });
    if (htmlError) throw htmlError;

    const metadata = {
      orgId,
      reportId,
      inspectionId,
      generatedAt,
      options: body.options || {},
      artifact: {
        bucket: REPORTS_BUCKET,
        path: reportPath,
        contentType: 'text/html; charset=utf-8',
      },
    };
    const { error: metadataError } = await supabaseAdmin.storage
      .from(REPORTS_BUCKET)
      .upload(metadataPath, new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json; charset=utf-8' }), {
        upsert: true,
        contentType: 'application/json; charset=utf-8',
      });
    if (metadataError) throw metadataError;

    return jsonResponse({
      bucket: REPORTS_BUCKET,
      path: reportPath,
      metadataPath,
      generatedAt,
      contentType: 'text/html; charset=utf-8',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected report generation error.';
    return jsonResponse({ error: message }, 400);
  }
});
