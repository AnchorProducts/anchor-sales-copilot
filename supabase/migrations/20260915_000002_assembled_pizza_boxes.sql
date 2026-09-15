-- Assembled pizza boxes are their own stock.
--
-- Until now assembling a pizza box moved no stock: a box's anchor, its series'
-- pieces and its printables stayed on their loose counts until the box was
-- scanned out. That made every assembled box look like free parts. With 147
-- boxes built and on the shelf, the app said 147 boxes, 147 overlays and 147
-- anchors were available — so an OEM order for 100 anchors would have been
-- filled by opening boxes, when the right answer was "those are spoken for,
-- order more".
--
-- So assembling now RESERVES a box's contents. Each box type gets one inventory
-- item of its own ("2400 IB PVC — Pizza Box") whose quantity_available is the
-- boxes assembled and ready, and which points at its anchor through box_of.
-- Assembling N boxes takes N of the anchor, N of each piece and the printables
-- off their loose counts and adds N here; unboxing reverses it. Everything that
-- reads quantity_available — the order form, the aisle, the rep inventory page —
-- then only ever sees stock that's actually free.
--
-- Being an ordinary item is the point: orders, fulfillment decrements, aisle
-- returns and low-stock alerts already work on items, so they work on boxes.
--
-- box_of is SET NULL rather than cascaded: deleting an anchor must not silently
-- delete the boxes already built around it. marketing_box_assemblies is the log
-- of each assemble/unbox — who, how many, and which counts came up short.

alter table public.marketing_inventory_items
  add column if not exists box_of uuid references public.marketing_inventory_items (id) on delete set null;

-- One ready-box item per anchor.
create unique index if not exists marketing_inventory_items_box_of_uq
  on public.marketing_inventory_items (box_of)
  where box_of is not null;

alter table public.marketing_inventory_items
  drop constraint if exists marketing_inventory_items_box_of_not_self;
alter table public.marketing_inventory_items
  add constraint marketing_inventory_items_box_of_not_self
  check (box_of is null or box_of <> id);

create table if not exists public.marketing_box_assemblies (
  id              uuid primary key default gen_random_uuid(),
  anchor_id       uuid references public.marketing_inventory_items (id) on delete set null,
  box_item_id     uuid references public.marketing_inventory_items (id) on delete set null,
  anchor_name     text not null,
  -- Positive for boxes assembled, negative for boxes unboxed.
  quantity        integer not null check (quantity <> 0),
  -- [{ name, short }] — counts that couldn't cover what went into the boxes.
  short           jsonb not null default '[]'::jsonb,
  created_by      uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now()
);

create index if not exists marketing_box_assemblies_created_idx
  on public.marketing_box_assemblies (created_at desc);

-- Service-role only; the admin API gates on inventory-writer roles.
alter table public.marketing_box_assemblies enable row level security;

notify pgrst, 'reload schema';
