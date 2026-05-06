-- Notable project submissions from external reps (photos + brief writeup).

create table if not exists public.notable_projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,

  -- Submitter info (denormalized from profiles at submit time)
  submitter_name text,
  submitter_company text,
  submitter_email text,
  submitter_phone text,

  -- Project info
  name text not null,
  location text,
  description text,
  contact text,

  -- Photo attachments (each item: { path, filename, contentType, size, uploadedAt })
  photos jsonb not null default '[]'::jsonb,

  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notable_projects_created_by_idx on public.notable_projects (created_by);
create index if not exists notable_projects_created_at_idx on public.notable_projects (created_at);

alter table public.notable_projects enable row level security;

create policy notable_projects_external_insert
  on public.notable_projects
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  );

create policy notable_projects_external_select_own
  on public.notable_projects
  for select
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  );

create policy notable_projects_internal_select_all
  on public.notable_projects
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('anchor_rep', 'admin')
    )
  );

create policy notable_projects_internal_update
  on public.notable_projects
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('anchor_rep', 'admin')
    )
  );
