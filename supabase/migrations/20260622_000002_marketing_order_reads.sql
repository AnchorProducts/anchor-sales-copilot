-- Per-user read state for marketing-order chat threads. One row per
-- (order, viewer); last_read_at marks the moment that viewer last opened the
-- thread. Unread = messages in the order newer than last_read_at that the
-- viewer didn't author. Powers the "💬 N" unread badge on order cards.

create table if not exists public.marketing_order_reads (
  order_id     uuid not null references public.marketing_orders(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (order_id, user_id)
);

create index if not exists marketing_order_reads_user_idx
  on public.marketing_order_reads (user_id);

alter table public.marketing_order_reads enable row level security;

-- A viewer only ever reads/writes their own read state.
create policy marketing_order_reads_select_own
  on public.marketing_order_reads
  for select
  using (user_id = auth.uid());

create policy marketing_order_reads_insert_own
  on public.marketing_order_reads
  for insert
  with check (user_id = auth.uid());

create policy marketing_order_reads_update_own
  on public.marketing_order_reads
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
