import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { insideRepCanAccessOrder } from "@/lib/marketing/territory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v || "").trim();

// An order's submitter, for the inside-rep territory check. Returns the order's
// created_by (null if the order doesn't exist).
async function orderCreatedBy(id: string): Promise<string | null | undefined> {
  const { data } = await supabaseAdmin
    .from("marketing_orders")
    .select("created_by")
    .eq("id", id)
    .maybeSingle();
  return (data as { created_by: string | null } | null)?.created_by;
}

async function getProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  return data as { role: string | null; full_name: string | null; email: string | null } | null;
}

// Resolve the admin names behind a set of activity rows in one batched lookup.
async function withAuthorNames(
  rows: Array<{ admin_id: string | null } & Record<string, unknown>>
) {
  const ids = Array.from(new Set(rows.map((r) => r.admin_id).filter((v): v is string => !!v)));
  const map = new Map<string, { name: string | null; email: string | null }>();
  if (ids.length) {
    const { data: people } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", ids);
    for (const p of (people || []) as any[]) {
      map.set(p.id, { name: clean(p.full_name) || null, email: clean(p.email) || null });
    }
  }
  return rows.map((r) => {
    const who = r.admin_id ? map.get(r.admin_id) : undefined;
    return { ...r, admin_name: who?.name ?? null, admin_email: who?.email ?? null };
  });
}

// GET = the full activity log for an order, newest first. Admin-only — this is
// the internal coordination history of who did what and when.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prof = await getProfile(auth.user.id);
    const role = clean(prof?.role);
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Inside reps may only read the log for orders in their own territory.
    if (
      role === "anchor_rep" &&
      !(await insideRepCanAccessOrder(clean(prof?.email), await orderCreatedBy(id)))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("marketing_order_activity")
      .select("id,from_status,to_status,note,admin_id,created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entries = await withAuthorNames((rows || []) as any[]);
    return NextResponse.json({ me: auth.user.id, entries });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}

// POST = log a standalone note on the order without changing its phase. Lets an
// admin claim an order ("I've got this") or record a step so others don't double
// up. Phase-change notes are written by the main PATCH handler instead.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prof = await getProfile(auth.user.id);
    const role = clean(prof?.role);
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const note = clean(body?.note);
    if (!note) return NextResponse.json({ error: "A note is required." }, { status: 400 });

    const { data: order, error: oErr } = await supabaseAdmin
      .from("marketing_orders")
      .select("status,created_by")
      .eq("id", id)
      .maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    // Inside reps may only log notes on orders in their own territory.
    if (
      role === "anchor_rep" &&
      !(await insideRepCanAccessOrder(clean(prof?.email), (order as any).created_by))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = clean((order as { status: string | null }).status) || "new";

    const { data: row, error } = await supabaseAdmin
      .from("marketing_order_activity")
      .insert({
        order_id: id,
        admin_id: auth.user.id,
        from_status: status,
        to_status: status,
        note,
      })
      .select("id,from_status,to_status,note,admin_id,created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Touch the order so its "last updated" reflects this coordination note too.
    await supabaseAdmin
      .from("marketing_orders")
      .update({ updated_by: auth.user.id, updated_at: new Date().toISOString() })
      .eq("id", id);

    const [entry] = await withAuthorNames([row as any]);
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}
