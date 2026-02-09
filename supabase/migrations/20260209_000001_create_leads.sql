-- Leads + sales_regions tables

create table if not exists public.sales_regions (
  region_code text primary key,
  rep_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_company text not null,
  details text not null,
  location_text text not null,
  region_code text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_email text,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  assigned_rep_user_id uuid references public.profiles(id) on delete set null,
  wants_video_call boolean not null default false,
  preferred_times jsonb,
  meeting_link text,
  hubspot_company_id text,
  hubspot_contact_id text,
  hubspot_deal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_status_check check (status in ('new','assigned','contacted','qualified','closed_won','closed_lost'))
);

create index if not exists leads_created_by_idx on public.leads (created_by);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_region_idx on public.leads (region_code);
create index if not exists leads_assigned_rep_idx on public.leads (assigned_rep_user_id);
create index if not exists leads_created_at_idx on public.leads (created_at);

alter table public.leads enable row level security;

-- External reps: insert/select own leads
create policy leads_external_insert_own
  on public.leads
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  );

create policy leads_external_select_own
  on public.leads
  for select
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  );

-- External reps: can update own lead only while status is 'new'
create policy leads_external_update_own_new
  on public.leads
  for update
  using (
    created_by = auth.uid()
    and status = 'new'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  );

-- Internal reps: select/update all leads
create policy leads_internal_select_all
  on public.leads
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin','anchor_rep')
    )
  );

create policy leads_internal_update_all
  on public.leads
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin','anchor_rep')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin','anchor_rep')
    )
  );
