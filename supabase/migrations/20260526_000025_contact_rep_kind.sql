-- Sales vs Tech sub-type for OEM reps. Null for non-reps (consultants,
-- contractors) and for reps not yet classified. Drives the CEO's per-OEM
-- matrix (OEM Sales Reps vs OEM Tech Reps columns).
alter table public.manufacturer_contacts
  add column if not exists rep_kind text;

alter table public.manufacturer_contacts
  drop constraint if exists manufacturer_contacts_rep_kind_chk;
alter table public.manufacturer_contacts
  add constraint manufacturer_contacts_rep_kind_chk
  check (rep_kind is null or rep_kind in ('sales', 'tech'));
