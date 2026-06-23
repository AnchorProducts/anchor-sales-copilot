-- Universal Rooftop Equipment Intake Form ("FM Form").
--
-- A multi-section intake the Anchor team uses to gather a project's customer,
-- roof, engineering, and roof-mounted-equipment details to recommend securement
-- solutions. Submissions are stored here; the full nested/repeating structure
-- (buildings, HVAC units, pipe stacks, per-equipment sections) lives in `payload`
-- as JSONB, with a few promoted columns for listing. Uploaded site/equipment
-- photos and product data sheets live in the private "knowledge" bucket under
-- fm-intake/<id>/; their metadata is on `attachments`.

create table if not exists public.fm_intake_submissions (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references auth.users (id) on delete set null,
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  company_name    text,
  project_name    text,
  project_address text,
  equipment       text[] not null default '{}',
  payload         jsonb not null default '{}'::jsonb,
  attachments     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists fm_intake_submissions_created_at_idx
  on public.fm_intake_submissions (created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Admin-only tool: only admins read submissions. Writes go through the service
-- role in the API (which also enforces the admin check).
alter table public.fm_intake_submissions enable row level security;

create policy fm_intake_submissions_admin_read
  on public.fm_intake_submissions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Register the tool as INACTIVE by default in Manage Tools. A tool with no row in
-- admin_tools is treated as active, so we seed an explicit inactive row. Leaves an
-- admin's later choice intact (do nothing on conflict).
insert into public.admin_tools (key, active)
values ('fm-intake', false)
on conflict (key) do nothing;
