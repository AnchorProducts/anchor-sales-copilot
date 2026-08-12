-- Deleting a user erases the person, not the business.
--
-- Admins can now delete a user outright. Today that would take far more with it
-- than anyone expects: leads, commission_claims, notable_projects,
-- support_requests and marketing_order_messages all cascade from the user, so
-- removing a departed rep would destroy fulfilled orders' conversations, the
-- consults they logged and the commission claims they were paid on. Worse,
-- leads.rep_user_id is ON DELETE RESTRICT, so deleting an assigned rep fails
-- outright with a foreign-key error — "delete any user" doesn't currently work
-- at all for the busiest reps.
--
-- Every reference to a person is switched to ON DELETE SET NULL and made
-- nullable, so the record survives with the author blanked. Personal and
-- behavioural data (activity events, push subscriptions, read receipts,
-- notification assignments, the profile itself) still goes, and is deleted
-- explicitly by the API rather than relied on here.
--
-- marketing_orders already used SET NULL throughout and needs no change; it also
-- stores submitter_name/email as text, so a kept order still shows who placed it.

-- ── Consults ────────────────────────────────────────────────────────────────
alter table public.leads
  alter column created_by drop not null;
alter table public.leads
  drop constraint if exists leads_created_by_fkey;
alter table public.leads
  add constraint leads_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- The one that hard-blocks deletion today.
alter table public.sales_regions
  alter column rep_user_id drop not null;
alter table public.sales_regions
  drop constraint if exists sales_regions_rep_user_id_fkey;
alter table public.sales_regions
  add constraint sales_regions_rep_user_id_fkey
  foreign key (rep_user_id) references public.profiles(id) on delete set null;

-- ── Commission claims (financial records — must outlive the claimant) ────────
alter table public.commission_claims
  alter column created_by drop not null;
alter table public.commission_claims
  drop constraint if exists commission_claims_created_by_fkey;
alter table public.commission_claims
  add constraint commission_claims_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ── Notable projects ────────────────────────────────────────────────────────
alter table public.notable_projects
  alter column created_by drop not null;
alter table public.notable_projects
  drop constraint if exists notable_projects_created_by_fkey;
alter table public.notable_projects
  add constraint notable_projects_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ── Order chat (keeping one half of a thread and dropping the other reads as
--    corruption, so both sides survive attributed to nobody) ─────────────────
alter table public.marketing_order_messages
  alter column author_id drop not null;
alter table public.marketing_order_messages
  drop constraint if exists marketing_order_messages_author_id_fkey;
alter table public.marketing_order_messages
  add constraint marketing_order_messages_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

-- ── Support tickets + their replies ─────────────────────────────────────────
alter table public.support_requests
  alter column created_by drop not null;
alter table public.support_requests
  drop constraint if exists support_requests_created_by_fkey;
alter table public.support_requests
  add constraint support_requests_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.support_messages
  alter column author_id drop not null;
alter table public.support_messages
  drop constraint if exists support_messages_author_id_fkey;
alter table public.support_messages
  add constraint support_messages_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

notify pgrst, 'reload schema';
