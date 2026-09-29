-- Credentials index: WHERE each login lives, never the login itself.
--
-- Passwords, keys and recovery codes stay in the team password manager. These
-- tables only record what exists (the system, its sign-in page, which vault
-- item holds it, whose phone has the 2FA, when it was last changed) so Riley
-- and Calli can see everything at a glance from the App or the website admin.
--
-- Shared by the App (/admin/credentials) and the website (/portal/marketing/
-- credentials). Both read and write through their own server routes on the
-- service-role key, after checking the caller is one of the two keepers. RLS is
-- on with NO policies and every grant revoked, so no browser session — admin or
-- otherwise — can read a row directly.

create table if not exists public.credential_entries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text,
  login_url     text,
  account       text,            -- the login name or email, never the password
  used_for      text,
  vault_item    text,            -- the item's name in the password manager
  two_factor    text,            -- where the 2FA lives, e.g. "Riley's phone"
  owner         text,
  last_rotated  date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text
);

create table if not exists public.credential_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Every look, open, copy and edit, from either site.
create table if not exists public.credential_access_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  email       text,
  action      text not null,
  entry_id    uuid,
  entry_name  text,
  source      text not null        -- 'app' | 'website'
);

create index if not exists credential_access_log_at_idx on public.credential_access_log (at desc);

alter table public.credential_entries    enable row level security;
alter table public.credential_settings   enable row level security;
alter table public.credential_access_log enable row level security;

revoke all on public.credential_entries    from anon, authenticated;
revoke all on public.credential_settings   from anon, authenticated;
revoke all on public.credential_access_log from anon, authenticated;
