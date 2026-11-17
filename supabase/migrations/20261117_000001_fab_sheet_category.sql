-- "Fab Sheet" asset category: staff-only fabrication sheets filed against a
-- product or solution. Uploads under this key are forced to internal visibility
-- (stored under <prefix>/internal/ with a "fab-sheet-" filename), so the public
-- literature page and /api/public/doc never serve them.
insert into public.asset_categories (key, label, default_visibility, applies_to, sort_order, is_required)
values ('fab_sheet', 'Fab Sheet (Internal)', 'internal', 'any', 170, false)
on conflict (key) do nothing;
