import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "knowledge";
const PAGE_SIZE = 1000;

type StorageEntry = { name: string; id?: string | null; metadata?: any | null };

function cleanPrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

function isInternalPath(path: string) {
  const p = String(path || "").toLowerCase();
  return (
    p.includes("/internal/") ||
    p.startsWith("internal/") ||
    p.includes("/pricebook/") ||
    p.includes("/test/") ||
    p.includes("/test-reports/")
  );
}

async function listRecursive(prefix: string): Promise<string[]> {
  const root = cleanPrefix(prefix);
  if (!root) return [];

  const out: string[] = [];
  const queue: string[] = [root];
  const seen = new Set<string>();

  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);

    let offset = 0;
    // Page through the directory.
    for (;;) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(dir, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) break;
      const entries = (data || []) as StorageEntry[];
      if (!entries.length) break;

      for (const e of entries) {
        const fullPath = `${dir}/${e.name}`;
        const isFolder = !e.id && (!e.metadata || Object.keys(e.metadata).length === 0);
        if (isFolder) {
          queue.push(fullPath);
        } else {
          out.push(fullPath);
        }
      }

      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return Array.from(new Set(out)).sort();
}

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as any)?.role || "");
  if (role !== "admin" && role !== "anchor_rep") {
    return { error: "Forbidden", status: 403 as const };
  }
  return { user: auth.user, role };
}

function basename(p: string) {
  const s = String(p || "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function titleFromPath(p: string) {
  return basename(p)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function parentSolutionSlug(p: string) {
  // solutions/<slug>/...  →  <slug>
  const m = p.match(/^solutions\/([^/]+)/i);
  return m ? m[1].toLowerCase() : "";
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // 1) Walk the Resource Library: every file under solutions/, no internal/test/pricebook.
  const allPaths = await listRecursive("solutions");
  const libraryPaths = allPaths.filter((p) => !isInternalPath(p));

  // 2) Map storage parent slugs to product names so the admin sees a friendly
  //    parent ("Existing Mechanical Tie Down") instead of a slug.
  const slugSet = new Set(libraryPaths.map(parentSolutionSlug).filter(Boolean));
  const productsBySlug: Record<string, string> = {};
  if (slugSet.size > 0) {
    const { data: prods } = await supabaseAdmin
      .from("products")
      .select("name")
      .eq("section", "solution");
    for (const r of (prods || []) as any[]) {
      const slug = String(r?.name || "")
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (slug && slugSet.has(slug)) productsBySlug[slug] = r.name;
    }
  }

  // 3) Look up matching knowledge_documents rows in a single query so admin
  //    actions (status / allowed) work for files that have been ingested.
  let kdRows: Record<string, any> = {};
  if (libraryPaths.length > 0) {
    const { data } = await supabaseAdmin
      .from("knowledge_documents")
      .select("id,title,status,allowed,audience,source_path,category,updated_at,created_at")
      .in("source_path", libraryPaths);
    for (const r of (data || []) as any[]) kdRows[String(r.source_path)] = r;
  }

  // 4) Compose the final list.
  const items = libraryPaths.map((p) => {
    const kd = kdRows[p] || null;
    const slug = parentSolutionSlug(p);
    return {
      path: p,
      filename: basename(p),
      title: kd?.title || titleFromPath(p),
      product_name: productsBySlug[slug] || slug || null,
      knowledge_document_id: kd?.id || null,
      status: kd?.status || null,
      allowed: kd?.allowed ?? null,
      category: kd?.category || null,
      indexed: !!kd,
      updated_at: kd?.updated_at || null,
      created_at: kd?.created_at || null,
    };
  });

  return NextResponse.json({ items });
}
