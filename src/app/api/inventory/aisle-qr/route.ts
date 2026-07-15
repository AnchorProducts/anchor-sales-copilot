// Admin: read (and rotate) the shared marketing-aisle pickup token used by the
// public /grab QR code. Admins + inside reps can view the link; only admins can
// rotate it (rotating invalidates every printed QR code).
//
//   GET  → { url, token, enabled }   the current aisle URL to encode in a QR.
//   POST { action: "rotate" }        issue a fresh token (admin only).
//   POST { action: "toggle", enabled } enable/disable the aisle (admin only).

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clean, getInventoryProfile, canWriteInventory } from "@/lib/inventory/server";
import { appUrl } from "@/lib/appUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function randomToken(): string {
  // 32 hex chars from two UUIDs — opaque and unguessable, no crypto import.
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 32);
}

// Read the single-row config. Self-heals a missing ROW (seeds a fresh token) so
// only a missing TABLE — which needs the migration — returns null. `missing`
// distinguishes "table isn't there" from a transient read error.
async function loadConfig(): Promise<
  { token: string; enabled: boolean } | { missing: true }
> {
  const { data, error } = await supabaseAdmin
    .from("marketing_grab_config")
    .select("token,enabled")
    .eq("id", 1)
    .maybeSingle();

  if (data) return { token: clean((data as any).token), enabled: !!(data as any).enabled };

  // Table missing (migration not run) → let the caller tell the admin to run it.
  if (error) return { missing: true };

  // Table exists but the row is gone — recreate it with a fresh token.
  const token = randomToken();
  const { data: seeded } = await supabaseAdmin
    .from("marketing_grab_config")
    .upsert({ id: 1, token, enabled: true }, { onConflict: "id" })
    .select("token,enabled")
    .maybeSingle();
  if (seeded) return { token: clean((seeded as any).token), enabled: !!(seeded as any).enabled };
  return { token, enabled: true };
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cfg = await loadConfig();
    if ("missing" in cfg) {
      return NextResponse.json(
        { error: "Inventory pickup tables aren't set up yet — run the marketing_aisle_grab migration." },
        { status: 503 }
      );
    }
    return NextResponse.json({
      url: appUrl(`/grab/${cfg.token}`, req),
      token: cfg.token,
      enabled: cfg.enabled,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load aisle QR." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getInventoryProfile(auth.user.id);
    // Rotating/disabling the aisle is admin-only (it invalidates printed codes).
    if (clean(profile?.role) !== "admin") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = clean(body?.action);

    const updates: Record<string, unknown> = { updated_by: auth.user.id, updated_at: new Date().toISOString() };
    if (action === "rotate") {
      updates.token = randomToken();
    } else if (action === "toggle") {
      updates.enabled = !!body?.enabled;
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("marketing_grab_config").update(updates).eq("id", 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const cfg = await loadConfig();
    if ("missing" in cfg) {
      return NextResponse.json(
        { error: "Inventory pickup tables aren't set up yet — run the marketing_aisle_grab migration." },
        { status: 503 }
      );
    }
    return NextResponse.json({
      url: appUrl(`/grab/${cfg.token}`, req),
      token: cfg.token,
      enabled: cfg.enabled,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update aisle QR." }, { status: 500 });
  }
}
