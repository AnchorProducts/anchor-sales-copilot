alter table public.leads
  add column if not exists hubspot_sync_status text default 'pending' check (hubspot_sync_status in ('pending','synced','failed')),
  add column if not exists hubspot_sync_error text;
