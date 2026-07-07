-- Let an admin permanently remove a tackle box from the Resource Library.
--
-- Deleting a tackle box used to just drop the products row. For a catalog-driven
-- solution that only reverted the card to its "Coming soon — click to add
-- content" placeholder (the catalog, not the DB, decides which solution cards
-- exist), so the button never disappeared. `active=false` can't express this
-- either: the Active switch INTENTIONALLY reverts a box to a placeholder.
--
-- `hidden` is the distinct "deleted — suppress the card entirely" signal. Delete
-- now soft-deletes: it purges the files + child rows but keeps a hidden=true
-- tombstone so the catalog card can be hidden. Re-creating a box with the same
-- name un-hides it (see /api/admin/products POST).
alter table public.products
  add column if not exists hidden boolean not null default false;
