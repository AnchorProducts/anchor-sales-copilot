-- Store the question + answer each feedback rating is about, so admins can see
-- what the user was reacting to (today knowledge_feedback keeps only a rating,
-- an optional note, and ids — no content). The chat UI already sends these; the
-- route was dropping them.
alter table public.knowledge_feedback
  add column if not exists user_message      text,
  add column if not exists assistant_message text;
