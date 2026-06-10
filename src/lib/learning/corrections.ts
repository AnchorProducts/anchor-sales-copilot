// Reads verified sales-team corrections back into the answering pipeline so the
// copilot actually applies them. Pairs with the corrections written by
// /api/corrections and the match_knowledge_corrections RPC. Fully defensive:
// any failure (RPC/columns not migrated yet, embedding error) returns [] so the
// chat route degrades to its normal behavior instead of erroring.
import { embedText } from "@/lib/learning/embeddings";

export type MatchedCorrection = {
  id: string;
  user_message: string | null;
  assistant_message: string | null;
  correction: string;
  note: string | null;
  similarity: number;
};

type Supa = any;

export async function retrieveCorrections(
  supabase: Supa,
  query: string,
  opts?: { matchCount?: number; minSimilarity?: number }
): Promise<MatchedCorrection[]> {
  const matchCount = opts?.matchCount ?? 3;
  const minSimilarity = opts?.minSimilarity ?? 0.8;

  try {
    const embedding = await embedText(query);

    const { data, error } = await supabase.rpc("match_knowledge_corrections", {
      query_embedding: embedding,
      match_count: matchCount,
    });

    if (error) {
      console.error("retrieveCorrections RPC error:", error);
      return [];
    }

    return ((data || []) as MatchedCorrection[]).filter(
      (c) => (c.similarity ?? 0) >= minSimilarity
    );
  } catch (e) {
    console.error("retrieveCorrections error:", e);
    return [];
  }
}
