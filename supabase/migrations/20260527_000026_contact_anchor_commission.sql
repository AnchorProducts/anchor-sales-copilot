-- "Anchor commission" tag for OEM reps & consultants. Marks a contact as being
-- on an Anchor commission arrangement; consumed by other parts of the app.
alter table public.manufacturer_contacts
  add column if not exists anchor_commission boolean not null default false;
