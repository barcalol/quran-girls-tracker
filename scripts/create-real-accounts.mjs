import { createClient } from '@supabase/supabase-js';
import { defaultSchedule } from '../src/lib/scheduleSeed.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const credentials = {
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'Admin123456',
    full_name: 'Admin',
    display_name: 'الإدارة',
    role: 'admin',
  },
  reem: {
    username: process.env.REEM_USERNAME || 'reem',
    password: process.env.REEM_PASSWORD || 'Reem123456',
    full_name: 'REEM',
    display_name: 'REEM',
    role: 'student',
  },
  aisha: {
    username: process.env.AISHA_USERNAME || 'aisha',
    password: process.env.AISHA_PASSWORD || 'Aisha123456',
    full_name: 'AISHA',
    display_name: 'AISHA',
    role: 'student',
  },
};

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function emailFor(username) {
  return `${username.toLowerCase()}@quran-girls.local`;
}

async function createOrUpdateAuthUser(account) {
  const email = emailFor(account.username);
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: account.password,
    email_confirm: true,
    user_metadata: {
      username: account.username,
      display_name: account.display_name,
      role: account.role,
    },
  });

  if (!createError) return created.user;

  if (!String(createError.message).toLowerCase().includes('already')) {
    throw createError;
  }

  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = users.users.find((user) => user.email === email);
  if (!existing) throw createError;

  const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
    password: account.password,
    user_metadata: {
      username: account.username,
      display_name: account.display_name,
      role: account.role,
    },
  });
  if (updateError) throw updateError;
  return updated.user;
}

async function upsertProfile(account, authUser) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        auth_user_id: authUser.id,
        full_name: account.full_name,
        display_name: account.display_name,
        username: account.username,
        role: account.role,
        status: 'active',
      },
      { onConflict: 'username' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function upsertStudent(profile, account) {
  if (account.role !== 'student') return null;
  const { data, error } = await supabase
    .from('students')
    .upsert(
      {
        profile_id: profile.id,
        name: account.display_name,
        notes_internal: '',
        allow_student_notes: false,
        allow_student_complete: false,
      },
      { onConflict: 'profile_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function ensureDefaultPlan(student, adminProfile) {
  const { data: existingPlans, error: existingError } = await supabase
    .from('memorization_plans')
    .select('id')
    .eq('student_id', student.id)
    .eq('title', 'خطة الدخان إلى فصلت')
    .limit(1);
  if (existingError) throw existingError;

  let plan = existingPlans?.[0];
  if (!plan) {
    const { data, error } = await supabase
      .from('memorization_plans')
      .insert({
        student_id: student.id,
        title: 'خطة الدخان إلى فصلت',
        surah_name: 'الدخان إلى فصلت',
        start_date: '2026-06-07',
        end_date: '2026-07-02',
        is_active: true,
        created_by: adminProfile.id,
      })
      .select()
      .single();
    if (error) throw error;
    plan = data;
  }

  const { data: existingAssignments, error: assignmentsError } = await supabase
    .from('daily_assignments')
    .select('id')
    .eq('plan_id', plan.id)
    .limit(1);
  if (assignmentsError) throw assignmentsError;

  if (!existingAssignments?.length) {
    const rows = defaultSchedule.map(({ day, ...item }) => ({
      ...item,
      plan_id: plan.id,
      student_id: student.id,
      status: 'pending',
      grade: null,
    }));
    const { error } = await supabase.from('daily_assignments').insert(rows);
    if (error) throw error;
  }
}

const created = {};
for (const account of Object.values(credentials)) {
  const authUser = await createOrUpdateAuthUser(account);
  const profile = await upsertProfile(account, authUser);
  const student = await upsertStudent(profile, account);
  created[account.username] = { profile, student };
  console.log(`✓ ${account.username} ready`);
}

for (const username of ['reem', 'aisha']) {
  await ensureDefaultPlan(created[username].student, created.admin.profile);
  console.log(`✓ default plan ready for ${username}`);
}

console.log('\nAccounts created/updated:');
for (const account of Object.values(credentials)) {
  console.log(`- ${account.username} / ${account.password}`);
}
