-- Bulk marketing orders + the manufacturing requests they generate.
--
-- A standard marketing order is pulled from stock on hand. But an outside rep
-- prepping a trade show needs 250 brochures, not 6 — more than the aisle holds.
-- Those orders are flagged BULK on submission (over the unit threshold in
-- lib/marketingOrders.ts, or asking for more of an item than is in stock), which
-- lifts the "cap the quantity at available stock" rule the picker normally
-- enforces.
--
-- A bulk order can't be fulfilled by picking it off a shelf, so the inside sales
-- rep working it files a MANUFACTURING REQUEST: a separate, tracked ask to get
-- more made. Requests hang off the order (an order can need several — one per
-- item, or a split production run) and route to the `marketing_manufacturing_
-- request` notification tool, whose recipients admins assign in Notifications
-- settings. The submitting outside rep sees the request's status on their order
-- tracker but never files one.

alter table public.marketing_orders
  add column if not exists is_bulk boolean not null default false;

-- Backfill history so old large orders read consistently in the UI. `quantity`
-- is free text (legacy orders wrote things like "a case"), so only rows storing
-- a plain integer over the threshold can be judged.
update public.marketing_orders
   set is_bulk = true
 where is_bulk = false
   and quantity ~ '^[0-9]+$'
   and quantity::int > 10;

-- Scanning the fulfillment queue for the orders that need a production run.
create index if not exists marketing_orders_is_bulk_idx
  on public.marketing_orders (is_bulk)
  where is_bulk;

create table if not exists public.marketing_manufacturing_requests (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.marketing_orders(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  item_name    text not null,
  quantity     integer not null check (quantity > 0),
  needed_by    date,
  vendor       text,
  notes        text,
  status       text not null default 'requested'
                 check (status in ('requested', 'quoted', 'ordered', 'received', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

create index if not exists marketing_manufacturing_requests_order_idx
  on public.marketing_manufacturing_requests (order_id, created_at);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Writes all go through the service role in the API (which enforces the
-- territory scoping inside reps are held to). These policies cover direct reads.
alter table public.marketing_manufacturing_requests enable row level security;

-- The fulfillment team reads every request.
create policy marketing_manufacturing_requests_team_read
  on public.marketing_manufacturing_requests
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  );

-- The rep who placed the order sees what's being made for it — status only in
-- the UI, but the row is theirs to read.
create policy marketing_manufacturing_requests_owner_read
  on public.marketing_manufacturing_requests
  for select
  using (
    exists (
      select 1 from public.marketing_orders o
      where o.id = marketing_manufacturing_requests.order_id
        and o.created_by = auth.uid()
    )
  );
