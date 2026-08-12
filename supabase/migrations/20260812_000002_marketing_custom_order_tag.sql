-- Custom orders are TAGGED, not detected.
--
-- 20260812_000001 flagged orders automatically — over a unit threshold, or past
-- stock on hand. That misfired: a single sample of an item we happen to be out
-- of is not a production run, and the queue filled with false "BULK" badges.
-- Whether an order needs a custom/manufactured run is a judgment call, so the
-- marketing admin or the inside sales rep working the order makes it by hand.
--
-- Renamed to say what it means, and every previously auto-set value is cleared —
-- they were all machine guesses, and the tag is now a human statement.

alter table public.marketing_orders
  rename column is_bulk to needs_custom_order;

alter index if exists marketing_orders_is_bulk_idx
  rename to marketing_orders_needs_custom_order_idx;

-- Who tagged it and when, matching the assigned_by/assigned_at pattern — the tag
-- drives a manufacturing request, so it carries a name.
alter table public.marketing_orders
  add column if not exists custom_order_tagged_by uuid references auth.users(id) on delete set null,
  add column if not exists custom_order_tagged_at timestamptz;

-- Drop the auto-flagged history. Anything that genuinely needs a custom order
-- gets re-tagged by hand from the queue.
update public.marketing_orders
   set needs_custom_order = false
 where needs_custom_order;
