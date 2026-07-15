-- Marketing-aisle "grab" via QR code.
--
-- A single public QR code (printed and posted in the marketing aisle) opens a
-- no-login pick-list. Someone grabbing stock enters their name + email, picks an
-- item + quantity, and confirms — the item's quantity_available drops immediately
-- (units permanently leave inventory, like a marketing-order fulfillment; they
-- are NOT a returnable checkout), and the pickup is logged + notified.
--
-- Two tables:
--
-- 1. marketing_grab_config — a single-row config holding the shared aisle token.
--    The public URL is /grab/<token>; the token is unguessable so the page isn't
--    trivially discoverable, and an admin can rotate it (issuing a new token
--    invalidates old printed codes). `enabled` is a kill-switch.
--
-- 2. marketing_item_grabs — the pickup log: who grabbed what, how many, when.
--    This is the audit trail that lets the team catch drift in an honor-system
--    aisle. Public writes never touch this table directly — the public API runs
--    through the service role, which validates the token first.
--
-- Both tables have RLS enabled with NO public policies: all access flows through
-- the service role in the API (which enforces the token gate for the public
-- endpoint and the admin-role gate for reads). Direct anon/client access is
-- denied by default.

-- ── Aisle config (single row: id is pinned to 1) ─────────────────────────────
create table if not exists public.marketing_grab_config (
  id         smallint primary key default 1 check (id = 1),
  token      text not null,
  enabled    boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Seed the single row with a random opaque token (a UUID with dashes stripped).
-- gen_random_uuid() is available in Supabase's default extensions.
insert into public.marketing_grab_config (id, token)
values (1, replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- ── Pickup log ────────────────────────────────────────────────────────────────
create table if not exists public.marketing_item_grabs (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid references public.marketing_inventory_items (id) on delete set null,
  item_name        text not null,
  grabbed_by_name  text not null,
  grabbed_by_email text not null,
  quantity         integer not null check (quantity > 0),
  ip               text,
  created_at       timestamptz not null default now()
);

create index if not exists marketing_item_grabs_item_idx
  on public.marketing_item_grabs (item_id, created_at desc);
create index if not exists marketing_item_grabs_created_idx
  on public.marketing_item_grabs (created_at desc);

-- ── RLS: service-role only (no public policies) ──────────────────────────────
alter table public.marketing_grab_config enable row level security;
alter table public.marketing_item_grabs enable row level security;
