alter table public.leads
  add column if not exists inside_sales_name text,
  add column if not exists inside_sales_email text,
  add column if not exists outside_sales_name text,
  add column if not exists assignment_note text;

create index if not exists leads_inside_sales_email_idx on public.leads (inside_sales_email);
