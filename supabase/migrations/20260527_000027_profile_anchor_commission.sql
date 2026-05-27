-- "Anchor commission" tag on app-user profiles, so the flag can be set on every
-- user (not just OEM reps/consultants, which carry it on manufacturer_contacts).
alter table public.profiles
  add column if not exists anchor_commission boolean not null default false;
