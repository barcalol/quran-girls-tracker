-- Create auth users from Supabase Dashboard or via the Edge Function first:
-- admin / <ADMIN_PASSWORD> -> admin@quran-girls.local
-- reem / <REEM_PASSWORD> -> reem@quran-girls.local
-- aisha / <AISHA_PASSWORD> -> aisha@quran-girls.local
--
-- Then run this seed after replacing auth_user_id values if you created users manually.

insert into public.app_settings (key, value)
values (
  'student_permissions',
  '{"allow_student_notes": false, "allow_student_complete": false, "reminder_time": "17:00"}'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- The app can also create these rows after login through admin screens.
