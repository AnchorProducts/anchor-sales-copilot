-- Make every form/submit notification admin-configurable from /admin/notifications.
-- Adds recipient lists for the two forms that were still env-var / unconfigured:
--   notable_project_emails — Notable Projects submissions
--   support_emails         — Support Queue new-request notifications
--
-- Existing recipient config stays as-is:
--   commission_recipient_email (single), weekly_report_emails (list),
--   marketing_orders_recipients (per-category jsonb). Leads route per-region via
--   Sales Reps. All lists fall back to env vars when empty.

alter table public.notification_settings
  add column if not exists notable_project_emails text[] not null default '{}',
  add column if not exists support_emails text[] not null default '{}';

-- If a single support recipient was previously stored, seed it into the new list.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_settings'
      and column_name = 'support_recipient_email'
  ) then
    update public.notification_settings
      set support_emails = array[support_recipient_email]
      where support_recipient_email is not null
        and support_recipient_email <> ''
        and (support_emails is null or array_length(support_emails, 1) is null);
  end if;
end $$;
