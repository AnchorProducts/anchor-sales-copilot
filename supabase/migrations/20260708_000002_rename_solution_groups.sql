-- Rename three Resource Library solution groups to the CEO's clearer labels:
--   "Box Frames"                 -> "Electrical Box Frames"
--   "Pipe & Conduit Supports"    -> "Small Pipe & Conduit Supports"
--   "Pipe & Duct Frame Supports" -> "Large Pipe & Duct Securements"
--
-- The category labels live in code (SOLUTION_CATEGORIES in solutionCatalog.ts),
-- but admins can pin a hand-created tackle box to a group by its LABEL string
-- via public.products.solution_group. Re-point any box pinned to an old label so
-- it stays in the renamed section instead of orphaning into its own.
-- Idempotent: no-op when no such rows exist.
update public.products set solution_group = 'Electrical Box Frames'
  where solution_group = 'Box Frames';
update public.products set solution_group = 'Small Pipe & Conduit Supports'
  where solution_group = 'Pipe & Conduit Supports';
update public.products set solution_group = 'Large Pipe & Duct Securements'
  where solution_group = 'Pipe & Duct Frame Supports';
