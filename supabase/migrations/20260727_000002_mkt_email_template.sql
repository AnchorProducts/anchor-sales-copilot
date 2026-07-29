-- ============================================================================
-- Marketing-authored transactional email templates.
--
-- The Pitch to Marketing emails are marketing's copy, not a developer's, so the
-- subject/heading/body/button live here and are edited in the Marketing Hub
-- (/marketing/email-templates). A key with no row falls back to the defaults in
-- src/lib/email/pitchTemplates.ts, so the emails work before anyone opens the
-- editor and keep working if a row is deleted.
--
-- Shared table: gated on public.is_marketing() like the rest of mkt_*, so the
-- Anchor Internal Portal can edit the same copy from its own hub.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.mkt_email_template (
  key          text primary key,
  subject      text not null,
  heading      text not null default '',
  body         text not null,
  button_label text not null default '',
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);

alter table public.mkt_email_template enable row level security;

-- Marketing and admins read and write the copy. Sending happens server-side
-- with the service role, which bypasses RLS, so recipients never need access.
drop policy if exists mkt_email_template_sel on public.mkt_email_template;
create policy mkt_email_template_sel on public.mkt_email_template for select
  using ( public.is_marketing() );

drop policy if exists mkt_email_template_ins on public.mkt_email_template;
create policy mkt_email_template_ins on public.mkt_email_template for insert
  with check ( public.is_marketing() );

drop policy if exists mkt_email_template_upd on public.mkt_email_template;
create policy mkt_email_template_upd on public.mkt_email_template for update
  using ( public.is_marketing() ) with check ( public.is_marketing() );

drop policy if exists mkt_email_template_del on public.mkt_email_template;
create policy mkt_email_template_del on public.mkt_email_template for delete
  using ( public.is_marketing() );

-- PostgREST needs to see the new table.
notify pgrst, 'reload schema';
