-- FM intake back office: admin review of submitted Rooftop Equipment Intakes.
--
-- Adds the "decide" side to each submission — a status the admin moves through
-- while working it, plus review notes and who/when last reviewed. The submitted
-- intake data itself stays as-is (promoted columns + payload jsonb); these
-- columns are the back-office layer on top.
--
-- Status workflow: new -> in_review -> recommended -> closed.

alter table public.fm_intake_submissions
  add column if not exists status      text not null default 'new',
  add column if not exists review_notes text,
  add column if not exists reviewed_by  uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at  timestamptz;

create index if not exists fm_intake_submissions_status_idx
  on public.fm_intake_submissions (status);
