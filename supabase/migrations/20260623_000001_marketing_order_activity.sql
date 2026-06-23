-- Activity log for marketing orders. Whenever an admin moves an order to a new
-- phase (status), they must record WHAT they did. This gives every admin a shared,
-- attributed history — who did what and when — so two people don't unknowingly
-- work the same order. Standalone notes (no phase change) are allowed too, so an
-- admin can claim an order ("I've got this") without advancing it.
--
-- Internal coordination log, modeled on marketing_order_messages. Writes go
-- through the service role in the API (which also enforces the required note);
-- the RLS policy locks reads down to the fulfillment team — admins and inside
-- (anchor) reps.

create table if not exists public.marketing_order_activity (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.marketing_orders(id) on delete cascade,
  admin_id    uuid references auth.users(id) on delete set null,
  from_status text,
  to_status   text,
  note        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists marketing_order_activity_order_idx
  on public.marketing_order_activity (order_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.marketing_order_activity enable row level security;

create policy marketing_order_activity_team_read
  on public.marketing_order_activity
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'anchor_rep')
    )
  );
