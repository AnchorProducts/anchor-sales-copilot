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

  const COLS = "id, email, full_name, phone, company, role, user_type, service_state, service_states, service_zip, anchor_commission, created_at";
  const COLS_NO_AC = "id, email, full_name, phone, company, role, user_type, service_state, service_states, service_zip, created_at";

  const first = await supabaseAdmin.from("profiles").select(COLS).order("created_at", { ascending: false });
  // Tolerate the anchor_commission column not being migrated yet.
  const result = first.error
    ? await supabaseAdmin.from("profiles").select(COLS_NO_AC).order("created_at", { ascending: false })
    : first;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ users: (result.data as unknown[]) || [] });
}

// What deleting this user would actually do, for the confirmation dialog.
// Splitting it into erased vs kept is the whole point: an admin should see that
// the person goes and the commission claims stay before they type the name.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(body.id);
  if (clean(body.action) !== "delete-impact" || !id) {
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  }

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,email,role")
    .eq("id", id)
    .maybeSingle();
  if (!prof) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // Best-effort counts — a table that doesn't exist yet shouldn't break the
  // dialog, so each miss just reports 0.
  // Count with "*", not "id": several of these tables key on a composite
  // (notification_tool_assignments is (tool_key, user_id)) and have no id
  // column at all, which makes an id-based count fail silently and under-report
  // what the delete is about to erase.
  const count = async (table: string, column: string) => {
    const { count: n } = await supabaseAdmin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, id);
    return n || 0;
  };

  const [events, pushes, reads, tools, orders, consults, claims, projects, messages, support] =
    await Promise.all([
      count("user_events", "user_id"),
      count("push_subscriptions", "user_id"),
      count("marketing_order_reads", "user_id"),
      count("notification_tool_assignments", "user_id"),
      count("marketing_orders", "created_by"),
      count("leads", "created_by"),
      count("commission_claims", "created_by"),
      count("notable_projects", "created_by"),
      count("marketing_order_messages", "author_id"),
      count("support_requests", "created_by"),
    ]);

  return NextResponse.json({
    user: prof,
    isSelf: id === gate.user.id,
    // Destroyed outright.
    erased: {
      "activity events": events,
      "push devices": pushes,
      "read receipts": reads,
      "notification assignments": tools,
    },
    // Survive, with the author blanked to "Deleted user".
    kept: {
      "marketing orders": orders,
      consults,
      "commission claims": claims,
      "notable projects": projects,
      "order messages": messages,
      "support requests": support,
    },
  });
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
  if (Object.prototype.hasOwnProperty.call(body, "service_states")) {
    // Normalize, uppercase, de-dupe; keep the legacy single column synced.
    const raw = Array.isArray(body.service_states) ? body.service_states : [];
    const states = Array.from(
      new Set(raw.map((s) => clean(s).toUpperCase()).filter(Boolean))
    );
    update.service_states = states;
    update.service_state = states[0] || null;
  } else if (Object.prototype.hasOwnProperty.call(body, "service_state")) {
    const state = clean(body.service_state).toUpperCase() || null;
    update.service_state = state;
    update.service_states = state ? [state] : [];
  }
  if (Object.prototype.hasOwnProperty.call(body, "service_zip")) {
    update.service_zip = clean(body.service_zip).replace(/\D/g, "").slice(0, 5) || null;
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

  // Detach the business records FIRST, so no cascade can take them with the
  // login. Doing it explicitly (rather than trusting ON DELETE SET NULL) means
  // this is correct even on a database where migration 20260812_000006 hasn't
  // run yet: there the column is still NOT NULL, the update fails, and we refuse
  // the delete instead of silently destroying a rep's consults and commission
  // claims. Nothing here is reached unless every detach succeeds.
  for (const [table, column] of [
    ["leads", "created_by"],
    ["commission_claims", "created_by"],
    ["notable_projects", "created_by"],
    ["marketing_order_messages", "author_id"],
    ["support_requests", "created_by"],
    ["support_messages", "author_id"],
    ["sales_regions", "rep_user_id"],
  ] as const) {
    const { error } = await supabaseAdmin
      .from(table)
      .update({ [column]: null })
      .eq(column, id);
    // A missing table is fine (not every deployment has all of them); a NOT NULL
    // violation is not — that's the un-migrated schema, and continuing would
    // destroy records.
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            `Can't safely delete this user yet: ${table}.${column} still requires a value ` +
            `(${error.message}). Run migration 20260812_000006_user_deletion_preserves_records.sql, ` +
            `which lets these records outlive the person.`,
        },
        { status: 409 }
      );
    }
  }

  // Personal and behavioural data is removed explicitly rather than left to
  // cascades. Most of these do cascade from auth.users, but naming them here
  // means "what gets erased" is readable in one place and survives someone
  // changing a constraint later. Business records (orders, consults, claims,
  // notable projects, messages) are deliberately NOT touched — migration
  // 20260812_000006 switched them to ON DELETE SET NULL so they outlive the
  // person, showing as "Deleted user".
  const purged: Record<string, number> = {};
  for (const [table, column] of [
    ["user_events", "user_id"],
    ["push_subscriptions", "user_id"],
    ["marketing_order_reads", "user_id"],
    ["notification_tool_assignments", "user_id"],
  ] as const) {
    const { count } = await supabaseAdmin
      .from(table)
      .delete({ count: "exact" })
      .eq(column, id);
    purged[table] = count || 0;
  }

  // The profile row carries the personal details (name, email, phone,
  // territory). Removed explicitly so it can't be left orphaned if profiles
  // doesn't cascade from auth.users on this project.
  await supabaseAdmin.from("profiles").delete().eq("id", id);

  // Finally the login itself.
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authErr) {
    return NextResponse.json({ error: `Delete failed: ${authErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purged });
}
