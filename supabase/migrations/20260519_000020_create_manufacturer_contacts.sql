-- Manufacturer rep / contact list. Imported from a CEO-supplied spreadsheet
-- and joined against profiles by email so admins can see which contacts have
-- signed up and what they're doing in the app.
create table if not exists public.manufacturer_contacts (
  id           uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  first_name   text,
  last_name    text,
  full_name    text,
  email        text,
  phone        text,
  cell         text,
  title        text,
  territory    text,
  region       text,
  raw          jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Unique on (manufacturer, lower(email)) when email is present so re-runs
-- of the importer upsert cleanly. Email-less rows can have duplicates;
-- those are edge cases the admin can clean up manually.
create unique index if not exists manufacturer_contacts_mfr_email_uq
  on public.manufacturer_contacts (manufacturer, lower(email))
  where email is not null;

create index if not exists manufacturer_contacts_email_idx
  on public.manufacturer_contacts (lower(email))
  where email is not null;

create index if not exists manufacturer_contacts_manufacturer_idx
  on public.manufacturer_contacts (manufacturer);

alter table public.manufacturer_contacts enable row level security;

-- Admins only. Server-side routes use the service role which bypasses RLS,
-- so the policy just locks out everyone else who would try via supabase-js.
create policy "Admins can read manufacturer contacts"
  on public.manufacturer_contacts for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can write manufacturer contacts"
  on public.manufacturer_contacts for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
