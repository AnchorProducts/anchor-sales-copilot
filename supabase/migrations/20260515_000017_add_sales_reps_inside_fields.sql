-- Add optional inside-sales fields to the regional sales-rep config so
-- REC submissions can be routed to the internal sales team by state.
-- When inside_sales_email is null, routing falls back to outside_sales_email.
alter table public.sales_reps
  add column if not exists inside_sales_name  text,
  add column if not exists inside_sales_email text;

create index if not exists sales_reps_inside_sales_email_idx
  on public.sales_reps (inside_sales_email);
