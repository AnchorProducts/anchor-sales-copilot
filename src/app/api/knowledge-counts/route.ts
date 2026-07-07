// src/app/api/knowledge-counts/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountReqItem = {
  id: string;              // product id
  section: string | null;  // "solution" | "anchor" | "internal_assets"
  name: string;            // product name
};

type CountRes = Record<string, { public: number; internal: number }>;

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// folder mapping: product.section -> bucket folder
function folderForSection(section: string | null) {
  if (section === "anchor") return "anchor";
  if (section === "solution") return "solutions";
  // internal_assets shouldn't show in public list counts, but keep it safe
  return "internal";
}

type StorageItem = { name: string; id: string | null };

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

    for (const item of (data || []) as StorageItem[]) {
      const full = dir ? `${dir}/${item.name}` : item.name;
      const isFolder = item.id === null;
      if (isFolder) queue.push(full);
      else out.push(full);
    }
  }

  return out;
}

function classifyCounts(paths: string[]) {
  // internal if it lives under /internal/ anywhere (you can tweak this rule)
  let pub = 0;
  let internal = 0;

  for (const p of paths) {
    if (p.startsWith("internal/")) internal++;
    else pub++;
  }

  return { public: pub, internal };
}

export async function POST(req: Request) {
  try {
    // require auth (same pattern as your other routes)
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth?.user ?? null;
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const items = (body?.items || []) as CountReqItem[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ counts: {} satisfies CountRes }, { status: 200 });
    }

    const BUCKET = "knowledge";
    const counts: CountRes = {};

    // count each product prefix. Each solution's spec (if any) lives under its
    // own folder and is counted here — there is no shared global spec padding.
    for (const it of items) {
      const folder = folderForSection(it.section);
      const slug = slugify(it.name);
      const prefix = `${folder}/${slug}`;

      const paths = await listRecursive(BUCKET, prefix);
      const c = classifyCounts(paths);

      counts[it.id] = {
        public: c.public,
        internal: c.internal,
      };
    }

    return NextResponse.json({ counts }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
