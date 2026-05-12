-- Pending uploads queue for admin review.
-- Internal users (anchor_rep) upload photos here; admin reviews and either
-- approves (publishes the file into the live solutions/ folder + creates an
-- assets row) or rejects (deletes the file).

create table if not exists public.pending_uploads (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null references public.products(id) on delete cascade,
  product_name text,

  -- Submitter
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  uploaded_by_company text,
  uploaded_by_email text,

  -- File
  filename text not null,
  storage_path text not null,            -- pending/<product-id>/<filename>
  content_type text,
  size_bytes integer,
  note text,                              -- optional caption / context

  -- Review state
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_path text,                     -- final solutions/... path if approved
  reject_reason text,

  created_at timestamptz not null default now()
);

create index if not exists pending_uploads_status_idx on public.pending_uploads (status);
create index if not exists pending_uploads_product_idx on public.pending_uploads (product_id);
create index if not exists pending_uploads_uploaded_by_idx on public.pending_uploads (uploaded_by);
create index if not exists pending_uploads_created_at_idx on public.pending_uploads (created_at desc);

alter table public.pending_uploads enable row level security;

-- Writes go through service-role API routes (no client-side insert/update/delete).
-- Reads: admins via service role; uploaders see their own rows.

drop policy if exists pending_uploads_select_own on public.pending_uploads;
create policy pending_uploads_select_own on public.pending_uploads
  for select to authenticated
  using (uploaded_by = auth.uid());
