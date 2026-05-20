-- App-wide notification recipient settings. Single-row table (`id = 1`).
-- Currently stores:
--   commission_recipient_email — single recipient for commission claim notifications
--   weekly_report_emails       — list of recipients for the Friday weekly report
--
-- The "single row" pattern lets us PATCH a known row id from the admin UI
-- without juggling create-vs-update logic.

create table if not exists public.notification_settings (
  id                          int primary key default 1 check (id = 1),
  commission_recipient_email  text,
  weekly_report_emails        text[] not null default '{}',
  updated_at                  timestamptz not null default now()
);

-- Seed the single row so the GET endpoint always has something to read.
insert into public.notification_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.notification_settings enable row level security;

-- Admins only — read and write.
create policy "Admins can read notification settings"
  on public.notification_settings for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update notification settings"
  on public.notification_settings for update
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
