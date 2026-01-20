// src/app/api/knowledge-list/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StorageItem = { name: string; id: string | null; metadata: any | null };

async function listRecursive(bucket: string, prefix: string) {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const out: string[] = [];
  const queue: string[] = [cleanPrefix];
  const seen = new Set<string>();

  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);

    const { data, error } = await supabaseAdmin.storage.from(bucket).list(dir, {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;

    const items = (data || []) as StorageItem[];

    for (const item of items) {
      const fullPath = dir ? `${dir}/${item.name}` : item.name;
      const isFolder = item.id === null;

      if (isFolder) queue.push(fullPath);
      else out.push(fullPath);
    }
  }

  return out;
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const prefixRaw = (url.searchParams.get("prefix") || "").trim();
    const prefix = prefixRaw.replace(/^\/+|\/+$/g, "");
    if (!prefix) return NextResponse.json({ paths: [] }, { status: 200 });

    const paths = await listRecursive("knowledge", prefix);
    return NextResponse.json({ paths }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
