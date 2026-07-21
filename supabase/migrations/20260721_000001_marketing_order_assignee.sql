-- Explicit owner for a marketing order: the internal sales rep an admin assigns
-- to work it. Distinct from the implicit territory routing (who *can* see it) and
-- from updated_by (who last touched it) — this is deliberate ownership set by an
-- admin, and drives the assignee's "assigned to me" view + assignment notice.
alter table public.marketing_orders
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz;

-- Filtering an assignee's own queue and scoping their visibility both hit this.
create index if not exists marketing_orders_assigned_to_idx
  on public.marketing_orders(assigned_to);
