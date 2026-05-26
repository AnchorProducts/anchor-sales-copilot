-- Consultant directory + contact linkage.
--
-- 1. consultant_contacts mirrors manufacturer_contacts so admins can manage the
--    roof-consultant roster the same way they manage OEM reps.
-- 2. profile_manufacturers is a many-to-many join (consultants attach to
--    multiple OEMs). OEM reps stay single-OEM via profiles.manufacturer_contact_id.
-- 3. profiles gains FKs to both contact tables so non-email signup paths can
--    still be tagged. The manufacturer_contact_id is backfilled once from the
--    existing email match.

-- ── 1. consultant_contacts ────────────────────────────────────────────────
create table if not exists public.consultant_contacts (
  id           uuid primary key default gen_random_uuid(),
  company      text not null,
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

create unique index if not exists consultant_contacts_company_email_uq
  on public.consultant_contacts (company, lower(email))
  where email is not null;

create index if not exists consultant_contacts_email_idx
  on public.consultant_contacts (lower(email))
  where email is not null;

create index if not exists consultant_contacts_company_idx
  on public.consultant_contacts (company);

alter table public.consultant_contacts enable row level security;

create policy "Admins can read consultant contacts"
  on public.consultant_contacts for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can write consultant contacts"
  on public.consultant_contacts for all
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

-- ── 2. profile_manufacturers (consultant ↔ OEM, many-to-many by name) ────
-- Manufacturer is stored as text to match manufacturer_contacts.manufacturer
-- and survive even when no contact rows exist for an OEM yet.
create table if not exists public.profile_manufacturers (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  manufacturer text not null,
  created_at   timestamptz not null default now(),
  primary key (profile_id, manufacturer)
);

create index if not exists profile_manufacturers_manufacturer_idx
  on public.profile_manufacturers (manufacturer);

alter table public.profile_manufacturers enable row level security;

create policy "Users can read own manufacturer associations"
  on public.profile_manufacturers for select
  using (auth.uid() = profile_id);

create policy "Users can insert own manufacturer associations"
  on public.profile_manufacturers for insert
  with check (auth.uid() = profile_id);

create policy "Users can delete own manufacturer associations"
  on public.profile_manufacturers for delete
  using (auth.uid() = profile_id);

create policy "Admins can read all manufacturer associations"
  on public.profile_manufacturers for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can manage all manufacturer associations"
  on public.profile_manufacturers for all
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

-- ── 3. Profile FKs to contact rows ───────────────────────────────────────
alter table public.profiles
  add column if not exists manufacturer_contact_id uuid references public.manufacturer_contacts(id) on delete set null,
  add column if not exists consultant_contact_id   uuid references public.consultant_contacts(id)   on delete set null;

create index if not exists profiles_manufacturer_contact_id_idx
  on public.profiles (manufacturer_contact_id)
  where manufacturer_contact_id is not null;

create index if not exists profiles_consultant_contact_id_idx
  on public.profiles (consultant_contact_id)
  where consultant_contact_id is not null;

-- ── 4. One-time backfill: profiles.manufacturer_contact_id from email ────
-- A single email can appear under multiple manufacturer_contacts rows (the
-- same person at multiple OEMs). DISTINCT ON picks one match per email
-- deterministically, ordered by manufacturer name then created_at.
update public.profiles p
set manufacturer_contact_id = matched.id
from (
  select distinct on (lower(email)) id, email
  from public.manufacturer_contacts
  where email is not null
  order by lower(email), manufacturer asc, created_at asc
) matched
where p.manufacturer_contact_id is null
  and p.email is not null
  and lower(p.email) = lower(matched.email);
