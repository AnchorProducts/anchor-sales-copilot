-- Flag marketing stock as belonging to the current Product of the Month.
--
-- Deliberately a flag rather than a category: the samples, brochures and swag
-- for a featured product each still route to their own marketing contact
-- (recipients are mapped per category), so re-filing them into a single
-- "product of the month" category would send a brochure to the samples
-- contact. The order form adds a chip that surfaces flagged items across
-- whatever category they actually live in.
alter table public.marketing_inventory_items
  add column if not exists product_of_month boolean not null default false;

-- The order form filters on this every time the chip is selected, and the
-- flagged set is always a small slice of the catalog.
create index if not exists marketing_inventory_items_potm_idx
  on public.marketing_inventory_items (product_of_month)
  where product_of_month;
