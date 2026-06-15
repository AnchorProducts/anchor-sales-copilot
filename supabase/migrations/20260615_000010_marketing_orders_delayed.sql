-- Add a "delayed" status so admins can flag an order that's held up, along with
-- a projected ship date and a note explaining the delay. "delayed" is an
-- off-path state (like "cancelled"): the tracker shows it as a banner, not a
-- progress step. Who set it / when is already tracked via updated_by/updated_at.
alter table public.marketing_orders
  add column if not exists projected_ship_date date,
  add column if not exists delay_notes text;

do $$
begin
  -- Widen the status check constraint to include 'delayed'.
  if exists (
    select 1 from pg_constraint where conname = 'marketing_orders_status_check'
  ) then
    alter table public.marketing_orders
      drop constraint marketing_orders_status_check;
  end if;

  alter table public.marketing_orders
    add constraint marketing_orders_status_check
    check (status in ('new', 'processing', 'shipped', 'fulfilled', 'delayed', 'cancelled'));
end $$;
