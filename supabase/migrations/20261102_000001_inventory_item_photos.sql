-- Several photos per inventory item, each tagged with what it shows.
--
-- Marketing is shooting transparent PNGs of every item, and an anchor sample
-- gets three kinds of shot: the anchor alone, the anchor with its plastic
-- overlay, and the full pizza box. Other items (swag, literature, tradeshow)
-- just have photos.
--
-- photos: ordered array of { "path": "<storage key>", "kind": "anchor" |
-- "overlay" | "box" | "other" }. image_path stays, as the item's MAIN photo —
-- the first one of the first kind that has any (anchor, other, overlay, box) —
-- so every page that already shows image_path (the store, the aisle grab
-- pages, pizza boxes) keeps working without knowing about photos at all.

alter table public.marketing_inventory_items
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- Carry each item's existing photo across as its first photo.
update public.marketing_inventory_items
set photos = jsonb_build_array(
  jsonb_build_object(
    'path', image_path,
    'kind', case when category = 'samples' then 'anchor' else 'other' end
  )
)
where image_path is not null
  and image_path <> ''
  and (photos is null or photos = '[]'::jsonb);

notify pgrst, 'reload schema';
