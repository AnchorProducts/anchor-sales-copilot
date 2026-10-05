-- "Assembly" and "CAD" asset categories. Both are customer-facing by default.
-- Uploads are filed with an "assembly-" / "cad-" filename prefix so the tackle
-- box sorts them onto their own tabs.
insert into public.asset_categories (key, label, default_visibility, applies_to, sort_order, is_required)
values
  ('assembly', 'Assembly', 'public', 'any', 150, false),
  ('cad', 'CAD', 'public', 'any', 160, false)
on conflict (key) do nothing;
