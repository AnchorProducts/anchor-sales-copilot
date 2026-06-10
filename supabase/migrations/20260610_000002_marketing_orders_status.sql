-- Constrain marketing_orders.status to the supported workflow so the rep
-- tracker and the admin status editor stay in sync with the DB.
--   new → processing → shipped → fulfilled  (+ cancelled, a terminal state)

do $$
begin
  -- Normalize any legacy values before adding the constraint.
  update public.marketing_orders
    set status = 'new'
    where status is null
       or status not in ('new', 'processing', 'shipped', 'fulfilled', 'cancelled');

  if not exists (
    select 1 from pg_constraint where conname = 'marketing_orders_status_check'
  ) then
    alter table public.marketing_orders
      add constraint marketing_orders_status_check
      check (status in ('new', 'processing', 'shipped', 'fulfilled', 'cancelled'));
  end if;
end $$;
