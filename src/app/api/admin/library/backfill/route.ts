import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/portalAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  IMAGE_EXTS,
  extOf,
  normalizePrefix,
  prefixCandidatesForProduct,
  visibilityFromPath,
} from "@/lib/assets/storagePrefixes";
import { categoryKeyFromPath, titleFromPath } from "@/lib/assets/categoryFromPath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ============================================================================
 * Index the `knowledge` bucket into the shared `assets` table.
 *
 * WHY: this app's Resource Library has always listed the bucket directly, while
 * the Anchor Internal Portal's Documents view reads `assets`. The bucket holds
 * far more files than the table indexes, so the two surfaces disagree — and
 * pointing the app at `assets` alone would hide most of the library. The fix is
 * to make the shared table complete, which fixes BOTH surfaces at once.
 *
 * Idempotent: keyed on `path`, so a re-run only picks up new files. Never
 * updates or deletes an existing row — hand-curated titles and categories win.
 *
 * Product attribution and category/visibility inference reuse the app's real
 * helpers (storagePrefixes / categoryFromPath), so an indexed file lands where
 * the tackle box already showed it.
 *
 *   GET  /api/admin/library/backfill          → dry run: what WOULD be indexed
 *   POST /api/admin/library/backfill          → dry run (same as GET)
 *   POST /api/admin/library/backfill { write: true }  → insert
 * ==========================================================================*/

const BUCKET = "knowledge";

// Operational prefixes that are storage, not library content: marketing-order
// photo attachments uploaded by requesters. Indexing these would put customer
// snapshots in the document library.
const EXCLUDED_PREFIXES = ["marketing-orders/"];

type BucketFile = { path: string; updatedAt: string | null };

async function listAll(): Promise<BucketFile[]> {
  const out: BucketFile[] = [];
  const queue: string[] = [""];
  const seen = new Set<string>();

  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);

    let offset = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(dir, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data || data.length === 0) break;

      for (const it of data as unknown as Array<Record<string, unknown>>) {
        const name = String(it?.name || "").trim();
        if (!name) continue;
        const full = dir ? `${dir}/${name}` : name;
        const isFolder = it.id === null || (!name.includes(".") && it.metadata == null);
        if (isFolder) queue.push(full);
        else out.push({ path: full, updatedAt: (it.updated_at as string) ?? (it.created_at as string) ?? null });
      }

      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  return out;
}

async function plan() {
  const [files, existingRes, productsRes] = await Promise.all([
    listAll(),
    supabaseAdmin.from("assets").select("path"),
    supabaseAdmin.from("products").select("id,name,series,section"),
  ]);
  if (existingRes.error) throw new Error(`assets read failed: ${existingRes.error.message}`);

  const known = new Set(
    ((existingRes.data ?? []) as Array<{ path: string | null }>).map((r) => r.path).filter(Boolean) as string[]
  );

  // Build prefix → product_id from the app's single source of truth. Longest
  // prefix first so a nested override beats its parent folder.
  const products = (productsRes.data ?? []) as Array<{
    id: string;
    name: string;
    series: string | null;
    section: string | null;
  }>;
  const prefixMap: Array<{ prefix: string; id: string }> = [];
  for (const p of products) {
    for (const candidate of prefixCandidatesForProduct(p)) {
      const clean = normalizePrefix(candidate).toLowerCase();
      if (clean) prefixMap.push({ prefix: clean, id: p.id });
    }
  }
  prefixMap.sort((a, b) => b.prefix.length - a.prefix.length);

  function productIdFor(path: string): string | null {
    const p = path.toLowerCase();
    for (const { prefix, id } of prefixMap) if (p.startsWith(`${prefix}/`)) return id;
    return null;
  }

  const skippedExcluded: string[] = [];
  const rows: Array<Record<string, unknown>> = [];

  for (const f of files) {
    if (known.has(f.path)) continue;
    if (EXCLUDED_PREFIXES.some((pre) => f.path.toLowerCase().startsWith(pre))) {
      skippedExcluded.push(f.path);
      continue;
    }
    rows.push({
      title: titleFromPath(f.path),
      path: f.path,
      type: IMAGE_EXTS.has(extOf(f.path)) ? "image" : "document",
      category_key: categoryKeyFromPath(f.path),
      visibility: visibilityFromPath(f.path),
      product_id: productIdFor(f.path),
      scope: "product",
      last_updated: f.updatedAt,
    });
  }

  const byCategory: Record<string, number> = {};
  const byVisibility: Record<string, number> = {};
  let withProduct = 0;
  for (const r of rows) {
    const key = (r.category_key as string) ?? "(uncategorized)";
    byCategory[key] = (byCategory[key] ?? 0) + 1;
    byVisibility[r.visibility as string] = (byVisibility[r.visibility as string] ?? 0) + 1;
    if (r.product_id) withProduct++;
  }

  return {
    bucketFiles: files.length,
    alreadyIndexed: known.size,
    excluded: skippedExcluded.length,
    toInsert: rows.length,
    matchedToProduct: withProduct,
    unmatched: rows.length - withProduct,
    byCategory,
    byVisibility,
    sample: rows.slice(0, 15).map((r) => ({
      path: r.path,
      category_key: r.category_key,
      visibility: r.visibility,
      product_id: r.product_id,
    })),
    rows,
  };
}

export async function GET() {
  if (!(await requireAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { rows, ...summary } = await plan();
    void rows;
    return NextResponse.json({ dryRun: true, ...summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const write = body?.write === true;

  try {
    const { rows, ...summary } = await plan();
    if (!write) return NextResponse.json({ dryRun: true, ...summary });

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabaseAdmin.from("assets").insert(chunk);
      if (error) {
        return NextResponse.json(
          { error: `insert failed after ${inserted}: ${error.message}`, inserted },
          { status: 500 }
        );
      }
      inserted += chunk.length;
    }
    return NextResponse.json({ dryRun: false, ...summary, inserted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
