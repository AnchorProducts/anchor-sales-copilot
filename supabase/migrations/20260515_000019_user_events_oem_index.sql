-- Phase 1 analytics aggregation prep: index the OEM key in event metadata
-- so later "by-OEM" rollups (per-rep, per-state, per-time-window) stay fast.
-- The user_events.metadata jsonb already carries `oem`; this index just
-- accelerates filtering on it.
create index if not exists user_events_metadata_oem_idx
  on public.user_events ((metadata->>'oem'));

-- Same idea for the state field — useful for inside-sales rollups.
create index if not exists user_events_metadata_state_idx
  on public.user_events ((metadata->>'state'));
