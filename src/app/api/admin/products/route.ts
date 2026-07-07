import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { prefixCandidatesForProduct } from "@/lib/assets/storagePrefixes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWLEDGE_BUCKET = "knowledge";
const STORAGE_PAGE_SIZE = 1000;

// Recursively list every file (not folders) under a prefix in the knowledge bucket.
async function listFilesRecursive(prefix: string): Promise<string[]> {
  const root = String(prefix || "").trim().replace(/^\/+|\/+$/g, "");
  if (!root) return [];

  const out: string[] = [];
  const queue: string[] = [root];
  const seen = new Set<string>();

  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);

    let offset = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin.storage
        .from(KNOWLEDGE_BUCKET)
        .list(dir, { limit: STORAGE_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) break;
      const items = data || [];
      if (items.length === 0) break;

      for (const item of items as Array<{ name?: string; id?: string | null; metadata?: unknown }>) {
        const name = String(item?.name || "").trim();
        if (!name) continue;
        const hasExt = name.includes(".");
        const isFolder = item.id === null || (!hasExt && item.metadata == null);
        const fullPath = dir ? `${dir}/${name}` : name;
        if (isFolder) queue.push(fullPath);
        else out.push(fullPath);
      }

      if (items.length < STORAGE_PAGE_SIZE) break;
      offset += STORAGE_PAGE_SIZE;
    }
  }

  return Array.from(new Set(out));
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
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

function clean(v: any) {
  return String(v || "").trim();
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin inserts cannot bypass RLS." },
      { status: 500 }
    );
  }

  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json().catch(() => ({}));
  const name = clean(body.name);
  const section = clean(body.section) || "solution";
  const series = clean(body.series) || null;
  const sku = clean(body.sku) || null;
  // The group a hand-created solution box is filed under (catalog category label
  // or a new admin-named one). Only meaningful for section=solution.
  const solutionGroup = section === "solution" ? (clean(body.solutionGroup) || null) : null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!["solution", "anchor", "internal_assets"].includes(section)) {
    return NextResponse.json({ error: "invalid section" }, { status: 400 });
  }

  // If a row with this name already exists, return its id (case-insensitive).
  // If it was previously deleted (hidden tombstone), un-hide + reactivate it so
  // recreating a box with the same name restores it.
  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id,hidden,active")
    .ilike("name", name)
    .maybeSingle();

  if (existing?.id) {
    // Restore a deleted box, and (re)apply the chosen group if one was passed.
    const ex = existing as { id: string; hidden?: boolean | null; active?: boolean | null };
    const restore: Record<string, unknown> = {};
    if (ex.hidden || ex.active === false) {
      restore.hidden = false;
      restore.active = true;
    }
    if (solutionGroup) restore.solution_group = solutionGroup;
    if (Object.keys(restore).length > 0) {
      await supabaseAdmin.from("products").update(restore).eq("id", existing.id);
    }
    return NextResponse.json({ id: existing.id, created: false });
  }

  const { data, error: insertErr } = await supabaseAdmin
    .from("products")
    .insert({ name, section, series, sku, active: true, solution_group: solutionGroup })
    .select("id")
    .single();

  if (insertErr || !data?.id) {
    return NextResponse.json(
      { error: insertErr?.message || "Failed to create product" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id, created: true });
}

// Update a tacklebox — currently the admin "Active" switch (and optional
// name/series/sku edits). Setting active=false hides it from the resource
// library (it falls back to a coming-soon placeholder for catalog items).
export async function PATCH(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin updates cannot bypass RLS." },
      { status: 500 }
    );
  }

  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json().catch(() => ({}));
  const id = clean(body.id);
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if ("series" in body) patch.series = clean(body.series) || null;
  if ("sku" in body) patch.sku = clean(body.sku) || null;
  if ("section" in body) {
    const section = clean(body.section);
    const allowed = ["solution", "anchor", "internal_assets"];
    if (!section || !allowed.includes(section)) {
      return NextResponse.json(
        { error: `section must be one of: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }
    patch.section = section;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error: updErr } = await supabaseAdmin
    .from("products")
    .update(patch)
    .eq("id", id)
    .select("id,active")
    .single();

  if (updErr || !data?.id) {
    return NextResponse.json({ error: updErr?.message || "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ updated: true, id: data.id, active: data.active });
}

// Delete an entire tacklebox: its DB record, its asset/pending rows, and
// (when purge=1) the files under its resolved knowledge-bucket folder.
export async function DELETE(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin deletes cannot bypass RLS." },
      { status: 500 }
    );
  }

  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const id = clean(url.searchParams.get("id"));
  const purgeStorage = url.searchParams.get("purge") === "1";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: product, error: loadErr } = await supabaseAdmin
    .from("products")
    .select("id,name,section,series")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!product) {
    return NextResponse.json({ error: "Tacklebox not found" }, { status: 404 });
  }

  // Optionally purge the underlying storage files. We resolve the folder the
  // same way the tacklebox does (first non-empty candidate prefix). This only
  // ever lists files under the product's own folder, including its spec.
  let removedFiles = 0;
  if (purgeStorage) {
    const candidates = prefixCandidatesForProduct(product as { name: string; series?: string | null; section?: string | null });
    let files: string[] = [];
    for (const candidate of candidates) {
      const got = await listFilesRecursive(candidate);
      if (got.length > 0) {
        files = got;
        break;
      }
    }
    const toRemove = files;
    if (toRemove.length > 0) {
      // Supabase storage caps removes per call; chunk to be safe.
      for (let i = 0; i < toRemove.length; i += 100) {
        const chunk = toRemove.slice(i, i + 100);
        const { error: rmErr } = await supabaseAdmin.storage.from(KNOWLEDGE_BUCKET).remove(chunk);
        if (rmErr) {
          return NextResponse.json(
            { error: `Failed to delete files: ${rmErr.message}` },
            { status: 500 }
          );
        }
        removedFiles += chunk.length;
      }
    }
  }

  // Remove child rows (explicit, regardless of FK cascade).
  await supabaseAdmin.from("assets").delete().eq("product_id", id);
  await supabaseAdmin.from("pending_uploads").delete().eq("product_id", id);

  // Soft-delete the product itself: keep a hidden=true tombstone instead of
  // dropping the row. For a catalog-driven solution, a dropped row only reverts
  // the card to its "Coming soon" placeholder; the hidden flag lets AssetsBrowser
  // suppress the card entirely so the button actually disappears. Re-creating a
  // box with the same name un-hides it (POST above). active=false keeps it out of
  // every active-only query in the meantime.
  const { error: delErr } = await supabaseAdmin
    .from("products")
    .update({ hidden: true, active: false })
    .eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, removedFiles });
}
