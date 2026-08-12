-- Drop the manufacturing-request records added in 20260812_000001.
--
-- They were a workflow the marketing team doesn't want: a second thing to file,
-- track, and move through statuses. The custom-order tag on marketing_orders is
-- the whole feature, and it does two jobs on its own:
--
--   1. Inventory stays unchanged. A custom order is ordered in specially, not
--      pulled off the shelf, so fulfilling it must not decrement stock.
--   2. The outside rep is told. Tagging the order notifies the rep who placed it
--      that inside sales is custom-ordering the samples, so it takes longer than
--      a stock order.
--
-- `needs_custom_order`, `custom_order_tagged_by` and `custom_order_tagged_at`
-- stay. Only the separate request records go.

drop table if exists public.marketing_manufacturing_requests;
