-- Activation state for the admin console tools (the bento tiles on /admin).
-- The tool catalog itself lives in code (src/app/admin/cards.tsx); this table
-- stores only which tools an admin has turned off. A tool with no row here is
-- treated as ACTIVE, so newly added code-side tiles light up by default and we
-- never have to backfill rows when the catalog changes.
--
-- The management UI (/admin/tools) upserts a row per tool keyed by `key` and
-- toggles `active`. The hub (/admin) hides any tool whose row has active = false.

create table if not exists public.admin_tools (
  key        text primary key,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.admin_tools enable row level security;

-- Admins only — read, insert, and update. Mirrors notification_settings.
create policy "Admins can read admin tools"
  on public.admin_tools for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can insert admin tools"
  on public.admin_tools for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update admin tools"
  on public.admin_tools for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
