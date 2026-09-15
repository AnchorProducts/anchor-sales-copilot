-- Pizza boxes as something you order and something you scan out.
--
-- Marketing pre-assembles pizza boxes (the anchor, that series' four packaging
-- pieces, and the printables every box gets — app_settings.pizza_box_extras).
-- Two records follow from that.
--
-- 1. Orders know what they pull from stock.
--
--    A rep can now order a sample AS a pizza box. marketing_orders.items is free
--    text, so fulfillment has never been able to work out what an order uses —
--    it pre-filled overlays from overlay_kits and left everything else to be
--    picked by hand. A box is six or more rows of that. stock_plan records the
--    whole thing per inventory item id ({"<item id>": 5, ...}): picked items,
--    paired overlays, and every box's pieces and printables, computed on submit.
--    Fulfillment pre-fills its inventory rows from it. pizza_boxes is the
--    headline count for the queue.
--
--    Orders placed before this carry an empty plan and fall back to the overlay
--    pre-fill they always had.
--
-- 2. A box scan is one event.
--
--    The public box scanner logs each item as its own marketing_item_grabs line,
--    which keeps returns per item — but in the pickup log five boxes read as six
--    unrelated pickups. marketing_box_scans records the pass: who, which boxes,
--    and per item what was packed, what was taken and what was pulled back out.
--    Each pickup line points back at its scan.

alter table public.marketing_orders
  add column if not exists pizza_boxes integer not null default 0,
  add column if not exists stock_plan jsonb not null default '{}'::jsonb;

create table if not exists public.marketing_box_scans (
  id               uuid primary key default gen_random_uuid(),
  scanned_by_name  text not null,
  scanned_by_email text not null,
  box_count        integer not null default 0 check (box_count >= 0),
  -- [{ item_id, name, count }] — the box types scanned, by anchor.
  boxes            jsonb not null default '[]'::jsonb,
  -- [{ item_id, name, packed, quantity, removed, short }] — per item.
  lines            jsonb not null default '[]'::jsonb,
  ip               text,
  created_at       timestamptz not null default now()
);

create index if not exists marketing_box_scans_created_idx
  on public.marketing_box_scans (created_at desc);

-- Service-role only, like the rest of the aisle tables: the public scanner
-- validates the aisle token and writes through the service role.
alter table public.marketing_box_scans enable row level security;

alter table public.marketing_item_grabs
  add column if not exists box_scan_id uuid references public.marketing_box_scans (id) on delete set null;

create index if not exists marketing_item_grabs_box_scan_idx
  on public.marketing_item_grabs (box_scan_id)
  where box_scan_id is not null;

notify pgrst, 'reload schema';
