-- Add an optional "needed by" target date to marketing orders, so reps can flag
-- a deadline (e.g. a trade show) and the marketing team can prioritize.
-- Separate migration (idempotent) so it applies cleanly whether or not the
-- initial marketing_orders migration has already run.

alter table public.marketing_orders
  add column if not exists needed_by date;
