-- Consults & Project Intakes: a two-state workflow driven by the assignee.
--
-- The six-step lead ladder (new/assigned/contacted/qualified/closed_won/
-- closed_lost) and the four-step intake ladder (new/in_review/recommended/
-- closed) both collapse to the only distinction the team actually tracks:
--
--   new       — nobody owns it yet
--   assigned  — assigned_rep_user_id is set
--
-- Status is derived from the assignee rather than set independently, so the two
-- can never disagree. (Before this migration they routinely did: LeadDetail's
-- persist() hardcoded status:'new' on every NetSuite sync, so leads that had an
-- assignee still read as new.)
--
-- Verified before writing: no row in either table used any of the statuses being
-- retired, so nothing is lost here. The backfills below are belt-and-braces for
-- any row created between that check and this migration running.

-- ── Project Intakes: gain an assignee ───────────────────────────────────────
alter table public.fm_intake_submissions
  add column if not exists assigned_rep_user_id uuid
    references auth.users (id) on delete set null;

create index if not exists fm_intake_submissions_assigned_idx
  on public.fm_intake_submissions (assigned_rep_user_id);

-- Anything already being worked counts as assigned; its reviewer becomes its
-- assignee, since that's who had picked it up.
update public.fm_intake_submissions
   set assigned_rep_user_id = coalesce(assigned_rep_user_id, reviewed_by)
 where status in ('in_review', 'recommended', 'closed');

update public.fm_intake_submissions
   set status = case when assigned_rep_user_id is null then 'new' else 'assigned' end
 where status is distinct from
       (case when assigned_rep_user_id is null then 'new' else 'assigned' end);

alter table public.fm_intake_submissions
  drop constraint if exists fm_intake_submissions_status_check;

alter table public.fm_intake_submissions
  add constraint fm_intake_submissions_status_check
  check (status in ('new', 'assigned'));

-- ── Consults: collapse the ladder ───────────────────────────────────────────
update public.leads
   set status = case when assigned_rep_user_id is null then 'new' else 'assigned' end
 where status is distinct from
       (case when assigned_rep_user_id is null then 'new' else 'assigned' end);

alter table public.leads drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check check (status in ('new', 'assigned'));
