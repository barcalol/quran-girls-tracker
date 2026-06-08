import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = [
  Deno.env.get('APP_ORIGIN'),
  'https://barcalol.github.io',
  'http://127.0.0.1:5180',
  'http://localhost:5180',
].filter(Boolean);

function corsHeadersFor(req: Request) {
  const origin = req.headers.get('origin');
  const allowedOrigin = !origin || allowedOrigins.includes(origin) ? (origin || allowedOrigins[0] || '*') : (allowedOrigins[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
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

    const body = await req.json();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.full_name || body.name || '').trim();
    const displayName = String(body.display_name || fullName || username).trim();
    const role = body.role === 'admin' ? 'admin' : 'student';

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      throw new Error('username must be 3-30 chars: a-z, 0-9, underscore only');
    }

    if (!username || password.length < 8 || !fullName) {
      throw new Error('username, full_name, and password of at least 8 chars are required');
    }

    const email = `${username}@quran-girls.local`;
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName, role },
    });
    if (createError) throw createError;

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .insert({
        auth_user_id: created.user.id,
        full_name: fullName,
        display_name: displayName,
        username,
        role,
        status: 'active',
      })
      .select()
      .single();
    if (profileError) throw profileError;

    let student = null;
    if (role === 'student') {
      const { data, error } = await adminClient
        .from('students')
        .insert({
          profile_id: profile.id,
          name: displayName,
          allow_student_notes: false,
          allow_student_complete: false,
        })
        .select()
        .single();
      if (error) throw error;
      student = data;
    }

    return new Response(JSON.stringify({ profile, student }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
