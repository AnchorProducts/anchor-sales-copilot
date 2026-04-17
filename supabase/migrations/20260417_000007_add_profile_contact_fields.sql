-- Add contact fields to profiles for external user registration
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists company   text,
  add column if not exists phone     text;

-- Denormalise submitter info onto leads so internal viewers see it without a join
alter table public.leads
  add column if not exists submitter_name    text,
  add column if not exists submitter_company text,
  add column if not exists submitter_phone   text;
