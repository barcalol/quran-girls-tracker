import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const reminderCronSecret = Deno.env.get('REMINDER_CRON_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !reminderCronSecret) {
    return json({ error: 'Missing Supabase environment variables' }, 500);
  }

  if (req.headers.get('x-reminder-secret') !== reminderCronSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: settingsRow, error: settingsError } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'cloud_reminders')
    .maybeSingle();

  if (settingsError) return json({ error: settingsError.message }, 500);

  const settings = settingsRow?.value || {};
  if (settings.enabled === false) {
    return json({ status: 'skipped', reason: 'cloud reminders disabled' });
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timezone || 'Asia/Kuwait',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const { data: assignments, error: assignmentsError } = await supabase
    .from('daily_assignments')
    .select('id, student_id, assignment_date, surah_name, from_ayah, to_ayah, status')
    .eq('assignment_date', today)
    .in('status', ['pending', 'ready', 'needs_review']);

  if (assignmentsError) return json({ error: assignmentsError.message }, 500);

  const message = settings.message || 'تذكير لطيف: ورد اليوم بانتظار المتابعة.';
  const rows = (assignments || []).map((assignment) => ({
    student_id: assignment.student_id,
    assignment_id: assignment.id,
    event_date: today,
    status: 'queued',
    message,
    metadata: {
      surah_name: assignment.surah_name,
      from_ayah: assignment.from_ayah,
      to_ayah: assignment.to_ayah,
      source: 'daily-reminder-digest',
    },
  }));

  if (!rows.length) return json({ status: 'ok', queued: 0 });

  const { error: insertError } = await supabase.from('reminder_events').insert(rows);
  if (insertError) return json({ error: insertError.message }, 500);

  return json({ status: 'ok', queued: rows.length });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
