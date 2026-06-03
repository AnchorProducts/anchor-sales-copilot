-- Seed the per-person sales_reps roster from the "Find Your Local Anchor
-- Representative" territory maps (2026-06-03).
--
-- Coverage (external / outside reps) and their paired internal / inside reps:
--   Justin Smith   (West + Upper Midwest)  -> inside: Crystal Serrano
--   Robert Alvarez (South Central, incl TX)-> inside: Nora Menendez
--   Harley Coleman (Southeast)             -> inside: Katerina Little
--   Brandon Reynolds (Mid-Atlantic/OH Vly) -> inside: Crystal Serrano
--   George Varney  (Northeast)             -> inside: Katerina Little
--   Daymon Vargas  (Greater Houston & TX Gulf Coast) -> inside: Merry Garcia
--
-- TEXAS is intentionally dual-covered: at state granularity TX maps to BOTH
-- Robert (rest of TX) and Daymon (Houston/Gulf). The multi-rep model surfaces
-- both, and REC submissions notify both inside reps (Nora + Merry).
--
-- MD/DE/DC were not on any source map; assigned to Brandon Reynolds (nearest
-- Mid-Atlantic territory) per admin decision. Scott Carpenter (OEM director,
-- no map territory) is intentionally NOT seeded here.

-- Safety net: ensure the ZIP sub-territory column exists, in case migration
-- 029 was applied before this column was added to it. Idempotent.
alter table public.sales_reps
  add column if not exists zip_prefixes text[] not null default '{}';

-- Reconcile the 11 known people: clear any prior rows for these emails so the
-- seed is the single source of truth, then insert canonical coverage. Other
-- pre-existing rows are left untouched.
delete from public.sales_reps
where lower(email) in (
  'george.varney@anchorp.com',
  'robert@anchorp.com',
  'justin@anchorp.com',
  'harley.coleman@anchorp.com',
  'brandon.reynolds@anchorp.com',
  'daymon@anchorp.com',
  'c.serrano@anchorp.com',
  'nora.mendez@anchorp.com',
  'katerina.little@anchorp.com',
  'merry.garcia@anchorp.com'
);

-- External (outside) reps.
insert into public.sales_reps (kind, name, email, teams_link, states) values
  ('external', 'George Varney', 'george.varney@anchorp.com',
   'https://teams.microsoft.com/l/call/0/0?users=george.varney@anchorp.com',
   array['ME','NH','VT','MA','RI','CT','NY','NJ']),

  ('external', 'Robert J. Alvarez', 'robert@anchorp.com',
   'https://teams.microsoft.com/l/call/0/0?users=robert@anchorp.com',
   array['TX','OK','NM','CO','KS','MO','AR','LA']),

  ('external', 'Justin Smith', 'justin@anchorp.com',
   'https://teams.microsoft.com/l/call/0/0?users=justin@anchorp.com',
   array['WA','OR','CA','NV','AZ','ID','UT','MT','WY','ND','SD','NE','MN','IA','WI','IL','IN','MI','AK','HI']),

  ('external', 'Harley Coleman', 'harley.coleman@anchorp.com',
   'https://teams.microsoft.com/l/call/0/0?users=harley.coleman@anchorp.com',
   array['AL','FL','GA','MS','NC','SC','TN']),

  ('external', 'Brandon Reynolds', 'brandon.reynolds@anchorp.com',
   'https://teams.microsoft.com/l/call/0/0?users=brandon.reynolds@anchorp.com',
   array['PA','OH','WV','KY','VA','MD','DE','DC']),

  ('external', 'Daymon Vargas', 'daymon@anchorp.com',
   'https://teams.microsoft.com/l/call/0/0?users=daymon@anchorp.com',
   array['TX']);

-- Internal (inside) reps. States = the union of the territories they support.
insert into public.sales_reps (kind, name, email, teams_link, states) values
  ('internal', 'Crystal Serrano', 'c.serrano@anchorp.com', null,
   array['WA','OR','CA','NV','AZ','ID','UT','MT','WY','ND','SD','NE','MN','IA','WI','IL','IN','MI','AK','HI',
         'PA','OH','WV','KY','VA','MD','DE','DC']),

  ('internal', 'Nora Menendez', 'nora.mendez@anchorp.com', null,
   array['TX','OK','NM','CO','KS','MO','AR','LA']),

  ('internal', 'Katerina Little', 'katerina.little@anchorp.com', null,
   array['AL','FL','GA','MS','NC','SC','TN','ME','NH','VT','MA','RI','CT','NY','NJ']),

  ('internal', 'Merry Garcia', 'merry.garcia@anchorp.com', null,
   array['TX']);

-- TX sub-territory split. Daymon (and his inside rep Merry) cover only the
-- Greater Houston & Texas Gulf Coast ZIP prefixes; Robert + Nora keep the rest
-- of TX (they stay state-wide with no zip_prefixes). A TX lead's project ZIP
-- decides which pair is notified. Edit this prefix list (or the rep's "ZIP
-- sub-territory" field in /admin/sales-reps) to adjust the boundary.
update public.sales_reps
set zip_prefixes = array['770','771','772','773','774','775','776','777','779']
where lower(email) in ('daymon@anchorp.com', 'merry.garcia@anchorp.com');
