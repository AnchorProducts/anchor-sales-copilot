-- Let a user cover MULTIPLE states, so they can be paired with more than one
-- internal/external sales rep. Replaces the single `service_state` text column
-- with a `service_states` array. `service_state` is kept (synced to the first
-- entry) for backward compatibility with single-state callers.
alter table public.profiles
  add column if not exists service_states text[] not null default '{}';

-- Backfill the array from any existing single state.
update public.profiles
  set service_states = array[service_state]
  where service_state is not null
    and btrim(service_state) <> ''
    and (service_states is null or service_states = '{}');
