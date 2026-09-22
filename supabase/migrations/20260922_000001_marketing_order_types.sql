-- Two kinds of marketing order.
--
-- 1. customer — what every order has been so far: samples, pizza boxes,
--    printables and swag pulled from the marketing inventory we have on hand.
--
-- 2. oem — a pizza box made for an OEM partner, custom from top to bottom.
--    The box, its inserts, the overlay and the printables are all printed for
--    that partner, and the anchors are printed separately. None of it comes off
--    the shelf, so an OEM order is also always tagged needs_custom_order: that is
--    what already keeps fulfillment from decrementing marketing stock.
--
-- oem_spec holds the request as the rep filled it in (partner, box count,
-- per-piece print notes, printables, anchors, artwork files, proof). The order's
-- `items` text still carries the whole thing in words, so every existing view,
-- email and printout reads an OEM order without knowing about this column.

alter table public.marketing_orders
  add column if not exists order_type text not null default 'customer',
  add column if not exists oem_spec jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_orders_order_type_check'
  ) then
    alter table public.marketing_orders
      add constraint marketing_orders_order_type_check
      check (order_type in ('customer', 'oem'));
  end if;
end $$;

create index if not exists marketing_orders_order_type_idx
  on public.marketing_orders (order_type)
  where order_type <> 'customer';

notify pgrst, 'reload schema';
