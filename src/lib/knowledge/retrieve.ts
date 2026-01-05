// src/lib/knowledge/retrieve.ts
import { embedText } from "@/lib/learning/embeddings";

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  title: string | null;
  content: string;
  similarity: number;
  feedback_score?: number;
  downvotes?: number;
};

type Supa = any;

export async function retrieveKnowledge(
  supabase: Supa,
  query: string,
  opts?: { matchCount?: number; category?: string | null; productTags?: string[] | null }
): Promise<RetrievedChunk[]> {
  const matchCount = opts?.matchCount ?? 8;

  const embedding = await embedText(query);

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: embedding,
    match_count: matchCount,
    // keep these optional if your RPC supports them
    filter_category: opts?.category ?? null,
    filter_product_tags: opts?.productTags ?? null,
  });

  if (error) {
    console.error("retrieveKnowledge RPC error:", error);
    return [];
  }

  return (data || []) as RetrievedChunk[];
}

