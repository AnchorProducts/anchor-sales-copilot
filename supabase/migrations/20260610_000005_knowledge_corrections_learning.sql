-- Make sales-team corrections actually teach the copilot.
--
-- Today knowledge_corrections is write-only: corrections are stored but never
-- read back into the answering pipeline. This migration adds the columns needed
-- to match a new question against past corrections, plus an RPC the chat route
-- calls to pull the most relevant ones and inject them into the prompt.
--
-- Embedding dimension 1536 = OpenAI text-embedding-3-small (see
-- src/lib/learning/embeddings.ts), matching knowledge_chunks.embedding.

-- pgvector is already installed (knowledge_chunks uses it); guard just in case.
create extension if not exists vector;

alter table public.knowledge_corrections
  add column if not exists user_message      text,
  add column if not exists assistant_message text,
  add column if not exists embedding         vector(1536),
  -- Admin on/off switch for whether the copilot applies this correction.
  -- Defaults true so a submitted correction takes effect immediately; an admin
  -- can flip it off in the Knowledge → Corrections tab without deleting it.
  add column if not exists active            boolean not null default true;

-- ANN index. Cosine distance to match the RPC below. Safe to drop if a given
-- pgvector build dislikes ivfflat — at testing volume a seq scan is fine too.
create index if not exists knowledge_corrections_embedding_idx
  on public.knowledge_corrections
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Returns the corrections most similar to a question, newest-relevant first.
-- Skips rejected ones so admins can veto a bad correction by setting status.
create or replace function public.match_knowledge_corrections(
  query_embedding vector(1536),
  match_count int default 3
)
returns table (
  id                 uuid,
  user_message       text,
  assistant_message  text,
  correction         text,
  note               text,
  similarity         float
)
language sql
stable
as $$
  select
    kc.id,
    kc.user_message,
    kc.assistant_message,
    kc.correction,
    kc.note,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_corrections kc
  where kc.embedding is not null
    and coalesce(kc.active, true)
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
