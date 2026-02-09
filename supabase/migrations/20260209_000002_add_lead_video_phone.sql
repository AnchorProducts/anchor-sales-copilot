alter table public.leads
  add column if not exists video_call_phone text;
