import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // TODO: Real DB lookup in 'share_links' table
    // const { data: link, error } = await supabaseAdmin
    //   .from('share_links')
    //   .select('*')
    //   .eq('token', token)
    //   .single()

    // Mock lookup for now
    const mockLink = {
      status: 'ok',
      bucket: 'reports',
      path: 'org_123/report_456.pdf',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    }

    if (mockLink.status === 'ok') {
      // Generate short-lived signed URL for the viewer
      const { data, error: signError } = await supabaseAdmin
        .storage
        .from(mockLink.bucket)
        .createSignedUrl(mockLink.path, 900) // 15 mins

      if (signError) throw signError

      return new Response(
        JSON.stringify({ 
          status: 'ok',
          url: data.signedUrl,
          expiresAt: mockLink.expiresAt
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ status: mockLink.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
