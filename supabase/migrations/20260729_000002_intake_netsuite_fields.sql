-- Project Intakes gain the same NetSuite push fields consults already have.
--
-- The push itself is not commissioned yet — there are no NETSUITE_* credentials,
-- so every NetSuite surface renders as a greyed "Coming soon" panel (see
-- src/lib/netsuite/config.ts). These columns exist so that panel can show real
-- state the moment the integration is wired, rather than needing a second
-- migration at the point someone is already mid-integration.
--
-- Mirrors public.leads exactly, including the sync-status vocabulary, so one
-- shared component can render both.

alter table public.fm_intake_submissions
  add column if not exists netsuite_company_id text,
  add column if not exists netsuite_contact_id text,
  add column if not exists netsuite_deal_id    text,
  add column if not exists netsuite_sync_status text default 'pending',
  add column if not exists netsuite_sync_error  text;

-- Same three values leads uses. Guarded so a re-run can't fail on the constraint
-- already being there.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'fm_intake_submissions_netsuite_sync_status_check'
  ) then
    alter table public.fm_intake_submissions
      add constraint fm_intake_submissions_netsuite_sync_status_check
      check (netsuite_sync_status in ('pending', 'synced', 'failed'));
  end if;
end $$;
