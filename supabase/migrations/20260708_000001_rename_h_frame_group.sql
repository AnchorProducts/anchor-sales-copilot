-- Rename the "H-Frame Supports" solution group to "Pipe & Duct Frame Supports".
--
-- The category label lives in code (SOLUTION_CATEGORIES in solutionCatalog.ts),
-- but admins can pin a hand-created tackle box to a group by its LABEL string via
-- public.products.solution_group. Any box pinned to the old label would orphan
-- into its own section after the code rename, so re-point it to the new label.
-- Idempotent: no-op when no such rows exist.
update public.products
  set solution_group = 'Pipe & Duct Frame Supports'
  where solution_group = 'H-Frame Supports';
