import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ingestStorageFile, removeKnowledgeForPath } from "@/lib/knowledge/ingestStorageFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SheetType = "sales" | "data" | "install";

const SHEET_CONFIG: Record<SheetType, { baseName: string; categoryKeys: string[] }> = {
  sales: { baseName: "Sales-Sheet", categoryKeys: ["sales_sheet", "sales"] },
  data: { baseName: "Data-Sheet", categoryKeys: ["data_sheet", "data"] },
  install: { baseName: "Install-Sheet", categoryKeys: ["install_sheet", "install_manual", "install"] },
};

function classifySheet(categoryKey: string | null | undefined): SheetType | null {
  const k = String(categoryKey || "").toLowerCase();
  for (const [type, cfg] of Object.entries(SHEET_CONFIG) as [SheetType, typeof SHEET_CONFIG[SheetType]][]) {
    if (cfg.categoryKeys.includes(k)) return type;
  }
  return null;
}

function dirAndExt(path: string): { dir: string; ext: string } {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash) : "";
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot) : "";
  return { dir, ext };
}

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return { ok: false as const, status: 401, error: "Unauthorized" };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (String((prof as any)?.role || "") !== "admin") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, userId: user.id };
}

type PlanEntry = {
  product_id: string;
  sheet_type: SheetType;
  keeper: { asset_id: string; old_path: string; new_path: string; created_at: string | null; renamed: boolean };
  delete: { asset_id: string; path: string; created_at: string | null }[];
};

async function buildPlan(): Promise<PlanEntry[]> {
  const allKeys = Object.values(SHEET_CONFIG).flatMap((c) => c.categoryKeys);

  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,product_id,category_key,path,created_at")
    .in("category_key", allKeys);

  if (error) throw new Error(`assets query failed: ${error.message}`);
  if (!data) return [];

  type Row = { id: string; product_id: string | null; category_key: string; path: string; created_at: string | null };
  const groups = new Map<string, Row[]>();
  for (const raw of data as Row[]) {
    if (!raw.product_id || !raw.path) continue;
    const sheetType = classifySheet(raw.category_key);
    if (!sheetType) continue;
    const key = `${raw.product_id}::${sheetType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(raw);
  }

  const plan: PlanEntry[] = [];
  for (const [key, rows] of groups) {
    const [product_id, sheetTypeStr] = key.split("::");
    const sheetType = sheetTypeStr as SheetType;
    const cfg = SHEET_CONFIG[sheetType];

    rows.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
    const [keeper, ...older] = rows;
    const { dir, ext } = dirAndExt(keeper.path);
    const new_path = dir ? `${dir}/${cfg.baseName}${ext || ".pdf"}` : `${cfg.baseName}${ext || ".pdf"}`;
    plan.push({
      product_id,
      sheet_type: sheetType,
      keeper: {
        asset_id: keeper.id,
        old_path: keeper.path,
        new_path,
        created_at: keeper.created_at,
        renamed: keeper.path !== new_path,
      },
      delete: older.map((r) => ({ asset_id: r.id, path: r.path, created_at: r.created_at })),
    });
  }
  return plan;
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const plan = await buildPlan();
    const summary = {
      groups: plan.length,
      will_rename: plan.filter((p) => p.keeper.renamed).length,
      will_delete: plan.reduce((n, p) => n + p.delete.length, 0),
    };
    return NextResponse.json({ dryRun: true, summary, plan });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Plan failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  if (body?.apply !== true) {
    return NextResponse.json({ error: "Pass { apply: true } to execute. Use GET to preview." }, { status: 400 });
  }

  try {
    const plan = await buildPlan();
    const results = {
      renamed: [] as { asset_id: string; old_path: string; new_path: string }[],
      deleted: [] as { asset_id: string; path: string }[],
      errors: [] as { context: string; error: string }[],
    };

    for (const entry of plan) {
      // Delete older duplicates first so their paths don't collide with the
      // keeper's rename target (e.g. a duplicate already at Sales-Sheet.pdf).
      for (const old of entry.delete) {
        const { error: storageErr } = await supabaseAdmin.storage
          .from("knowledge")
          .remove([old.path]);
        if (storageErr && !/not[_ ]found/i.test(storageErr.message)) {
          results.errors.push({ context: `storage.remove ${old.path}`, error: storageErr.message });
        }
        try { await removeKnowledgeForPath(old.path); } catch (e: any) {
          results.errors.push({ context: `removeKnowledgeForPath ${old.path}`, error: e?.message || String(e) });
        }
        const { error: rowErr } = await supabaseAdmin.from("assets").delete().eq("id", old.asset_id);
        if (rowErr) {
          results.errors.push({ context: `assets.delete ${old.asset_id}`, error: rowErr.message });
        } else {
          results.deleted.push({ asset_id: old.asset_id, path: old.path });
        }
      }

      // Rename the keeper if its path isn't already canonical.
      if (entry.keeper.renamed) {
        const { error: moveErr } = await supabaseAdmin.storage
          .from("knowledge")
          .move(entry.keeper.old_path, entry.keeper.new_path);
        if (moveErr) {
          results.errors.push({ context: `storage.move ${entry.keeper.old_path}`, error: moveErr.message });
          continue;
        }

        const { error: updErr } = await supabaseAdmin
          .from("assets")
          .update({ path: entry.keeper.new_path })
          .eq("id", entry.keeper.asset_id);
        if (updErr) {
          results.errors.push({ context: `assets.update ${entry.keeper.asset_id}`, error: updErr.message });
        }

        try { await removeKnowledgeForPath(entry.keeper.old_path); } catch (e: any) {
          results.errors.push({ context: `removeKnowledgeForPath ${entry.keeper.old_path}`, error: e?.message || String(e) });
        }
        try {
          await ingestStorageFile({
            path: entry.keeper.new_path,
            title: `${SHEET_CONFIG[entry.sheet_type].baseName}`,
            category: `${entry.sheet_type}_sheet`,
            productTags: [],
            createdBy: gate.userId,
          });
        } catch (e: any) {
          results.errors.push({ context: `ingestStorageFile ${entry.keeper.new_path}`, error: e?.message || String(e) });
        }

        results.renamed.push({
          asset_id: entry.keeper.asset_id,
          old_path: entry.keeper.old_path,
          new_path: entry.keeper.new_path,
        });
      }
    }

    return NextResponse.json({
      applied: true,
      summary: {
        renamed: results.renamed.length,
        deleted: results.deleted.length,
        errors: results.errors.length,
      },
      ...results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Apply failed" }, { status: 500 });
  }
}
