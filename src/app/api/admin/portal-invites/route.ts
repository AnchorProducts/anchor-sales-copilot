import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/portalAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PORTAL_LEVELS, PORTAL_TEAMS } from "@/lib/portalRoles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * Admin CRUD for the shared authorized-emails list (portal_invites).
 *   GET    → list all authorized emails
 *   POST   → add/authorize an email   { email, role, team? }
 *   PATCH  → change level/team        { email, role, team? }
 *   DELETE → remove (revoke) an email { email }
 *
 * `role` is the access LEVEL (admin | internal); `team` is optional
 * (marketing | sales | operations | leadership).
 *
 * This is the SAME table the Anchor Internal Portal's admin manages — edits
 * from either surface are immediately visible in the other. Mirrors the
 * portal's /api/portal/admin/invites contract on purpose.
 *
 * Every handler is admin-guarded server-side; writes use the service-role
 * client (portal_invites is otherwise service-role only). Fails closed.
 * ==========================================================================*/

const VALID_LEVELS = PORTAL_LEVELS.map((r) => r.value);
const VALID_TEAMS = PORTAL_TEAMS.map((t) => t.value);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Validate + normalize the optional team; returns null for "no team". */
function cleanTeam(input: unknown): string | null {
  const t = String(input ?? "").trim().toLowerCase();
  return t && VALID_TEAMS.includes(t as never) ? t : null;
}

function readEmailAndLevel(body: Record<string, unknown>) {
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = String(body?.role ?? "").trim().toLowerCase();
  const team = cleanTeam(body?.team);
  if (!EMAIL_RE.test(email)) return { error: "Invalid email." as const };
  if (!VALID_LEVELS.includes(role as never)) return { error: "Invalid level." as const };
  return { email, role, team };
}

// Fresh response each call — a single shared Response body can only be sent once.
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET() {
  if (!(await requireAdminUser())) return forbidden();

  const { data, error } = await supabaseAdmin
    .from("portal_invites")
    .select("email, role, team, status, created_at, issued_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdminUser())) return forbidden();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = readEmailAndLevel(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("portal_invites")
    .upsert(
      { email: parsed.email, role: parsed.role, team: parsed.team, status: "pending", issued_at: null },
      { onConflict: "email" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!(await requireAdminUser())) return forbidden();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = readEmailAndLevel(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("portal_invites")
    .update({ role: parsed.role, team: parsed.team })
    .eq("email", parsed.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await requireAdminUser();
  if (!admin) return forbidden();

  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body?.email ?? url.searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Invalid email." }, { status: 400 });

  // Guard against an admin removing their own access and locking themselves out.
  if (email === admin.email) {
    return NextResponse.json({ error: "You can't remove your own access." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("portal_invites").delete().eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
