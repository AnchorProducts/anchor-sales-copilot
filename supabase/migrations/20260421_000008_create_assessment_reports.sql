create table if not exists public.assessment_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  contractor_name text,
  company_name    text,
  access_type     text check (access_type in ('ladder-audit','ladder-recommendation','hatch-audit','stairs-audit')),
  flags_count     integer not null default 0,
  file_url        text,
  created_at      timestamptz not null default now()
);

alter table public.assessment_reports enable row level security;

-- External users can insert their own reports
create policy "Users can insert own reports"
  on public.assessment_reports for insert
  with check (auth.uid() = user_id);

-- Admins can read all reports
create policy "Admins can read all reports"
  on public.assessment_reports for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Users can read their own reports
create policy "Users can read own reports"
  on public.assessment_reports for select
  using (auth.uid() = user_id);
