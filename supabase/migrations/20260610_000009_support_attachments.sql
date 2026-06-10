-- Image attachments on support messages. Stored as an array of metadata objects
-- ({ path, filename, content_type, size }); the file bytes live in the knowledge
-- bucket under support/<request_id>/. Lets reps attach screenshots to a request
-- (and replies) for clearer, higher-quality feedback.
alter table public.support_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
