// supabase/functions/photo-upload-url/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
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

    const { orgId, photoId, variant } = await req.json();

    if (!orgId || !photoId || (variant !== 'full' && variant !== 'thumb')) {
      return jsonResponse(
        { error: 'orgId, photoId, and variant ("full" or "thumb") are required.' },
        400
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // TODO: Validate user session and organization membership
    // const authHeader = req.headers.get('Authorization');
    // const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    // if (authError || !user) throw new Error('Unauthorized');

    const bucket = 'photos';
    const path = `${orgId}/${photoId}/${variant}.jpg`;

    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);

    if (error) {
      throw error;
    }

    return jsonResponse({
      bucket,
      path,
      uploadUrl: data.signedUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected edge function error.';
    return jsonResponse({ error: message }, 400);
  }
});
