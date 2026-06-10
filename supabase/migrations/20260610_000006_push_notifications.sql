-- Web push notifications.
--
-- push_subscriptions: one row per browser/device a user has opted in on (a user
-- can have several — phone PWA, desktop, etc.). Keyed by the push endpoint.
--
-- notification_tool_assignments: which users get notified for each "tool"
-- (event source — new consult, marketing order, support request, …). The tool
-- keys are defined in code (src/lib/push/topics.ts); a tool with no rows here
-- simply notifies nobody.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

create table if not exists public.notification_tool_assignments (
  tool_key    text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tool_key, user_id)
);

create index if not exists notification_tool_assignments_tool_idx
  on public.notification_tool_assignments(tool_key);

-- RLS on. The server reads/writes these with the service-role key (which
-- bypasses RLS), so policies stay tight: a user may see/manage only their own
-- push subscriptions; assignments are admin-only.
alter table public.push_subscriptions enable row level security;
alter table public.notification_tool_assignments enable row level security;

create policy "own push subscriptions - select"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "own push subscriptions - insert"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

create policy "own push subscriptions - delete"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

create policy "tool assignments - admin all"
  on public.notification_tool_assignments for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
