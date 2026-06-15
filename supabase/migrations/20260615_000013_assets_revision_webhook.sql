-- Database Webhook: notify the revision owner whenever a document's `revision`
-- label changes — including raw SQL updates, not just the app route. Posts the
-- standard webhook payload to the revision-change-email edge function, which owns
-- the Resend call.
--
-- The function URL + bearer token are read from database settings (NOT hardcoded
-- here, so no secret lands in git). Set them once — see the comment block below.
create extension if not exists pg_net;

create or replace function public.assets_notify_revision_change()
returns trigger
language plpgsql
security definer
as $$
declare
  fn_url   text := current_setting('app.revision_webhook_url', true);
  fn_token text := current_setting('app.revision_webhook_token', true);
begin
  -- The WHEN clause already restricts this to revision changes; only skip if the
  -- webhook URL hasn't been configured yet.
  if fn_url is null or fn_url = '' then
    return new;
  end if;

  -- Best-effort: a webhook failure must never roll back the document update.
  begin
    perform net.http_post(
      url     := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(fn_token, ''),
        'apikey', coalesce(fn_token, '')
      ),
      body    := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'assets',
        'record', to_jsonb(new),
        'old_record', to_jsonb(old)
      )
    );
  exception when others then
    raise warning 'assets revision webhook failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_assets_notify_revision_change on public.assets;
create trigger trg_assets_notify_revision_change
after update on public.assets
for each row
when (old.revision is distinct from new.revision)
execute function public.assets_notify_revision_change();

-- ── One-time configuration (run separately; keeps secrets out of git) ─────────
-- Point the trigger at the deployed edge function and give it a bearer token
-- (the project ANON key is fine — it's public and satisfies verify_jwt):
--
--   alter database postgres
--     set app.revision_webhook_url = 'https://mytlsruwxujfakxzbvtp.supabase.co/functions/v1/revision-change-email';
--   alter database postgres
--     set app.revision_webhook_token = '<YOUR_SUPABASE_ANON_KEY>';
--
-- Settings apply to NEW connections, so reconnect (or restart the API) after.
