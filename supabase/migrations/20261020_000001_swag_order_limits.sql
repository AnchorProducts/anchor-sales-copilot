-- Swag order limits + marketing approval.
--
-- Marketing sets a most-per-order on a swag item. A rep can still ask for more,
-- but an order that goes over any item's limit doesn't go to inside sales: it
-- waits for a marketing admin to approve it. Approved, it's assigned and routed
-- exactly like any other order. Denied, it's cancelled and the rep is told why.
--
-- max_order_qty: null (or 0) means no limit.
--
-- approval_status: null for every order that never needed approval, which is
-- every order before this migration and every order under its limits.
--   pending  — over a limit, waiting on a marketing admin
--   approved — a marketing admin let it through
--   denied   — a marketing admin turned it down (the order is also cancelled)
-- approval_reason is what tripped it, in words ("40 × Hat — limit 25").

alter table public.marketing_inventory_items
  add column if not exists max_order_qty integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_inventory_items_max_order_qty_check'
  ) then
    alter table public.marketing_inventory_items
      add constraint marketing_inventory_items_max_order_qty_check
      check (max_order_qty is null or max_order_qty >= 0);
  end if;
end $$;

alter table public.marketing_orders
  add column if not exists approval_status text,
  add column if not exists approval_reason text,
  add column if not exists approval_note text,
  add column if not exists approval_by uuid references auth.users (id) on delete set null,
  add column if not exists approval_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_orders_approval_status_check'
  ) then
    alter table public.marketing_orders
      add constraint marketing_orders_approval_status_check
      check (approval_status is null or approval_status in ('pending', 'approved', 'denied'));
  end if;
end $$;

create index if not exists marketing_orders_approval_pending_idx
  on public.marketing_orders (created_at desc)
  where approval_status = 'pending';

notify pgrst, 'reload schema';
