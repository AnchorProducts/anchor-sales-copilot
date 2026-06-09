-- Marketing Orders — sales reps (internal + external) request marketing
-- collateral: samples, brochures, swag, or other items. Submissions are stored
-- here and emailed to an admin-configured recipient. Routing is PER CATEGORY:
-- admins map each category to a specific address (with a default fallback) from
-- the Notifications admin page.
--
-- Recipient routing lives on the existing single-row notification_settings
-- table as a jsonb map, e.g.:
--   { "samples": "samples@anchorp.com",
--     "brochures": "marketing@anchorp.com",
--     "swag": "swag@anchorp.com",
--     "default": "marketing@anchorp.com" }
-- A category with no entry falls back to "default", then to env vars.

create table if not exists public.marketing_orders (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid references auth.users (id) on delete set null,
  submitter_name    text,
  submitter_company text,
  submitter_email   text,
  submitter_phone   text,
  category          text not null,
  items             text not null,
  quantity          text,
  ship_to           text,
  notes             text,
  status            text not null default 'new',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists marketing_orders_created_by_idx on public.marketing_orders (created_by);
create index if not exists marketing_orders_created_at_idx on public.marketing_orders (created_at desc);

alter table public.marketing_orders enable row level security;

-- Reps can see their own orders.
create policy "Users can read their own marketing orders"
  on public.marketing_orders for select
  using (created_by = auth.uid());

-- Internal sales + admins can read all (for any future admin review screen).
create policy "Staff can read all marketing orders"
  on public.marketing_orders for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'anchor_rep')
    )
  );

-- Sales reps (internal + external) and admins may file an order as themselves.
create policy "Sales can insert their own marketing orders"
  on public.marketing_orders for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'anchor_rep', 'external_rep')
    )
  );

-- Admins can update (e.g. mark fulfilled).
create policy "Admins can update marketing orders"
  on public.marketing_orders for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Per-category recipient routing for marketing orders, stored on the existing
-- single-row settings table. Defaults to an empty map; the API falls back to
-- env vars when a category (and "default") is unset.
alter table public.notification_settings
  add column if not exists marketing_orders_recipients jsonb not null default '{}'::jsonb;
