-- A user's service-area ZIP. Optional in general, but needed for states that
-- are split by ZIP sub-territory (e.g. TX -> Daymon Houston/Gulf vs Robert) so
-- the dashboard can show the user's single correct rep instead of all of them.
alter table public.profiles
  add column if not exists service_zip text;
