-- "Internal Document" asset category: staff-only files filed against a product
-- or solution. Uploads under this key are forced to internal visibility (stored
-- under <prefix>/internal/ with an "internal-document-" filename), so the public
-- literature page and /api/public/doc never serve them.
insert into public.asset_categories (key, label, default_visibility, applies_to, sort_order, is_required)
values ('internal_document', 'Internal Document (Internal)', 'internal', 'any', 140, false)
on conflict (key) do nothing;
