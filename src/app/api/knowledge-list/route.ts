// src/app/api/knowledge-list/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StorageItem = {
  name: string;
  id?: string | null;
  metadata?: any | null;
};

const PAGE_SIZE = 1000;

function cleanPrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

async function listRecursive(bucket: string, prefix: string) {
  const root = cleanPrefix(prefix);
  const out: string[] = [];
  const queue: string[] = [root];
  const seen = new Set<string>();

  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);

    let offset = 0;

    for (;;) {
      const { data, error } = await supabaseAdmin.storage.from(bucket).list(dir, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) throw error;

      const items = (data || []) as StorageItem[];
      if (items.length === 0) break;

      for (const item of items) {
        const name = String(item?.name || "").trim();
        if (!name) continue;

        // ✅ FIX: metadata is not reliable; id is.
        // Folders usually have id === null.
        // Fallback: if no extension and metadata null, treat as folder.
        const hasExt = name.includes(".");
        const isFolder = item.id === null || (!hasExt && item.metadata == null);

        const fullPath = dir ? `${dir}/${name}` : name;

        if (isFolder) queue.push(fullPath);
        else out.push(fullPath);
      }

      if (items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return Array.from(new Set(out)).sort();
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const prefixRaw = (url.searchParams.get("prefix") || "").trim();
    const prefix = cleanPrefix(prefixRaw);

    if (!prefix) return NextResponse.json({ paths: [] }, { status: 200 });

    const paths = await listRecursive("knowledge", prefix);
    return NextResponse.json({ paths }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
