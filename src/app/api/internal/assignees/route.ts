import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * GET /api/internal/assignees
 *
 * Everyone a consult or Project Intake can be handed to: every Anchor account
 * (admin + anchor_rep). External reps are never assignable — they submit work,
 * they don't own it.
 *
 * Deliberately separate from /api/admin/users, which is admin-only and returns
 * the full editable person record. This one is readable by any internal user
 * (an anchor_rep can reassign a consult) and returns only what a picker needs.
 * ==========================================================================*/

const clean = (v: unknown) => String(v ?? "").trim();

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();

    const role = clean((me as { role?: string } | null)?.role);
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["admin", "anchor_rep"]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const assignees = (data ?? [])
      .map((p) => {
        const r = p as { id: string; full_name?: string; email?: string; role?: string };
        return {
          id: r.id,
          name: clean(r.full_name) || clean(r.email) || "Unnamed",
          email: clean(r.email),
          role: clean(r.role),
        };
      })
      // Sort by display name so the picker reads alphabetically. Done here
      // rather than in the query because the name falls back to the email.
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ assignees });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load assignees.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
