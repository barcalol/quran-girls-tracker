alter table public.daily_assignments
  add column if not exists sticker_emoji text,
  add column if not exists sticker_label text;
