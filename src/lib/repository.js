import { createClient } from '@supabase/supabase-js';
import { supabase, usernameToEmail, supabaseAnonKey, supabaseUrl } from './supabase';
import { defaultSchedule } from './scheduleSeed';

const normalizeGrade = (value) => (value === '' || value == null ? null : Number(value));

export async function signIn(username, password) {
  if (!supabase) throw new Error('Supabase غير مضبوط. أضف ملف .env');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSessionProfile() {
  if (!supabase) return { session: null, profile: null };
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return { session: null, profile: null };
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .single();
  if (error) throw error;
  return { session, profile };
}

export async function listStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('*, profile:profiles(*)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getStudentForProfile(profileId) {
  const { data, error } = await supabase
    .from('students')
    .select('*, profile:profiles(*)')
    .eq('profile_id', profileId)
    .single();
  if (error) throw error;
  return data;
}

export async function listAssignments(studentId) {
  const { data, error } = await supabase
    .from('daily_assignments')
    .select('*')
    .eq('student_id', studentId)
    .order('assignment_date', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listPlans(studentId) {
  let query = supabase.from('memorization_plans').select('*').order('created_at', { ascending: false });
  if (studentId) query = query.eq('student_id', studentId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateAssignment(id, patch) {
  const { data, error } = await supabase
    .from('daily_assignments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createAssignment(row) {
  const payload = {
    plan_id: row.plan_id,
    student_id: row.student_id,
    assignment_date: row.assignment_date,
    surah_name: row.surah_name,
    from_ayah: Number(row.from_ayah),
    to_ayah: Number(row.to_ayah),
    page_or_face: row.page_or_face,
    admin_note: row.admin_note || '',
    status: row.status || 'pending',
    grade: normalizeGrade(row.grade),
    recitation_grade: normalizeGrade(row.recitation_grade),
    performance_grade: normalizeGrade(row.performance_grade),
    sticker_emoji: row.sticker_emoji || null,
    sticker_label: row.sticker_label || null,
    sort_order: Number(row.sort_order || 0),
  };
  const { data, error } = await supabase
    .from('daily_assignments')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createStudentViaFunction(payload) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: payload,
  });
  if (error) return createStudentViaSignup(payload);
  if (data?.error) return createStudentViaSignup(payload);
  return data;
}

async function createStudentViaSignup(payload) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase غير مضبوط');
  const username = String(payload.username || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const fullName = String(payload.full_name || payload.name || '').trim();
  const displayName = String(payload.display_name || fullName || username).trim();

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new Error('اسم المستخدم يجب أن يكون 3-30 حرفًا: حروف إنجليزية صغيرة أو أرقام أو _');
  }
  if (!fullName || password.length < 8) {
    throw new Error('اكتب الاسم الكامل وكلمة مرور لا تقل عن 8 أحرف');
  }

  const signupClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: created, error: signupError } = await signupClient.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: {
      data: { username, display_name: displayName, role: 'student' },
    },
  });
  if (signupError) throw signupError;
  if (!created.user?.id) throw new Error('تعذر إنشاء حساب الطالب');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: created.user.id,
      full_name: fullName,
      display_name: displayName,
      username,
      role: 'student',
      status: 'active',
    })
    .select()
    .single();
  if (profileError) throw profileError;

  const { data: student, error: studentError } = await supabase
    .from('students')
    .insert({
      profile_id: profile.id,
      name: displayName,
      notes_internal: '',
      allow_student_notes: false,
      allow_student_complete: false,
    })
    .select()
    .single();
  if (studentError) throw studentError;

  return { profile, student };
}

export async function updateStudent(studentId, patch) {
  const { data, error } = await supabase
    .from('students')
    .update(patch)
    .eq('id', studentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStudent(student) {
  const { data, error } = await supabase.functions.invoke('admin-delete-user', {
    body: { profile_id: student.profile_id },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function listAllAssignments() {
  const { data, error } = await supabase
    .from('daily_assignments')
    .select('*')
    .order('assignment_date', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createDefaultPlan(studentId, profileId) {
  const { data: plan, error: planError } = await supabase
    .from('memorization_plans')
    .insert({
      student_id: studentId,
      title: 'خطة الدخان إلى فصلت',
      surah_name: 'الدخان إلى فصلت',
      start_date: '2026-06-07',
      end_date: '2026-07-02',
      is_active: true,
      created_by: profileId,
    })
    .select()
    .single();
  if (planError) throw planError;

  const rows = defaultSchedule.map(({ day, ...item }) => ({
    ...item,
    plan_id: plan.id,
    student_id: studentId,
    status: 'pending',
    grade: null,
    recitation_grade: null,
    performance_grade: null,
    sticker_emoji: null,
    sticker_label: null,
  }));

  const { error: assignmentError } = await supabase.from('daily_assignments').insert(rows);
  if (assignmentError) throw assignmentError;
  return plan;
}

export async function createCustomPlan(studentId, profileId, plan = {}) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuwait',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const payload = {
    student_id: studentId,
    title: plan.title || 'خطة خاصة',
    surah_name: plan.surah_name || 'خطة مستقلة',
    start_date: plan.start_date || today,
    end_date: plan.end_date || plan.start_date || today,
    is_active: true,
    created_by: profileId,
  };

  const { data, error } = await supabase
    .from('memorization_plans')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertAssignment(row) {
  const payload = {
    assignment_date: row.assignment_date,
    surah_name: row.surah_name,
    from_ayah: Number(row.from_ayah),
    to_ayah: Number(row.to_ayah),
    page_or_face: row.page_or_face,
    admin_note: row.admin_note,
    status: row.status,
    grade: normalizeGrade(row.grade),
    recitation_grade: normalizeGrade(row.recitation_grade),
    performance_grade: normalizeGrade(row.performance_grade),
    sticker_emoji: row.sticker_emoji || null,
    sticker_label: row.sticker_label || null,
  };
  return updateAssignment(row.id, payload);
}

export async function getReminderSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'cloud_reminders')
    .maybeSingle();
  if (error) throw error;
  return data?.value || {
    enabled: true,
    time: '17:00',
    timezone: 'Asia/Kuwait',
    channel: 'in_app_cloud',
    message: 'تذكير لطيف: ورد اليوم بانتظار المتابعة.',
  };
}

export async function saveReminderSettings(value) {
  const { data, error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'cloud_reminders', value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    .select()
    .single();
  if (error) throw error;
  return data.value;
}

export async function listReminderEvents(studentId) {
  const { data, error } = await supabase
    .from('reminder_events')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) throw error;
  return data || [];
}

export async function queueTodayReminderEvents(eventDate, message) {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('daily_assignments')
    .select('id, student_id, assignment_date, surah_name, from_ayah, to_ayah, status')
    .eq('assignment_date', eventDate)
    .in('status', ['pending', 'ready', 'needs_review']);
  if (assignmentsError) throw assignmentsError;

  const rows = (assignments || []).map((assignment) => ({
    student_id: assignment.student_id,
    assignment_id: assignment.id,
    event_date: eventDate,
    status: 'queued',
    message,
    metadata: {
      surah_name: assignment.surah_name,
      from_ayah: assignment.from_ayah,
      to_ayah: assignment.to_ayah,
      source: 'admin-manual-cloud-reminder',
    },
  }));

  if (!rows.length) return 0;
  const { error } = await supabase.from('reminder_events').insert(rows);
  if (error) throw error;
  return rows.length;
}
