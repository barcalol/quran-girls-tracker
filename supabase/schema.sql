create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  display_name text not null,
  username text not null unique,
  role text not null check (role in ('admin', 'student')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null,
  notes_internal text,
  allow_student_notes boolean not null default false,
  allow_student_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memorization_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  surah_name text,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.memorization_plans(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  assignment_date date not null,
  surah_name text not null,
  from_ayah int not null check (from_ayah > 0),
  to_ayah int not null check (to_ayah >= from_ayah),
  page_or_face text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'completed', 'delayed', 'needs_review')),
  admin_note text,
  student_note text,
  grade int check (grade is null or grade between 0 and 10),
  completed_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.daily_assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  grade int not null check (grade between 0 and 10),
  note text,
  evaluated_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at before update on public.students
for each row execute function public.touch_updated_at();

drop trigger if exists plans_touch_updated_at on public.memorization_plans;
create trigger plans_touch_updated_at before update on public.memorization_plans
for each row execute function public.touch_updated_at();

drop trigger if exists assignments_touch_updated_at on public.daily_assignments;
create trigger assignments_touch_updated_at before update on public.daily_assignments
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.students s
  join public.profiles p on p.id = s.profile_id
  where p.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.prevent_student_assignment_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() = 'student' then
    if new.plan_id is distinct from old.plan_id
      or new.student_id is distinct from old.student_id
      or new.assignment_date is distinct from old.assignment_date
      or new.surah_name is distinct from old.surah_name
      or new.from_ayah is distinct from old.from_ayah
      or new.to_ayah is distinct from old.to_ayah
      or new.page_or_face is distinct from old.page_or_face
      or new.admin_note is distinct from old.admin_note
      or new.grade is distinct from old.grade
      or new.sort_order is distinct from old.sort_order
    then
      raise exception 'students may only update status, student_note, and completed_at';
    end if;

    if new.status not in ('pending', 'ready', 'completed') then
      raise exception 'students cannot set this status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_prevent_student_privilege_escalation on public.daily_assignments;
create trigger assignments_prevent_student_privilege_escalation
before update on public.daily_assignments
for each row execute function public.prevent_student_assignment_privilege_escalation();

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.memorization_plans enable row level security;
alter table public.daily_assignments enable row level security;
alter table public.evaluations enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select using (auth_user_id = auth.uid() or public.current_role() = 'admin');

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "students_select_own_or_admin" on public.students;
create policy "students_select_own_or_admin" on public.students
for select using (public.current_role() = 'admin' or id = public.current_student_id());

drop policy if exists "students_admin_all" on public.students;
create policy "students_admin_all" on public.students
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "plans_select_own_or_admin" on public.memorization_plans;
create policy "plans_select_own_or_admin" on public.memorization_plans
for select using (public.current_role() = 'admin' or student_id = public.current_student_id());

drop policy if exists "plans_admin_all" on public.memorization_plans;
create policy "plans_admin_all" on public.memorization_plans
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "assignments_select_own_or_admin" on public.daily_assignments;
create policy "assignments_select_own_or_admin" on public.daily_assignments
for select using (public.current_role() = 'admin' or student_id = public.current_student_id());

drop policy if exists "assignments_admin_all" on public.daily_assignments;
create policy "assignments_admin_all" on public.daily_assignments
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "assignments_student_limited_update" on public.daily_assignments;

drop policy if exists "evaluations_select_own_or_admin" on public.evaluations;
create policy "evaluations_select_own_or_admin" on public.evaluations
for select using (public.current_role() = 'admin' or student_id = public.current_student_id());

drop policy if exists "evaluations_admin_all" on public.evaluations;
create policy "evaluations_admin_all" on public.evaluations
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "settings_admin_all" on public.app_settings;
create policy "settings_admin_all" on public.app_settings
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

drop policy if exists "settings_read_authenticated" on public.app_settings;
create policy "settings_read_authenticated" on public.app_settings
for select using (auth.uid() is not null);
