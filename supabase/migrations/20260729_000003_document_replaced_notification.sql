-- Retarget the document notification: fire on a document being REPLACED, not on
-- someone typing a revision label.
--
-- The old path was a QMS-style "revision label" text field on one screen
-- (InternalDocsList, only reachable for the single internal_assets docs_list
-- product). No asset ever had a revision set, so it never fired — but it would
-- have, on the first person to type in that box. The team only wants to be told
-- when a library document is actually replaced with new bytes, which is a real,
-- deliberate action taken from the Knowledge admin.
--
-- After this migration the notification is sent from the application
-- (src/app/api/admin/assets/upload commit phase) rather than from a DB trigger,
-- so it fires exactly once per completed replace and can name the file.

-- ── 1. Stop the revision-label trigger ──────────────────────────────────────
-- This is what called the `revision-change-email` edge function via pg_net.
-- Dropping it makes that function unreachable; it can stay deployed harmlessly.
drop trigger if exists trg_assets_notify_revision_change on public.assets;
drop function if exists public.assets_notify_revision_change();

-- ── 2. Carry existing recipients over to the new key ────────────────────────
-- Renaming rather than adding a second key, so nobody silently stops being
-- notified. Guarded against a same-key collision in case the new key already
-- has rows (re-run safety).
update public.notification_tool_assignments a
   set tool_key = 'document_replaced'
 where a.tool_key = 'document_revision'
   and not exists (
     select 1 from public.notification_tool_assignments b
      where b.tool_key = 'document_replaced' and b.user_id = a.user_id
   );

update public.notification_tool_emails e
   set tool_key = 'document_replaced'
 where e.tool_key = 'document_revision'
   and not exists (
     select 1 from public.notification_tool_emails f
      where f.tool_key = 'document_replaced' and f.email = e.email
   );

-- Anything left under the old key is a duplicate of a row that already existed
-- under the new one — drop it rather than leaving an unreachable assignment.
delete from public.notification_tool_assignments where tool_key = 'document_revision';
delete from public.notification_tool_emails      where tool_key = 'document_revision';

-- ── 3. The revision column itself ──────────────────────────────────────────
-- Deliberately NOT dropped. It is unused (zero rows have a value) and the app no
-- longer reads or writes it, but dropping a column is irreversible and the
-- portal shares this table. Left in place as dead weight; drop it later if the
-- portal is confirmed not to reference it.
