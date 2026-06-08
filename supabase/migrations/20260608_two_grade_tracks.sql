do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.daily_assignments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%grade%'
  loop
    execute format('alter table public.daily_assignments drop constraint if exists %I', c.conname);
  end loop;

  alter table public.daily_assignments
    alter column grade type numeric(3,1) using grade::numeric(3,1);

  alter table public.daily_assignments
    add column if not exists recitation_grade numeric(3,1),
    add column if not exists performance_grade numeric(3,1);

  update public.daily_assignments
  set recitation_grade = grade
  where recitation_grade is null and grade is not null;

  alter table public.daily_assignments
    add constraint daily_assignments_grade_half_check
      check (grade is null or (grade between 0 and 10 and grade * 2 = floor(grade * 2))),
    add constraint daily_assignments_recitation_grade_half_check
      check (recitation_grade is null or (recitation_grade between 0 and 10 and recitation_grade * 2 = floor(recitation_grade * 2))),
    add constraint daily_assignments_performance_grade_half_check
      check (performance_grade is null or (performance_grade between 0 and 10 and performance_grade * 2 = floor(performance_grade * 2)));
exception
  when duplicate_object then null;
end $$;
