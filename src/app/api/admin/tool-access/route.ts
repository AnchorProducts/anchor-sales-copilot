import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RESTRICTED_TOOL_KEYS, isRestrictedTool } from "@/lib/toolAccess";

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

// GET: who can be assigned, and who currently is, for every restricted tool.
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // Every restricted tool today is internal-audience, so an external rep could
  // be granted access and still never see the tile. Offer only the people the
  // grant can actually do something for.
  const [{ data: users, error: usersError }, { data: rows, error: rowsError }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,full_name,email,role")
      .in("role", ["admin", "anchor_rep"])
      .order("full_name", { ascending: true }),
    supabaseAdmin
      .from("tool_user_access")
      .select("tool_key,user_id")
      .in("tool_key", RESTRICTED_TOOL_KEYS as unknown as string[]),
  ]);

  if (usersError || rowsError) {
    return NextResponse.json(
      { error: usersError?.message || rowsError?.message || "Failed to load." },
      { status: 500 }
    );
  }

  const assignments: Record<string, string[]> = {};
  for (const key of RESTRICTED_TOOL_KEYS) assignments[key] = [];
  for (const r of (rows || []) as { tool_key: string; user_id: string }[]) {
    (assignments[r.tool_key] ||= []).push(r.user_id);
  }

  return NextResponse.json({ users: users || [], assignments });
}

// PUT: replace the whole list for one tool. Sending the full list (rather than
// add/remove deltas) keeps the UI's optimistic state and the table in step even
// if a save is missed.
export async function PUT(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin updates cannot bypass RLS." },
      { status: 500 }
    );
  }

  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const toolKey = String(body.tool_key || "").trim();
  if (!isRestrictedTool(toolKey)) {
    return NextResponse.json({ error: "Unknown restricted tool." }, { status: 400 });
  }
  if (!Array.isArray(body.user_ids)) {
    return NextResponse.json({ error: "user_ids (array) is required" }, { status: 400 });
  }

  const userIds = Array.from(
    new Set(body.user_ids.map((v: unknown) => String(v ?? "").trim()).filter(Boolean))
  ) as string[];

  // Replace the list: drop what's no longer there, then upsert what is. Done in
  // that order so removing the last person leaves no rows behind.
  const del = supabaseAdmin.from("tool_user_access").delete().eq("tool_key", toolKey);
  const { error: delError } = userIds.length
    ? await del.not("user_id", "in", `(${userIds.join(",")})`)
    : await del;
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  if (userIds.length > 0) {
    const { error: upError } = await supabaseAdmin.from("tool_user_access").upsert(
      userIds.map((user_id) => ({
        tool_key: toolKey,
        user_id,
        created_by: gate.user.id,
      })),
      { onConflict: "tool_key,user_id" }
    );
    if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true, tool_key: toolKey, user_ids: userIds });
}
