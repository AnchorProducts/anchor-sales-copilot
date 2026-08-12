-- Overlays as real, countable stock — orderable on their own and paired with an
-- anchor sample, both drawing down one shared count.
--
-- 20260715_000002 built the mechanism: an item can OFFER a plastic overlay
-- (marketing_inventory_items.plastic_overlay), and one item IS the overlay stock
-- pool (packaging_role = 'overlay'). But no pool item was ever created. With no
-- pool row, decrementPool() in the aisle-grab route returns immediately, so
-- every overlay taken at the aisle has been silently untracked — 14 sample items
-- offer one today and none of them move a count.
--
-- This seeds the missing pool item, which alone fixes the aisle-grab leak, and
-- adds the order-side counter so marketing orders can carry overlays too:
--
--   standalone — the pool item is picked straight from the order catalog, which
--                is how inside sales ships overlays and nothing else
--   paired     — an anchor sample that offers an overlay is ordered "+ overlay"
--
-- Both resolve to the SAME row, so the two paths can never drift apart into
-- separate counts. marketing_orders.overlay_units is the order's total across
-- both, computed server-side on submit and used to pre-fill the inventory-used
-- picker when the order is fulfilled (stock still moves at fulfillment, exactly
-- as it does for every other item on the order).

-- The order's total overlay demand: paired + standalone, resolved on submit.
alter table public.marketing_orders
  add column if not exists overlay_units integer not null default 0
  constraint marketing_orders_overlay_units_nonneg check (overlay_units >= 0);

-- Seed the pool item, but never a second one — the partial unique index on
-- packaging_role allows exactly one, and an admin may have created it already.
-- Quantity starts at 0 deliberately: nobody here knows the real on-hand count,
-- and 0 reads as "unset" rather than inventing a number. An admin sets it from
-- Marketing Inventory, same as any other item.
insert into public.marketing_inventory_items
  (name, description, category, quantity_available, packaging_role)
select
  'Plastic Overlay',
  'Clear plastic overlay. Shipped on its own or paired with an anchor sample — both draw from this one count.',
  'samples',
  0,
  'overlay'
where not exists (
  select 1 from public.marketing_inventory_items where packaging_role = 'overlay'
);

notify pgrst, 'reload schema';
