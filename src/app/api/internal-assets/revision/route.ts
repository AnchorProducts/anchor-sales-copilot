import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetRevisionRow = {
  id: string;
  title: string | null;
  revision: string | null;
  last_updated: string | null;
  updated_by: string | null;
};

// Admin/internal-only: set a document's revision label to match the QMS master.
// The revision-change EMAIL is sent by the assets_notify_revision_change database
// trigger (see migration 20260615_000013), so any revision change — through this
// route OR a raw SQL update — notifies uniformly with no risk of double-sends.
// Only changing the revision triggers a controlled-revision notification.
export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = String((prof as { role?: string } | null)?.role || "");
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { id?: unknown; revision?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
    // Empty string clears the label; otherwise store the trimmed value.
    const nextRevision =
      typeof body?.revision === "string" && body.revision.trim() !== "" ? body.revision.trim() : null;

    // Read the current revision so we only notify on an actual change.
    const { data: current, error: readErr } = await supabaseAdmin
      .from("assets")
      .select("id,title,revision,last_updated,updated_by")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const before = current as AssetRevisionRow;
    if (before.revision === nextRevision) {
      // No-op — nothing changed, so nothing to notify.
      return NextResponse.json({ ok: true, changed: false, asset: before });
    }

    // last_updated is bumped by the assets_touch_last_updated trigger.
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("assets")
      .update({ revision: nextRevision, updated_by: user.id })
      .eq("id", id)
      .select("id,title,revision,last_updated,updated_by")
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    const after = updated as AssetRevisionRow;
    return NextResponse.json({ ok: true, changed: true, asset: after });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update revision." },
      { status: 500 }
    );
  }
}
