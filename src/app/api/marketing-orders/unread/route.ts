import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { insideRepVisibleOrderIds } from "@/lib/marketing/territory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v || "").trim();

// Per-order unread message counts for the current viewer. Unread = messages in
// an order the viewer can see, authored by someone else, newer than the
// viewer's last_read_at for that order (or all of them if never opened).
export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = auth.user.id;

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role,email")
      .eq("id", me)
      .maybeSingle();
    const role = clean((prof as { role?: string } | null)?.role);
    const email = clean((prof as { email?: string } | null)?.email);
    if (role !== "admin" && role !== "anchor_rep" && role !== "external_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Scope the message scan to the orders this viewer can see, so unread counts
    // match the order list: admins → everything; inside reps → orders from their
    // territory; external reps → their own orders.
    let orderIds: string[] | null = null;
    if (role === "anchor_rep") {
      orderIds = await insideRepVisibleOrderIds(email);
      if (orderIds.length === 0) return NextResponse.json({ counts: {}, total: 0 });
    } else if (role !== "admin") {
      const { data: orders } = await supabaseAdmin
        .from("marketing_orders")
        .select("id")
        .eq("created_by", me);
      orderIds = (orders ?? []).map((o) => o.id as string);
      if (orderIds.length === 0) return NextResponse.json({ counts: {}, total: 0 });
    }

    // This viewer's read marks.
    const { data: reads } = await supabaseAdmin
      .from("marketing_order_reads")
      .select("order_id,last_read_at")
      .eq("user_id", me);
    const lastRead = new Map<string, number>();
    for (const r of (reads ?? []) as Array<{ order_id: string; last_read_at: string }>) {
      lastRead.set(r.order_id, Date.parse(r.last_read_at) || 0);
    }

    // Messages authored by other people. Bounded scan; orders by recency.
    let q = supabaseAdmin
      .from("marketing_order_messages")
      .select("order_id,author_id,created_at")
      .neq("author_id", me)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (orderIds) q = q.in("order_id", orderIds);
    const { data: msgs, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts: Record<string, number> = {};
    for (const m of (msgs ?? []) as Array<{ order_id: string; created_at: string }>) {
      const seenAt = lastRead.get(m.order_id) ?? 0;
      if ((Date.parse(m.created_at) || 0) > seenAt) {
        counts[m.order_id] = (counts[m.order_id] || 0) + 1;
      }
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return NextResponse.json({ counts, total });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}
