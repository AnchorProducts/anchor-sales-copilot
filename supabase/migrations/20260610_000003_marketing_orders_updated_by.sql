-- Track who last changed a marketing order's status. Surfaced to the
-- submitting rep so they know which admin to contact for more information.
alter table public.marketing_orders
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
