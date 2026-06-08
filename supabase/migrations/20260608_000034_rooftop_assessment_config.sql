-- Admin-editable "logic" for the Rooftop Equipment Audit (/rooftop). The audit
-- is driven entirely by a system prompt (the OSHA decision tree); this single-
-- row table holds an optional override that an admin edits from
-- /admin/rooftop-logic. When system_prompt is null/empty, /api/rooftop falls
-- back to DEFAULT_ROOFTOP_SYSTEM_PROMPT in code, so the audit always works.
--
-- Single-row pattern (id = 1), same as notification_settings.

create table if not exists public.rooftop_assessment_config (
  id            int primary key default 1 check (id = 1),
  system_prompt text,
  updated_at    timestamptz not null default now()
);

-- Seed the row so the editor always has something to read/update.
insert into public.rooftop_assessment_config (id)
values (1)
on conflict (id) do nothing;

alter table public.rooftop_assessment_config enable row level security;

-- Admins only — read and write. The public /api/rooftop route reads via the
-- service-role key, which bypasses RLS.
create policy "Admins can read rooftop assessment config"
  on public.rooftop_assessment_config for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can update rooftop assessment config"
  on public.rooftop_assessment_config for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
