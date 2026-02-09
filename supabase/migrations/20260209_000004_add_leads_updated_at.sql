alter table public.leads
  add column if not exists updated_at timestamptz default now();
