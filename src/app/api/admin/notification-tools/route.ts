import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NOTIFICATION_TOOLS, isNotificationTool } from "@/lib/push/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (String((prof as { role?: string } | null)?.role || "") !== "admin") {
    return { error: "Forbidden", status: 403 as const };
  }
  return { user: auth.user };
}

// GET: the tool registry, the list of users to assign, and current assignments.
export async function GET() {
  try {
    const gate = await requireAdmin();
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const [{ data: users }, { data: rows }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,full_name,email,role")
        .order("full_name", { ascending: true }),
      supabaseAdmin.from("notification_tool_assignments").select("tool_key,user_id"),
    ]);

    const assignments: Record<string, string[]> = {};
    for (const r of (rows || []) as { tool_key: string; user_id: string }[]) {
      (assignments[r.tool_key] ||= []).push(r.user_id);
    }

    return NextResponse.json({ tools: NOTIFICATION_TOOLS, users: users || [], assignments });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load." },
      { status: 500 }
    );
  }
}

// PUT: replace the full assignee list for one tool. Body: { tool_key, user_ids }.
export async function PUT(req: Request) {
  try {
    const gate = await requireAdmin();
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await req.json().catch(() => null);
    const toolKey = String(body?.tool_key || "");
    if (!isNotificationTool(toolKey)) {
      return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
    }
    const userIds = Array.isArray(body?.user_ids)
      ? Array.from(new Set(body.user_ids.filter((x: unknown) => typeof x === "string")))
      : [];

    // Replace this tool's rows: clear, then re-insert the new set.
    const { error: delErr } = await supabaseAdmin
      .from("notification_tool_assignments")
      .delete()
      .eq("tool_key", toolKey);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    if (userIds.length > 0) {
      const insErr = (
        await supabaseAdmin
          .from("notification_tool_assignments")
          .insert(userIds.map((uid) => ({ tool_key: toolKey, user_id: uid })))
      ).error;
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tool_key: toolKey, user_ids: userIds });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save." },
      { status: 500 }
    );
  }
}
