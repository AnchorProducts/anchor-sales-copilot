-- "Talk to marketing" on an item.
--
-- Some anchors carry instructions that only marketing knows — a brand that
-- needs its own literature in the box, a partner whose samples ship a certain
-- way, a run that's being held. Those instructions have lived in people's
-- heads, so whether a fulfiller hears about them depends on who happens to be
-- around when the order lands.
--
-- An admin writes the instruction on the item. Every order that includes that
-- item then carries a "talk to marketing" prompt in the fulfillment queue, so
-- the inside rep working it sees the note before they pack anything.
--
-- The note IS the flag: null or empty means nothing to say.

alter table public.marketing_inventory_items
  add column if not exists marketing_alert text,
  add column if not exists marketing_alert_by uuid references auth.users (id) on delete set null,
  add column if not exists marketing_alert_at timestamptz;

create index if not exists marketing_inventory_items_marketing_alert_idx
  on public.marketing_inventory_items (id)
  where marketing_alert is not null;

notify pgrst, 'reload schema';
