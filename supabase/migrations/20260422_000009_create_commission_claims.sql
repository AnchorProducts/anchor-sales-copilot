-- Commission claims submitted by external reps

create table if not exists public.commission_claims (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,

  -- Rep info (denormalized from profiles at submit time)
  rep_name text,
  rep_company text,
  rep_phone text,
  rep_email text,

  -- Certification
  certified boolean not null default false,
  unaware_other_salesperson text, -- 'yes' or 'no'
  specifier_assisted text,        -- 'yes' or 'no'

  -- Order info
  estimated_order_date date,
  company_placing_order text not null,
  order_city text,
  order_state text,
  u_anchors_ordered text,
  qty text,
  roof_brand text,
  other_items text,

  -- Ship-to
  ship_to_address text,
  ship_city text,
  ship_state text,
  ship_zip text,

  -- Description
  project_description text,

  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commission_claims_created_by_idx on public.commission_claims (created_by);
create index if not exists commission_claims_created_at_idx on public.commission_claims (created_at);

alter table public.commission_claims enable row level security;

create policy commission_claims_external_insert
  on public.commission_claims
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  );

create policy commission_claims_external_select_own
  on public.commission_claims
  for select
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'external_rep'
    )
  );

create policy commission_claims_internal_select_all
  on public.commission_claims
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('anchor_rep', 'admin')
    )
  );

create policy commission_claims_internal_update
  on public.commission_claims
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('anchor_rep', 'admin')
    )
  );
