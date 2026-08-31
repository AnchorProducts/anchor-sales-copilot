-- "Needed by is tomorrow" reminder for the person working the order.
--
-- An order carries a needed-by date, and the person it's assigned to is the one
-- who has to move it before that date arrives. Nothing watched the clock: an
-- order sat in Processing until someone happened to scroll past it, and the
-- first anyone heard about a missed date was the rep asking where their samples
-- were.
--
-- A daily cron (/api/marketing-orders/reminders) finds the orders coming due and
-- notifies whoever is assigned. This column is what stops it repeating itself:
-- the run stamps each order it reminded on, and skips anything already stamped.
-- Null means "never reminded", which is also what every existing order starts as.
--
-- Deliberately a timestamp rather than a boolean — knowing WHEN the nudge went
-- out is the difference between "they were told and didn't act" and "the job
-- never ran", which is the first thing anyone asks when a date is missed.
alter table public.marketing_orders
  add column if not exists needed_by_reminder_at timestamptz;

-- The cron's lookup: still-open orders, by date, that haven't been reminded.
create index if not exists marketing_orders_due_reminder_idx
  on public.marketing_orders (needed_by)
  where needed_by_reminder_at is null;

notify pgrst, 'reload schema';
