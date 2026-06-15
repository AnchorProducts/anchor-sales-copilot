-- Document revision labels for the internal portal.
--
-- The portal holds a SINGLE current copy of each document; that model does not
-- change here. These columns only let us (1) show a revision label that confirms
-- the portal copy matches the QMS master, and (2) know when the copy last
-- changed. This is NOT version control — no history, diffing, or rollback.
--
--   revision      manually entered to match the QMS master (e.g. "Rev C"); null
--                 until a human confirms it. NOT auto-incremented.
--   last_updated  bumped to now() whenever the file (path) or revision changes.
--   updated_by    who made the change.
alter table public.assets
  add column if not exists revision text,
  add column if not exists last_updated timestamptz,
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

-- Backfill last_updated from existing timestamps; leave revision null.
update public.assets
  set last_updated = coalesce(last_updated, created_at, now())
  where last_updated is null;

-- Keep last_updated fresh whenever the file (path) or revision changes. Pure SQL
-- so a single current copy still reflects an accurate "last updated" stamp.
create or replace function public.assets_touch_last_updated()
returns trigger
language plpgsql
as $$
begin
  if (new.path is distinct from old.path) or (new.revision is distinct from old.revision) then
    new.last_updated := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assets_touch_last_updated on public.assets;
create trigger trg_assets_touch_last_updated
before update on public.assets
for each row execute function public.assets_touch_last_updated();
