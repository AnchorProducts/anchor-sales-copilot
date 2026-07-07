-- Let an admin file a custom (non-catalog) solution tackle box under a group.
--
-- The Resource Library's Solutions section is driven by the code-defined
-- SOLUTION_CATALOG / SOLUTION_CATEGORIES. A tackle box an admin creates by hand
-- (e.g. "Guy Wire Kit") has no catalog entry, so it rendered nowhere. This
-- column records which group such a box belongs to — either an existing catalog
-- category label (e.g. "Snow Retention") or a brand-new one the admin names
-- (e.g. "Accessories"). AssetsBrowser groups these "extra" products by this
-- label, appending them to the matching catalog section or creating a new one.
--
-- Null for catalog-matched products: they are grouped by the catalog itself.
alter table public.products
  add column if not exists solution_group text;
