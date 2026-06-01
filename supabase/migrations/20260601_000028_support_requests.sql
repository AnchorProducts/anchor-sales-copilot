-- In-app support tickets. External and internal reps file requests; admins
-- reply. Two-table thread: support_requests (header) + support_messages (body).

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,

  -- Submitter snapshot at file time so admin doesn't need to join profiles.
  submitter_name text,
  submitter_email text,
  submitter_role text,

  subject text not null,
  status text not null default 'open' check (status in ('open', 'closed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sort key for the admin queue. Bumped by trigger on any new message.
  last_message_at timestamptz not null default now()
);

create index if not exists support_requests_created_by_idx on public.support_requests (created_by);
create index if not exists support_requests_status_idx on public.support_requests (status);
create index if not exists support_requests_last_msg_idx on public.support_requests (last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_role text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_request_idx on public.support_messages (request_id, created_at);

-- Whenever a new message is added, bump the parent request's last_message_at
-- so the admin queue sorts by most-recent activity.
create or replace function public.bump_support_request_activity()
returns trigger
language plpgsql
as $$
begin
  update public.support_requests
     set last_message_at = new.created_at,
         updated_at = now()
   where id = new.request_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_support_activity on public.support_messages;
create trigger trg_bump_support_activity
after insert on public.support_messages
for each row execute function public.bump_support_request_activity();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.support_requests enable row level security;
alter table public.support_messages enable row level security;

-- Anyone signed in can file a request for themselves.
create policy support_requests_insert_self
  on public.support_requests
  for insert
  with check (created_by = auth.uid());

-- Users see only their own requests; admins see everything.
create policy support_requests_select_own
  on public.support_requests
  for select
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Only admins update status or other metadata.
create policy support_requests_update_admin
  on public.support_requests
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Messages: can read if you own the parent request, or you're an admin.
create policy support_messages_select_thread
  on public.support_messages
  for select
  using (
    exists (
      select 1
        from public.support_requests r
       where r.id = support_messages.request_id
         and (
           r.created_by = auth.uid()
           or exists (
             select 1 from public.profiles p
             where p.id = auth.uid() and p.role = 'admin'
           )
         )
    )
  );

-- Messages: requester can reply to their own thread; admins can reply to any.
create policy support_messages_insert_thread
  on public.support_messages
  for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1
        from public.support_requests r
       where r.id = support_messages.request_id
         and (
           r.created_by = auth.uid()
           or exists (
             select 1 from public.profiles p
             where p.id = auth.uid() and p.role = 'admin'
           )
         )
    )
  );
