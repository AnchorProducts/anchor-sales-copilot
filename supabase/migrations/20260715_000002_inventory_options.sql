-- Inventory item options: checkout eligibility + packaging choices.
--
-- 1. checkout_enabled — admins opt an item IN to the tradeshow checkout flow.
--    Defaults false: most stock (consumable samples) isn't a returnable loan, so
--    the Check-out action only appears on items an admin explicitly enables.
--
-- 2. pizza_box / plastic_overlay (on items) — whether that sample is OFFERED
--    with a pizza box and/or a plastic overlay. When set, the public pickup page
--    lets the person choose the box, the overlay, or both.
--
-- 3. packaging_role — tags the two inventory items that ARE the packaging stock
--    pools ('pizza_box' or 'overlay'). Choosing a packaging option on a pickup
--    decrements the matching pool, so boxes/overlays are tracked, restocked, and
--    low-stock-alerted like any other item. Normal items leave this null.
--
-- 4. marketing_item_grabs.pizza_box / plastic_overlay — what the person chose
--    for that line, kept in the pickup log + notification.

alter table public.marketing_inventory_items
  add column if not exists checkout_enabled boolean not null default false,
  add column if not exists pizza_box        boolean not null default false,
  add column if not exists plastic_overlay  boolean not null default false,
  add column if not exists packaging_role   text;

-- Only one of each packaging pool should exist; enforce the allowed values and a
-- single row per role (partial unique index ignores the many null-role items).
alter table public.marketing_inventory_items
  drop constraint if exists marketing_inventory_items_packaging_role_chk;
alter table public.marketing_inventory_items
  add constraint marketing_inventory_items_packaging_role_chk
  check (packaging_role is null or packaging_role in ('pizza_box', 'overlay'));

create unique index if not exists marketing_inventory_items_packaging_role_uq
  on public.marketing_inventory_items (packaging_role)
  where packaging_role is not null;

alter table public.marketing_item_grabs
  add column if not exists pizza_box       boolean not null default false,
  add column if not exists plastic_overlay boolean not null default false;

-- Expose the new columns to the REST layer immediately.
notify pgrst, 'reload schema';
