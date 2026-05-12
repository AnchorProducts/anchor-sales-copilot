-- Track which storage object a knowledge_document came from so we can clean
-- up its embeddings when an admin deletes the file from the Resource Library.

alter table public.knowledge_documents
  add column if not exists source_path text;

create index if not exists knowledge_documents_source_path_idx
  on public.knowledge_documents (source_path)
  where source_path is not null;
