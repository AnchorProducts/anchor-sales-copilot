-- Marketing inventory + tradeshow checkout.
--
-- Two linked systems plus an order-usage bridge:
--
-- 1. marketing_inventory_items — the catalog of physical marketing stock
--    (samples, brochures, swag, …). Each item tracks two live counts:
--      quantity_available = units in stock and usable right now
--      quantity_out       = units currently checked out to an event
--    Total owned = available + out. These counts are mutated atomically by the
--    API on checkout / check-in (and on marketing-order fulfillment); the
--    constraints below guarantee they never go negative.
--
-- 2. marketing_item_checkouts — the tradeshow loan log. Checking items out for
--    an event moves units available -> out; checking them back in moves units
--    out -> available, minus any damaged/lost units that leave the total. One
--    check-in closes a loan (status 'out' -> 'returned').
--
-- 3. marketing_order_item_usage — when a marketing order is marked fulfilled, a
--    fulfiller records which inventory item(s) it consumed (orders store
--    free-text items, so the link is recorded explicitly, not inferred). Each
--    row decrements the item's quantity_available.
--
-- Photos live in the private "lead-uploads" bucket under inventory/<id>/, the
-- same bucket notable-project photos use; the path is stored on image_path and
-- served via short-lived signed URLs from the API.
--
-- All writes flow through the service role in the API, which enforces the role
-- gate (admins + inside reps write; outside reps read-only). RLS mirrors that so
-- any direct client read is still scoped correctly.

-- ── Items ──────────────────────────────────────────────────────────────────
create table if not exists public.marketing_inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  category            text,
  sku                 text,
  unit_cost           numeric(12,2),
  location            text,
  image_path          text,
  quantity_available  integer not null default 0,
  quantity_out        integer not null default 0,
  low_stock_threshold integer not null default 0,
  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint marketing_inventory_items_qty_nonneg
    check (quantity_available >= 0 and quantity_out >= 0 and low_stock_threshold >= 0)
);

create index if not exists marketing_inventory_items_name_idx
  on public.marketing_inventory_items (name);
create index if not exists marketing_inventory_items_category_idx
  on public.marketing_inventory_items (category);

-- ── Checkouts (tradeshow loans) ──────────────────────────────────────────────
create table if not exists public.marketing_item_checkouts (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references public.marketing_inventory_items (id) on delete cascade,
  event_name        text not null,
  quantity          integer not null check (quantity > 0),
  taken_by          text,
  due_back_date     date,
  status            text not null default 'out',
  checked_out_by    uuid references auth.users (id) on delete set null,
  checked_out_at    timestamptz not null default now(),
  returned_by       uuid references auth.users (id) on delete set null,
  returned_at       timestamptz,
  quantity_returned integer,
  quantity_damaged  integer not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint marketing_item_checkouts_status_chk check (status in ('out', 'returned')),
  constraint marketing_item_checkouts_damaged_nonneg check (quantity_damaged >= 0)
);

create index if not exists marketing_item_checkouts_item_idx
  on public.marketing_item_checkouts (item_id, checked_out_at desc);
create index if not exists marketing_item_checkouts_status_idx
  on public.marketing_item_checkouts (status);
create index if not exists marketing_item_checkouts_due_idx
  on public.marketing_item_checkouts (due_back_date);

-- ── Order → inventory usage bridge ───────────────────────────────────────────
create table if not exists public.marketing_order_item_usage (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.marketing_orders (id) on delete cascade,
  item_id    uuid references public.marketing_inventory_items (id) on delete set null,
  quantity   integer not null check (quantity > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_order_item_usage_order_idx
  on public.marketing_order_item_usage (order_id);
create index if not exists marketing_order_item_usage_item_idx
  on public.marketing_order_item_usage (item_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.marketing_inventory_items enable row level security;
alter table public.marketing_item_checkouts enable row level security;
alter table public.marketing_order_item_usage enable row level security;

-- Items: every signed-in sales user can read (outside reps get a read-only
-- view). Only admins + inside (anchor) reps can write.
create policy marketing_inventory_items_read
  on public.marketing_inventory_items for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep', 'external_rep')
    )
  );

create policy marketing_inventory_items_write
  on public.marketing_inventory_items for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  );

-- Checkouts + usage: internal coordination only — admins + inside reps.
create policy marketing_item_checkouts_team_all
  on public.marketing_item_checkouts for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  );

create policy marketing_order_item_usage_team_all
  on public.marketing_order_item_usage for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  );
