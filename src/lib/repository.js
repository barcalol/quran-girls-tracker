import { supabase, usernameToEmail } from './supabase';
import { defaultSchedule } from './scheduleSeed';

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
    grade: row.grade === '' || row.grade == null ? null : Number(row.grade),
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
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
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
  }));

  const { error: assignmentError } = await supabase.from('daily_assignments').insert(rows);
  if (assignmentError) throw assignmentError;
  return plan;
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
    grade: row.grade === '' || row.grade == null ? null : Number(row.grade),
  };
  return updateAssignment(row.id, payload);
}
