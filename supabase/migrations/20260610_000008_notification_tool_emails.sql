-- Per-tool raw email recipients (email-only — addresses that aren't app users).
-- Pairs with notification_tool_assignments (users who get email + push). An event
-- notifies the union of both, de-duplicated.
create table if not exists public.notification_tool_emails (
  tool_key    text not null,
  email       text not null,
  created_at  timestamptz not null default now(),
  primary key (tool_key, email)
);

create index if not exists notification_tool_emails_tool_idx
  on public.notification_tool_emails(tool_key);

alter table public.notification_tool_emails enable row level security;

create policy "tool emails - admin all"
  on public.notification_tool_emails for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
