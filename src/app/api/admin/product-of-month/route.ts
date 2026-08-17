import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PRODUCT_OF_MONTH_KEY,
  parseProductOfMonth,
  type ProductOfMonth,
} from "@/lib/settings/productOfMonth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sets (or clears) the Resource Library's Product of the Month pill. Reading it
// needs no route: the library reads app_settings straight from the browser
// client, which the table's select policy allows.

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

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin writes cannot bypass RLS." },
      { status: 500 }
    );
  }

  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (body as { setting?: unknown } | null)?.setting;

  // An explicit null clears the pill rather than storing an empty setting.
  if (raw === null) {
    const { error } = await supabaseAdmin.from("app_settings").delete().eq("key", PRODUCT_OF_MONTH_KEY);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, setting: null });
  }

  const setting: ProductOfMonth | null = parseProductOfMonth(raw);
  if (!setting) {
    return NextResponse.json(
      { error: "Expected { kind: 'product', productId } or { kind: 'group', group }." },
      { status: 400 }
    );
  }

  // A pill pointing at a product that is gone, hidden, or switched off would
  // link people into a dead tackle box, so verify before storing.
  if (setting.kind === "product") {
    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id, active, hidden")
      .eq("id", setting.productId)
      .maybeSingle();

    const row = prod as { active?: boolean; hidden?: boolean } | null;
    if (!row) return NextResponse.json({ error: "That product no longer exists." }, { status: 400 });
    if (row.hidden || row.active === false) {
      return NextResponse.json(
        { error: "That product is hidden or inactive, so the pill would link nowhere." },
        { status: 400 }
      );
    }
  }

  const { error } = await supabaseAdmin.from("app_settings").upsert(
    {
      key: PRODUCT_OF_MONTH_KEY,
      value: setting,
      updated_at: new Date().toISOString(),
      updated_by: gate.user.id,
    },
    { onConflict: "key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, setting });
}
