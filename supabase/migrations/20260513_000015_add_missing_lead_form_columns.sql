-- Fill in lead columns referenced by /api/leads (POST) but never added
-- by an earlier migration. Without these, external rep submissions fail
-- with "could not find the 'X' column of 'leads' in the schema table".
alter table public.leads
  add column if not exists project_timeline         text,
  add column if not exists preferred_contact_method text,
  add column if not exists preferred_contact_value  text,
  add column if not exists outside_sales_email      text;

-- preferred_contact_method is constrained at the application layer to
-- {email, phone_call, phone_text}; mirror that in the DB so bad rows
-- can't sneak in from other paths.
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
