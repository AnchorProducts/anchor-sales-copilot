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

    const [{ data: users }, { data: rows }, { data: emailRows }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,full_name,email,role")
        .order("full_name", { ascending: true }),
      supabaseAdmin.from("notification_tool_assignments").select("tool_key,user_id"),
      supabaseAdmin.from("notification_tool_emails").select("tool_key,email"),
    ]);

    const assignments: Record<string, string[]> = {};
    for (const r of (rows || []) as { tool_key: string; user_id: string }[]) {
      (assignments[r.tool_key] ||= []).push(r.user_id);
    }

    const toolEmails: Record<string, string[]> = {};
    for (const r of (emailRows || []) as { tool_key: string; email: string }[]) {
      (toolEmails[r.tool_key] ||= []).push(r.email);
    }

    // Whether THIS deployment can actually send pushes (has VAPID keys). Sends
    // run on whatever server handles a form POST, so each deployment needs them.
    const pushConfigured = Boolean(
      (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
        process.env.VAPID_PRIVATE_KEY
    );

    return NextResponse.json({
      tools: NOTIFICATION_TOOLS,
      users: users || [],
      assignments,
      toolEmails,
      pushConfigured,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load." },
      { status: 500 }
    );
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PUT: replace a tool's assigned users and/or its raw email list. Body may carry
// { tool_key, user_ids } and/or { tool_key, emails } — only the provided field
// is updated.
export async function PUT(req: Request) {
  try {
    const gate = await requireAdmin();
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await req.json().catch(() => null);
    const toolKey = String(body?.tool_key || "");
    if (!isNotificationTool(toolKey)) {
      return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
    }

    if ("user_ids" in (body || {})) {
      const userIds = Array.isArray(body.user_ids)
        ? Array.from(new Set(body.user_ids.filter((x: unknown) => typeof x === "string")))
        : [];
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
    }

    if ("emails" in (body || {})) {
      const emails = Array.isArray(body.emails)
        ? Array.from(
            new Set(
              body.emails
                .filter((x: unknown) => typeof x === "string")
                .map((e: string) => e.trim().toLowerCase())
                .filter(Boolean)
            )
          ) as string[]
        : [];
      for (const e of emails) {
        if (!EMAIL_RE.test(e)) {
          return NextResponse.json({ error: `Invalid email: ${e}` }, { status: 400 });
        }
      }
      const { error: delErr } = await supabaseAdmin
        .from("notification_tool_emails")
        .delete()
        .eq("tool_key", toolKey);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      if (emails.length > 0) {
        const insErr = (
          await supabaseAdmin
            .from("notification_tool_emails")
            .insert(emails.map((email) => ({ tool_key: toolKey, email })))
        ).error;
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, tool_key: toolKey });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save." },
      { status: 500 }
    );
  }
}
