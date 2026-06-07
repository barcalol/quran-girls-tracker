import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('APP_ORIGIN') ?? '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) throw new Error('Unauthorized');

    const { data: requester } = await adminClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', auth.user.id)
      .single();
    if (requester?.role !== 'admin') throw new Error('Admin only');

    const { profile_id } = await req.json();
    if (!profile_id) throw new Error('profile_id is required');

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('auth_user_id')
      .eq('id', profile_id)
      .single();
    if (profileError) throw profileError;

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(profile.auth_user_id);
    if (deleteAuthError) throw deleteAuthError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
