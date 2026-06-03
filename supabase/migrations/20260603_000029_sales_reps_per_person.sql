-- Convert sales_reps from a bundled (one outside + one optional inside) row
-- model into a per-person model, so an admin can assign MULTIPLE internal and
-- external salespeople to each state.
--
-- Old shape: outside_sales_name/email + inside_sales_name/email + states[]
-- New shape: kind ('internal'|'external') + name + email + teams_link + states[]
--
-- Each existing row becomes one EXTERNAL entry; rows that also carried inside
-- sales info spawn a second INTERNAL entry covering the same states.

-- 1) New per-person columns (teams_link + states already exist).
alter table public.sales_reps
  add column if not exists kind  text,
  add column if not exists name  text,
  add column if not exists email text,
  -- Optional ZIP sub-territory: 3-digit ZIP prefixes this rep covers WITHIN a
  -- shared state. Empty = the rep covers the whole state (the default). Used to
  -- split overlapping reps, e.g. TX -> Daymon (Houston/Gulf) vs Robert (rest).
  add column if not exists zip_prefixes text[] not null default '{}';

-- 2) Backfill: the existing row IS the external (outside) salesperson.
update public.sales_reps
set kind  = 'external',
    name  = outside_sales_name,
    email = outside_sales_email
where kind is null;

-- 3) Split inside-sales contacts into their own internal entries covering the
--    same states. The INSERT's SELECT sees a pre-insert snapshot, so the new
--    internal rows are not re-processed. Skip rows with no inside contact.
insert into public.sales_reps (kind, name, email, teams_link, states, created_at, updated_at)
select 'internal',
       inside_sales_name,
       inside_sales_email,
       null,
       states,
       now(),
       now()
from public.sales_reps
where kind = 'external'
  and coalesce(nullif(btrim(inside_sales_name), ''), nullif(btrim(inside_sales_email), '')) is not null;

-- 4) Enforce the new shape going forward.
update public.sales_reps set kind = 'external' where kind is null;
alter table public.sales_reps
  alter column kind set default 'external',
  alter column kind set not null;

alter table public.sales_reps
  drop constraint if exists sales_reps_kind_check;
alter table public.sales_reps
  add constraint sales_reps_kind_check check (kind in ('internal', 'external'));

-- 5) Drop the old bundled columns and their index.
drop index if exists public.sales_reps_inside_sales_email_idx;
alter table public.sales_reps
  drop column if exists outside_sales_name,
  drop column if exists outside_sales_email,
  drop column if exists inside_sales_name,
  drop column if exists inside_sales_email;

-- 6) Lookup indexes: by email (user->states) and by state membership.
create index if not exists sales_reps_email_idx on public.sales_reps (email);
create index if not exists sales_reps_states_gin_idx on public.sales_reps using gin (states);
