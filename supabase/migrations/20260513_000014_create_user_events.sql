-- Custom analytics: every page view + key action per user.
-- Retention is handled by the weekly cron, which prunes rows older than 90 days.
create table if not exists public.user_events (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event_type  text not null,
  page_path   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists user_events_user_created_idx
  on public.user_events (user_id, created_at desc);

create index if not exists user_events_type_created_idx
  on public.user_events (event_type, created_at desc);

create index if not exists user_events_created_idx
  on public.user_events (created_at desc);

alter table public.user_events enable row level security;

-- A logged-in user may insert events for themselves only.
create policy "Users can insert own events"
  on public.user_events for insert
  with check (auth.uid() = user_id);

-- A user may read their own events.
create policy "Users can read own events"
  on public.user_events for select
  using (auth.uid() = user_id);

-- Admins may read every user's events.
create policy "Admins can read all events"
  on public.user_events for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
