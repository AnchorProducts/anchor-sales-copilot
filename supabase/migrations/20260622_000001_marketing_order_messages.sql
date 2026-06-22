-- Per-order chat for marketing orders. Lets the submitting rep and admins talk
-- about a specific order — clarify details, ask questions, and share photos —
-- without leaving the order. Modeled on the support_requests/support_messages
-- thread. Image bytes live in the private "knowledge" bucket under
-- marketing-orders/<order_id>/; attachment metadata is stored on the message row.

create table if not exists public.marketing_order_messages (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.marketing_orders(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  author_role text,
  body        text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists marketing_order_messages_order_idx
  on public.marketing_order_messages (order_id, created_at);

-- Sort key for "most recent activity" on an order, bumped by trigger below.
alter table public.marketing_orders
  add column if not exists last_message_at timestamptz;

create or replace function public.bump_marketing_order_activity()
returns trigger
language plpgsql
as $$
begin
  update public.marketing_orders
     set last_message_at = new.created_at,
         updated_at = now()
   where id = new.order_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_marketing_order_activity on public.marketing_order_messages;
create trigger trg_bump_marketing_order_activity
after insert on public.marketing_order_messages
for each row execute function public.bump_marketing_order_activity();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Access mirrors the rep-facing order view: the order's creator and admins can
-- read and post; everyone else is shut out. (anchor_rep can read every order at
-- the table level, but the app only ever surfaces a rep their own orders, so we
-- scope chat to the creator to match that behavior.)
alter table public.marketing_order_messages enable row level security;

create policy marketing_order_messages_select_thread
  on public.marketing_order_messages
  for select
  using (
    exists (
      select 1
        from public.marketing_orders o
       where o.id = marketing_order_messages.order_id
         and (
           o.created_by = auth.uid()
           or exists (
             select 1 from public.profiles p
             where p.id = auth.uid() and p.role = 'admin'
           )
         )
    )
  );

create policy marketing_order_messages_insert_thread
  on public.marketing_order_messages
  for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1
        from public.marketing_orders o
       where o.id = marketing_order_messages.order_id
         and (
           o.created_by = auth.uid()
           or exists (
             select 1 from public.profiles p
             where p.id = auth.uid() and p.role = 'admin'
           )
         )
    )
  );
