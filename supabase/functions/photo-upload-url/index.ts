// supabase/functions/photo-upload-url/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { orgId, photoId, variant, contentType } = await req.json();

    // 1. Initialize Supabase Admin Client
    // Use SUPABASE_SERVICE_ROLE_KEY for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // TODO: Validate user session and organization membership
    // const authHeader = req.headers.get('Authorization');
    // const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    // if (authError || !user) throw new Error('Unauthorized');

    // 2. Compute Storage Path
    const bucket = 'photos';
    const path = `${orgId}/${photoId}/${variant}.jpg`;

    // 3. Create Signed Upload URL (for PUT)
    // This allows the client to upload directly to this path for a limited time
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        bucket,
        path,
        uploadUrl: data.signedUrl,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
