-- Seed public.products with truly-new solutions from the CEO catalog.
-- Solutions that have a `legacyName` in solutionCatalog.ts already have a
-- matching row in public.products (under the previous name) and are linked
-- via the asset library's legacy-name fallback — do NOT insert duplicates
-- for those.
-- Idempotent: skips rows that already exist (case-insensitive name match).

insert into public.products (name, section, series, active)
select v.name, 'solution', v.series, true
from (values
  -- Pipe & Conduit Supports — new PSS product line (no direct legacy row)
  ('PSS 0320 - Pipe Support Securement - Roller Assembly', 'PSS'),
  ('PSS 0310 - Pipe Support Securement - Strut Assembly', 'PSS'),
  ('PSS 0305 - Pipe Securement - 6" Base', 'PSS'),
  ('PSS 0300 - Pipe Securement - 12" Base', 'PSS'),

  -- Snow Retention — new 8' kit packaging
  ('8'' Snow Retention Kit', null),

  -- H-Frame Supports — new standard frame sizes
  ('24" x 24" Standard H-Frame - w/ 300 Series U-Anchor', '300'),
  ('36" x 36" Standard H-Frame - w/ 300 Series U-Anchor', '300'),
  ('36" x 48" Standard H-Frame - w/ 300 Series U-Anchor', '300')
) as v(name, series)
where not exists (
  select 1 from public.products p
  where lower(p.name) = lower(v.name)
);
