-- New commission-claim form fields: Job Name, Roof Type, and an explicit
-- "additional salespeople" free-text field for the multi-salesperson option.
alter table public.commission_claims
  add column if not exists job_name              text,
  add column if not exists roof_type             text,
  add column if not exists additional_salespeople text;
