-- Per-user access to a tool, for tools that are not for everyone.
--
-- The existing admin_tools switch is per AUDIENCE — internal or external, all
-- of them at once. The mobile showcase is narrower than that: one person drives
-- the truck and files the stops, and the tile is noise on everybody else's
-- dashboard. So access is an explicit named list rather than a role.
--
-- The two controls compose, and both must pass:
--   admin_tools 'sales:internal:showcase'  → is this tool switched on at all
--   tool_user_access 'showcase'            → is THIS person on the list
--
-- Deliberately keyed by the same tool key as the sales-tool registry, so a
-- second restricted tool needs a row here and nothing else.
create table if not exists public.tool_user_access (
  tool_key    text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  primary key (tool_key, user_id)
);

create index if not exists tool_user_access_tool_idx
  on public.tool_user_access(tool_key);

alter table public.tool_user_access enable row level security;

-- A user reads their OWN grants. That is what lets the dashboard decide whether
-- to draw the tile from the browser client, the same way it reads admin_tools —
-- no extra API hop on the busiest page in the app. It deliberately does not let
-- anyone enumerate who else has access.
create policy "tool access - read own"
  on public.tool_user_access for select
  to authenticated
  using (user_id = auth.uid());

-- Admins manage the list. Writes go through the admin API on the service-role
-- key (which bypasses RLS); this policy exists so an admin session could write
-- directly too, and so non-admins are denied by a policy rather than falling
-- through to none.
create policy "tool access - admin manage"
  on public.tool_user_access for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
