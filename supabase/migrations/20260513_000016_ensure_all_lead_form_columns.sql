-- Backfill: ensure every column referenced by the /api/leads POST
-- insert exists on public.leads. Several earlier migrations were never
-- applied in production, so submissions keep failing with
-- "could not find the 'X' column of 'leads' in the schema table" —
-- once for project_timeline, again for submitter_company, and
-- possibly more. Every statement here is idempotent (add column if
-- not exists) so re-running this migration is safe.
alter table public.leads
  add column if not exists project_address          text,
  add column if not exists state                    text,
  add column if not exists country                  text,
  add column if not exists roof_type                text,
  add column if not exists roof_brand               text,
  add column if not exists needed_month             int,
  add column if not exists needed_year              int,
  add column if not exists meeting_request_type     text not null default 'none',
  add column if not exists solution_requests        jsonb not null default '[]'::jsonb,
  add column if not exists inside_sales_name        text,
  add column if not exists inside_sales_email       text,
  add column if not exists outside_sales_name       text,
  add column if not exists outside_sales_email      text,
  add column if not exists assignment_note          text,
  add column if not exists project_timeline         text,
  add column if not exists preferred_contact_method text,
  add column if not exists preferred_contact_value  text,
  add column if not exists submitter_name           text,
  add column if not exists submitter_company        text,
  add column if not exists submitter_phone          text,
  add column if not exists hubspot_sync_status      text default 'pending',
  add column if not exists hubspot_sync_error       text;

-- preferred_contact_method values are validated in the API; mirror in DB.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_preferred_contact_method_check'
  ) then
    alter table public.leads
      add constraint leads_preferred_contact_method_check
      check (
        preferred_contact_method is null
        or preferred_contact_method in ('email', 'phone_call', 'phone_text')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_meeting_request_type_check'
  ) then
    alter table public.leads
      add constraint leads_meeting_request_type_check
      check (meeting_request_type in ('none', 'video_call', 'site_visit'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_hubspot_sync_status_check'
  ) then
    alter table public.leads
      add constraint leads_hubspot_sync_status_check
      check (
        hubspot_sync_status is null
        or hubspot_sync_status in ('pending', 'synced', 'failed')
      );
  end if;
end $$;

-- Backfill country default the way the original migration intended.
update public.leads
set country = coalesce(nullif(country, ''), 'US')
where country is null or country = '';

alter table public.leads alter column country set default 'US';

create index if not exists leads_country_idx on public.leads (country);
create index if not exists leads_state_idx   on public.leads (state);
