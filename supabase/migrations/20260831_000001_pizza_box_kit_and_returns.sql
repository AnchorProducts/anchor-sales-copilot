-- Pizza boxes as an assembly — one kit per anchor series — and aisle pickups you
-- can bring back.
--
-- Two changes to the marketing-aisle flow, both driven by the same reality:
-- someone taking 25 anchor samples off the shelf is usually building 25 pizza
-- boxes, and whatever they don't use comes back.
--
-- 1. A pizza box is a KIT, not a single unit of packaging — and there is one kit
--    per anchor series.
--
--    20260715_000002 modelled packaging as two pools — one item tagged
--    packaging_role = 'pizza_box', one tagged 'overlay' — and a pickup either
--    wanted "a pizza box" or it didn't. Two things were wrong with that. A
--    finished pizza box is five physical pieces:
--
--      the anchor          — the sample itself, already its own inventory item
--      the box             — packaging_role 'pizza_box'
--      the plastic overlay — packaging_role 'overlay'
--      the under-anchor insert          — packaging_role 'insert_under'
--      the over-anchor insert, foldable — packaging_role 'insert_over'
--
--    And those five pieces are series-specific: the 2000 Series, 3000 Series and
--    5000 Series each have their own box, overlay and inserts. A single global
--    pool per role couldn't express that — today's only pools are the 2000
--    Series box and overlay, so every 3400 sample taken with a box has been
--    quietly drawing the 2000 Series count down.
--
--    So packaging_kit joins packaging_role, and the pair is what's unique: one
--    item per (kit, role). Each piece is an ordinary inventory item with its own
--    photo, count, low-stock threshold and restock — which is the point of
--    modelling them as items: every piece is something an admin already knows
--    how to add, edit and subtract, and the aisle QR decrements exactly the
--    pieces of exactly the kit the person says they need.
--
--    packaging_kit means two related things depending on the row:
--      • on a packaging piece (packaging_role set) — which kit this piece belongs to
--      • on a sample (packaging_role null)         — which kit its box comes from
--
--    The 5000 Series hasn't launched, so nothing is seeded for it. It shows in
--    the admin kit card with a Set up button and appears at the aisle as soon as
--    it has pieces.
--
--    marketing_item_grabs.components records which pieces went out with a line,
--    and packaging_kit which series they came from. The existing pizza_box /
--    plastic_overlay booleans stay in step so the pickup log and notifications
--    keep reading the way they always have.
--
-- 2. Pickups are returnable.
--
--    An aisle pickup used to be permanent (stock leaves, full stop). In practice
--    people take a stack for a job, use some, and put the rest back on the
--    shelf — and until now the count never learned about it, so the aisle drifted
--    low all by itself. quantity_returned tracks how much of a pickup has come
--    back; marketing_item_returns is the log of each drop-off, including which
--    kit pieces came back with it (an unused overlay returns, a folded-and-used
--    insert does not). Returning units puts them back in quantity_available.

-- ── Kits ─────────────────────────────────────────────────────────────────────
alter table public.marketing_inventory_items
  add column if not exists packaging_kit text;

alter table public.marketing_inventory_items
  drop constraint if exists marketing_inventory_items_packaging_kit_chk;
alter table public.marketing_inventory_items
  add constraint marketing_inventory_items_packaging_kit_chk
  check (packaging_kit is null or packaging_kit in ('2000', '3000', '5000'));

-- ── Packaging roles: two global pools become four pieces per kit ─────────────
alter table public.marketing_inventory_items
  drop constraint if exists marketing_inventory_items_packaging_role_chk;
alter table public.marketing_inventory_items
  add constraint marketing_inventory_items_packaging_role_chk
  check (
    packaging_role is null
    or packaging_role in ('pizza_box', 'overlay', 'insert_under', 'insert_over')
  );

-- Existing pools are the 2000 Series ones ("2000 Series - Pizza Box", "2000
-- Series Plastic Overlay"). Give every role-tagged row a kit before the pair
-- becomes required, so nothing is left unaddressable.
update public.marketing_inventory_items
set packaging_kit = '2000'
where packaging_role is not null and packaging_kit is null;

-- A piece with no kit can't be found by the aisle, so don't allow one.
alter table public.marketing_inventory_items
  drop constraint if exists marketing_inventory_items_packaging_kit_required;
alter table public.marketing_inventory_items
  add constraint marketing_inventory_items_packaging_kit_required
  check (packaging_role is null or packaging_kit is not null);

-- One item per (kit, role) — the 2000 box and the 3000 box are different rows,
-- but there is only ever one of each. Replaces the global one-per-role index.
drop index if exists public.marketing_inventory_items_packaging_role_uq;
create unique index if not exists marketing_inventory_items_packaging_kit_role_uq
  on public.marketing_inventory_items (packaging_kit, packaging_role)
  where packaging_role is not null;

-- Point each sample that's offered with a box at its series. The catalog names
-- anchors by model — 2400 … is a 2000 Series anchor, 3400 … a 3000 Series one —
-- so the leading digit is the series. This is a starting point, not a rule: the
-- kit is a field on the item and an admin can change it in the item editor.
update public.marketing_inventory_items
set packaging_kit = case left(trim(name), 1)
                      when '2' then '2000'
                      when '3' then '3000'
                      when '5' then '5000'
                    end
where pizza_box
  and packaging_role is null
  and packaging_kit is null
  and left(trim(name), 1) in ('2', '3', '5');

-- ── Seed the missing pieces, once ────────────────────────────────────────────
-- 2000 already has its box and overlay; 3000 has nothing yet. Counts start at 0
-- deliberately: nobody here knows the real on-hand number, and 0 reads as
-- "unset" rather than inventing one — an admin sets it from Marketing Inventory,
-- same as any other item (see the overlay pool's note in 20260812_000004).
-- The 5000 Series is not seeded: it hasn't launched.
insert into public.marketing_inventory_items
  (name, description, category, quantity_available, packaging_role, packaging_kit)
select v.name, v.description, 'samples', 0, v.role, v.kit
from (
  values
    ('2000', 'pizza_box',    '2000 Series — Pizza Box',
     'The box itself. One per assembled 2000 Series pizza box.'),
    ('2000', 'overlay',      '2000 Series — Plastic Overlay',
     'Clear plastic overlay. Shipped on its own or paired with a 2000 Series anchor — both draw from this one count.'),
    ('2000', 'insert_under', '2000 Series — Under-Anchor Insert',
     'The insert that sits under the anchor inside a 2000 Series pizza box.'),
    ('2000', 'insert_over',  '2000 Series — Over-Anchor Insert (foldable)',
     'The foldable insert that folds over the anchor inside a 2000 Series pizza box.'),
    ('3000', 'pizza_box',    '3000 Series — Pizza Box',
     'The box itself. One per assembled 3000 Series pizza box.'),
    ('3000', 'overlay',      '3000 Series — Plastic Overlay',
     'Clear plastic overlay. Shipped on its own or paired with a 3000 Series anchor — both draw from this one count.'),
    ('3000', 'insert_under', '3000 Series — Under-Anchor Insert',
     'The insert that sits under the anchor inside a 3000 Series pizza box.'),
    ('3000', 'insert_over',  '3000 Series — Over-Anchor Insert (foldable)',
     'The foldable insert that folds over the anchor inside a 3000 Series pizza box.')
) as v(kit, role, name, description)
where not exists (
  select 1 from public.marketing_inventory_items i
  where i.packaging_kit = v.kit and i.packaging_role = v.role
);

-- ── Pickups: which kit pieces went out, and how much has come back ───────────
alter table public.marketing_item_grabs
  add column if not exists components text[] not null default '{}'::text[],
  add column if not exists packaging_kit text,
  add column if not exists quantity_returned integer not null default 0;

alter table public.marketing_item_grabs
  drop constraint if exists marketing_item_grabs_returned_range;
-- Can't return more than was taken, and can't un-return into negatives.
alter table public.marketing_item_grabs
  add constraint marketing_item_grabs_returned_range
  check (quantity_returned >= 0 and quantity_returned <= quantity);

-- Backfill components from the booleans so old pickups describe themselves the
-- same way new ones do (and so a return of an old pickup can offer the right
-- pieces back). They predate kits, and the only pools that existed were the
-- 2000 Series ones, so that's the kit they came from.
update public.marketing_item_grabs
set components =
      (case when plastic_overlay then array['overlay'] else array[]::text[] end)
      || (case when pizza_box then array['pizza_box'] else array[]::text[] end),
    packaging_kit = coalesce(packaging_kit, '2000')
where components = '{}'::text[] and (pizza_box or plastic_overlay);

-- Outstanding pickups are what the public return page looks up, by email.
create index if not exists marketing_item_grabs_email_idx
  on public.marketing_item_grabs (lower(grabbed_by_email), created_at desc);

-- ── Return log ───────────────────────────────────────────────────────────────
-- One row per drop-off. grab_id is nulled rather than cascaded if the pickup is
-- ever purged: the return still happened and the count still moved.
create table if not exists public.marketing_item_returns (
  id                uuid primary key default gen_random_uuid(),
  grab_id           uuid references public.marketing_item_grabs (id) on delete set null,
  item_id           uuid references public.marketing_inventory_items (id) on delete set null,
  item_name         text not null,
  quantity          integer not null check (quantity > 0),
  components        text[] not null default '{}'::text[],
  packaging_kit     text,
  returned_by_name  text not null,
  returned_by_email text not null,
  ip                text,
  created_at        timestamptz not null default now()
);

create index if not exists marketing_item_returns_grab_idx
  on public.marketing_item_returns (grab_id);
create index if not exists marketing_item_returns_created_idx
  on public.marketing_item_returns (created_at desc);

-- RLS: service-role only, matching marketing_item_grabs. The public return
-- endpoint validates the aisle token first and writes through the service role.
alter table public.marketing_item_returns enable row level security;

-- ── Orders: overlays split by kit ────────────────────────────────────────────
-- marketing_orders.overlay_units (20260812_000004) is the order's total overlay
-- demand across paired and standalone. With one overlay per series that total is
-- still the right headline, but it no longer says WHICH count to pull from, and
-- the order's items are free text — so the fulfiller had nothing to work from.
-- overlay_kits records the split ({"2000": 12, "3000": 4}), computed server-side
-- on submit, and pre-fills one inventory-used row per kit at fulfillment.
alter table public.marketing_orders
  add column if not exists overlay_kits jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
