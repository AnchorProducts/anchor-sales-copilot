alter table public.leads
  add column if not exists project_address text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists roof_type text,
  add column if not exists roof_brand text,
  add column if not exists needed_month int,
  add column if not exists needed_year int,
  add column if not exists meeting_request_type text not null default 'none',
  add column if not exists solution_requests jsonb not null default '[]'::jsonb;

update public.leads
set country = coalesce(nullif(country, ''), 'US')
where country is null or country = '';

alter table public.leads
  alter column country set default 'US';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_meeting_request_type_check'
  ) then
    alter table public.leads
      add constraint leads_meeting_request_type_check
      check (meeting_request_type in ('none', 'video_call', 'site_visit'));
  end if;
end $$;

create index if not exists leads_country_idx on public.leads (country);
create index if not exists leads_state_idx on public.leads (state);
