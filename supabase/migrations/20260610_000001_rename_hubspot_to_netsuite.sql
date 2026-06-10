-- Rebrand the lead CRM-sync columns from HubSpot to NetSuite.
-- Renames preserve existing data; guards make this safe to re-run.

do $$
begin
  -- company / contact / deal external ids
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'hubspot_company_id')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'netsuite_company_id') then
    alter table public.leads rename column hubspot_company_id to netsuite_company_id;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'hubspot_contact_id')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'netsuite_contact_id') then
    alter table public.leads rename column hubspot_contact_id to netsuite_contact_id;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'hubspot_deal_id')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'netsuite_deal_id') then
    alter table public.leads rename column hubspot_deal_id to netsuite_deal_id;
  end if;

  -- sync status / error
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'hubspot_sync_status')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'netsuite_sync_status') then
    alter table public.leads rename column hubspot_sync_status to netsuite_sync_status;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'hubspot_sync_error')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'leads' and column_name = 'netsuite_sync_error') then
    alter table public.leads rename column hubspot_sync_error to netsuite_sync_error;
  end if;

  -- ensure the columns exist even on a fresh DB that never had the HubSpot ones
  alter table public.leads
    add column if not exists netsuite_company_id text,
    add column if not exists netsuite_contact_id text,
    add column if not exists netsuite_deal_id    text,
    add column if not exists netsuite_sync_status text default 'pending',
    add column if not exists netsuite_sync_error  text;

  -- rename the check constraint to match
  if exists (select 1 from pg_constraint where conname = 'leads_hubspot_sync_status_check') then
    alter table public.leads rename constraint leads_hubspot_sync_status_check to leads_netsuite_sync_status_check;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_netsuite_sync_status_check') then
    alter table public.leads
      add constraint leads_netsuite_sync_status_check
      check (netsuite_sync_status is null or netsuite_sync_status in ('pending', 'synced', 'failed'));
  end if;
end $$;
