-- Small key/value store for app-wide settings an admin controls from the UI.
--
-- First use is the Resource Library's "Product of the Month" pill, which points
-- at either a single product or a whole solution group — a shape that doesn't
-- fit as a column on products (a group isn't a product row). Keeping it as
-- jsonb means later settings of a different shape don't each need a migration.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

-- Every signed-in user reads these: the library pill renders from the browser
-- client, so a read policy is what makes it visible at all.
create policy "app settings - read for authenticated"
  on public.app_settings for select
  to authenticated
  using (true);

-- Writes go through the admin API on the service-role key, which bypasses RLS.
-- This policy exists so an admin session could write directly too, and so that
-- non-admins are denied rather than silently falling through to no policy.
create policy "app settings - admin write"
  on public.app_settings for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
