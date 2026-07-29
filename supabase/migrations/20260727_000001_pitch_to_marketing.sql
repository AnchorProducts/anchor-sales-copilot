-- ============================================================================
-- Pitch to Marketing — cross-team idea submission.
--
-- Extends the existing Strategy Board table (public.mkt_idea) with pitch/review
-- fields and adds the two-way comment thread. There is deliberately NO parallel
-- ideas table: the Anchor Internal Portal's Strategy Board and this app read the
-- same rows and differ only in UI surface.
--
-- Idempotent — safe to re-run. Run once in the shared Supabase SQL editor
-- (project mytlsruwxujfakxzbvtp), then reload the PostgREST schema cache.
--
-- NOTE: decline_reason, reviewed_by and reviewed_at already exist on mkt_idea;
-- the "add column if not exists" below is a no-op for those.
-- ============================================================================

alter table public.mkt_idea
  add column if not exists source           text not null default 'internal',  -- 'internal' | 'pitch'
  add column if not exists submitted_by     uuid references auth.users (id),
  add column if not exists submitter_team   text,
  add column if not exists review_status    text,   -- null for internal ideas; 'pending'|'approved'|'declined'|'needs_info' for pitches
  add column if not exists decline_reason   text,
  add column if not exists planned_timeline text,   -- free text marketing sends back, e.g. "Q4 2026 / next sprint"
  add column if not exists reviewed_by      uuid references auth.users (id),
  add column if not exists reviewed_at      timestamptz;

create index if not exists mkt_idea_submitted_by_idx on public.mkt_idea (submitted_by);
create index if not exists mkt_idea_review_idx       on public.mkt_idea (source, review_status);

-- Two-way thread: feedback, info requests, info responses, decision records.
create table if not exists public.mkt_idea_comment (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.mkt_idea (id) on delete cascade,
  author_id   uuid references auth.users (id),
  author_team text,
  kind        text not null default 'comment', -- 'comment'|'info_request'|'info_response'|'decision'
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists mkt_idea_comment_idea_idx on public.mkt_idea_comment (idea_id, created_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- mkt_idea already has policies gated on is_marketing(). ADD a submitter
-- carve-out so a non-marketing pitcher can see and create ONLY their own
-- pitches, and can never see the rest of the board.
alter table public.mkt_idea enable row level security;

drop policy if exists mkt_idea_sel on public.mkt_idea;
create policy mkt_idea_sel on public.mkt_idea for select
  using ( public.is_marketing() or submitted_by = auth.uid() );

drop policy if exists mkt_idea_pitch_ins on public.mkt_idea;
create policy mkt_idea_pitch_ins on public.mkt_idea for insert
  with check (
    public.is_marketing()
    or ( submitted_by = auth.uid() and source = 'pitch' and review_status = 'pending' )
  );

-- UPDATE stays marketing-only: a submitter changes nothing after submitting;
-- their input flows through comments instead.
drop policy if exists mkt_idea_upd on public.mkt_idea;
create policy mkt_idea_upd on public.mkt_idea for update
  using ( public.is_marketing() ) with check ( public.is_marketing() );

-- Comment thread: marketing sees all; a submitter sees/writes only on their pitch.
alter table public.mkt_idea_comment enable row level security;

drop policy if exists mkt_idea_comment_sel on public.mkt_idea_comment;
create policy mkt_idea_comment_sel on public.mkt_idea_comment for select
  using (
    public.is_marketing()
    or exists ( select 1 from public.mkt_idea i
                where i.id = idea_id and i.submitted_by = auth.uid() )
  );

drop policy if exists mkt_idea_comment_ins on public.mkt_idea_comment;
create policy mkt_idea_comment_ins on public.mkt_idea_comment for insert
  with check (
    author_id = auth.uid()
    and (
      public.is_marketing()
      or exists ( select 1 from public.mkt_idea i
                  where i.id = idea_id and i.submitted_by = auth.uid() )
    )
  );

-- PostgREST needs to see the new table/columns.
notify pgrst, 'reload schema';
