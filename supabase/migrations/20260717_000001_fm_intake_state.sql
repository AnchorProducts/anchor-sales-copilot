-- Territory routing for Project Intake (FM) submissions.
--
-- REC consults (`leads`) carry a `state`/`region_code` so internal reps only see
-- the ones in their assigned states. Project Intakes had no location column, so
-- they were admin-only. Add the same two columns here; the intake API derives
-- the state from the project address on submit and scopes the internal-rep view
-- (Active Consults) by it, exactly like leads.

alter table public.fm_intake_submissions
  add column if not exists state       text,
  add column if not exists region_code text;

create index if not exists fm_intake_submissions_region_code_idx
  on public.fm_intake_submissions (region_code);
