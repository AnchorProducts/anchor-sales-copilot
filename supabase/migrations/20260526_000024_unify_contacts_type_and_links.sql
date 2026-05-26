-- Unify consultants into the manufacturer_contacts list instead of a separate
-- table. A contact is either a manufacturer rep (works for one OEM, kept in the
-- `manufacturer` column) or an independent consultant (own `company`, linked to
-- many OEMs via manufacturer_contact_manufacturers). This supersedes the
-- standalone consultant_contacts directory from migration 000023.

-- ── 1. Tag + own-company on the unified contacts table ───────────────────────
-- contact_type is free-text (manufacturer_rep / consultant / contractor / …)
-- so new categories don't need a migration; the app validates the value.
alter table public.manufacturer_contacts
  add column if not exists contact_type text not null default 'manufacturer_rep',
  add column if not exists company text;

-- Drop the old restrictive check if a prior run added it.
alter table public.manufacturer_contacts
  drop constraint if exists manufacturer_contacts_contact_type_chk;

-- Consultants have no single OEM, so `manufacturer` is no longer required.
-- Existing rep rows keep their value; the unique index tolerates nulls.
alter table public.manufacturer_contacts
  alter column manufacturer drop not null;

create index if not exists manufacturer_contacts_contact_type_idx
  on public.manufacturer_contacts (contact_type);

create index if not exists manufacturer_contacts_company_idx
  on public.manufacturer_contacts (company)
  where company is not null;

-- ── 2. Consultant ↔ manufacturer links (many-to-many by manufacturer name) ───
-- Stored as text to match manufacturer_contacts.manufacturer and survive OEMs
-- that have no contact rows yet.
create table if not exists public.manufacturer_contact_manufacturers (
  contact_id   uuid not null references public.manufacturer_contacts(id) on delete cascade,
  manufacturer text not null,
  created_at   timestamptz not null default now(),
  primary key (contact_id, manufacturer)
);

create index if not exists mcm_manufacturer_idx
  on public.manufacturer_contact_manufacturers (manufacturer);

alter table public.manufacturer_contact_manufacturers enable row level security;

-- Drop-then-create so the migration is safe to re-run after a partial apply.
drop policy if exists "Admins can read contact manufacturer links" on public.manufacturer_contact_manufacturers;
create policy "Admins can read contact manufacturer links"
  on public.manufacturer_contact_manufacturers for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins can write contact manufacturer links" on public.manufacturer_contact_manufacturers;
create policy "Admins can write contact manufacturer links"
  on public.manufacturer_contact_manufacturers for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ── 3. Retire the standalone consultant directory (migration 000023) ─────────
alter table public.profiles drop column if exists consultant_contact_id;
drop table if exists public.consultant_contacts;
