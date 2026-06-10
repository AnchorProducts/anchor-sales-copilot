-- Per-rep NetSuite sync preference. Internal reps (admin / anchor_rep) choose
-- whether their leads sync to NetSuite automatically or only when they press the
-- manual "Sync to NetSuite" button. Defaults to 'manual' so nothing auto-syncs
-- until a rep opts in. The automatic trigger wiring is a follow-up — this column
-- stores the preference and gates the UI today.
alter table public.profiles
  add column if not exists netsuite_sync_mode text not null default 'manual'
    check (netsuite_sync_mode in ('manual', 'automatic'));
