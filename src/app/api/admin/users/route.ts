import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["admin", "anchor_rep", "external_rep"]);

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as { role?: string } | null)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

function clean(v: unknown) {
  return String(v || "").trim();
}

function userTypeForRole(role: string): "internal" | "external" {
  return role === "external_rep" ? "external" : "internal";
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const COLS = "id, email, full_name, phone, company, role, user_type, service_state, anchor_commission, created_at";
  const COLS_NO_AC = "id, email, full_name, phone, company, role, user_type, service_state, created_at";

  const first = await supabaseAdmin.from("profiles").select(COLS).order("created_at", { ascending: false });
  // Tolerate the anchor_commission column not being migrated yet.
  const result = first.error
    ? await supabaseAdmin.from("profiles").select(COLS_NO_AC).order("created_at", { ascending: false })
    : first;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ users: (result.data as unknown[]) || [] });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(body.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Email needs to update auth.users (the source of truth for login) AND
  // profiles.email (used by the app for display/filtering).
  const wantEmailChange = Object.prototype.hasOwnProperty.call(body, "email");
  const nextEmail = wantEmailChange ? clean(body.email).toLowerCase() : "";

  if (wantEmailChange) {
    if (!nextEmail) {
      return NextResponse.json({ error: "Email cannot be empty." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }
  }

  const wantRoleChange = Object.prototype.hasOwnProperty.call(body, "role");
  const nextRole = wantRoleChange ? clean(body.role) : "";
  if (wantRoleChange && !VALID_ROLES.has(nextRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  // An admin can't demote themselves — that would lock the account out of
  // the admin console mid-session.
  if (wantRoleChange && nextRole !== "admin" && id === gate.user.id) {
    return NextResponse.json(
      { error: "You can't change your own role. Ask another admin." },
      { status: 400 }
    );
  }

  // 1) Update auth.users email if requested.
  if (wantEmailChange) {
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: nextEmail,
      email_confirm: true,
    });
    if (authErr) {
      return NextResponse.json({ error: `Email update failed: ${authErr.message}` }, { status: 500 });
    }
  }

  // 2) Build profile patch.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "full_name")) {
    update.full_name = clean(body.full_name) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    update.phone = clean(body.phone) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "company")) {
    update.company = clean(body.company) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "service_state")) {
    update.service_state = clean(body.service_state) || null;
  }
  const wantAnchorCommission = Object.prototype.hasOwnProperty.call(body, "anchor_commission");
  if (wantAnchorCommission) {
    update.anchor_commission = body.anchor_commission === true;
  }
  if (wantEmailChange) {
    update.email = nextEmail;
  }
  if (wantRoleChange) {
    update.role = nextRole;
    update.user_type = userTypeForRole(nextRole);
  }

  // No-op if only `id` was sent.
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ ok: true, noop: true });
  }

  let { error: profErr } = await supabaseAdmin.from("profiles").update(update).eq("id", id);
  // Tolerate the anchor_commission column not being migrated yet — retry without it.
  if (profErr && wantAnchorCommission && /anchor_commission/.test(profErr.message)) {
    const { anchor_commission: _ac, ...rest } = update;
    void _ac;
    ({ error: profErr } = await supabaseAdmin.from("profiles").update(rest).eq("id", id));
  }
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const id = clean(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Block self-delete — an admin removing themselves mid-session would lock
  // the console and orphan resources.
  if (id === gate.user.id) {
    return NextResponse.json(
      { error: "You can't delete your own account. Ask another admin." },
      { status: 400 }
    );
  }

  // Deleting via the auth admin removes the auth.users row; profiles cascades
  // via its FK to auth.users (id REFERENCES auth.users ON DELETE CASCADE).
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authErr) {
    return NextResponse.json({ error: `Delete failed: ${authErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
