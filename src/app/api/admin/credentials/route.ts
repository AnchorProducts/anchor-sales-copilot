import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ENTRY_FIELDS, isCredentialKeeper, looksLikeSecret } from "@/lib/credentials/keepers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The credentials index (see supabase/migrations/20260929_000001). Only the two
// keepers get past requireKeeper; everyone else — admins included — gets a 403,
// and the attempt is logged. The tables have no RLS policies, so this route on
// the service-role key is the only way in from the App.

const SOURCE = "app";

async function log(email: string | null, action: string, entry?: { id?: string | null; name?: string | null }) {
  await supabaseAdmin
    .from("credential_access_log")
    .insert({ email, action, entry_id: entry?.id || null, entry_name: entry?.name || null, source: SOURCE });
}

async function requireKeeper() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };
  const email = String(auth.user.email || "").toLowerCase();
  if (!isCredentialKeeper(email)) {
    await log(email || null, "denied");
    return { error: "Forbidden", status: 403 as const };
  }
  return { email };
}

function cleanEntry(body: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const f of ENTRY_FIELDS) {
    if (!(f in (body || {}))) continue;
    const v = String(body[f] ?? "").trim();
    out[f] = v ? v.slice(0, 2000) : null;
  }
  if (out.last_rotated && !/^\d{4}-\d{2}-\d{2}$/.test(out.last_rotated)) out.last_rotated = null;
  return out;
}

function secretRefusal(entry: Record<string, string | null>) {
  const hit = Object.entries(entry).find(([, v]) => looksLikeSecret(v));
  return hit
    ? NextResponse.json(
        { error: `"${hit[0]}" looks like it contains a password or key. Keep secrets in the password manager and write only where to find them.` },
        { status: 400 }
      )
    : null;
}

export async function GET() {
  const gate = await requireKeeper();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [entries, vault, recent] = await Promise.all([
    supabaseAdmin.from("credential_entries").select("*").order("category").order("name"),
    supabaseAdmin.from("credential_settings").select("value").eq("key", "vault").maybeSingle(),
    supabaseAdmin
      .from("credential_access_log")
      .select("id,at,email,action,entry_name,source")
      .order("at", { ascending: false })
      .limit(100),
  ]);
  if (entries.error) return NextResponse.json({ error: entries.error.message }, { status: 500 });

  await log(gate.email, "viewed list");
  return NextResponse.json({
    entries: entries.data || [],
    vault: (vault.data as { value?: unknown } | null)?.value || null,
    log: recent.data || [],
  });
}

// Create an entry, or record an open/copy event: { event: "opened sign-in" | "copied account", id }.
export async function POST(req: Request) {
  const gate = await requireKeeper();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));

  if (body?.event) {
    const event = String(body.event);
    if (!["opened sign-in", "copied account", "opened vault"].includes(event)) {
      return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    }
    const { data: e } = body.id
      ? await supabaseAdmin.from("credential_entries").select("id,name").eq("id", String(body.id)).maybeSingle()
      : { data: null };
    await log(gate.email, event, (e as { id: string; name: string } | null) ?? undefined);
    return NextResponse.json({ ok: true });
  }

  const entry = cleanEntry(body);
  if (!entry.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const refused = secretRefusal(entry);
  if (refused) return refused;

  const { data, error } = await supabaseAdmin
    .from("credential_entries")
    .insert({ ...entry, updated_by: gate.email })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await log(gate.email, "added", data);
  return NextResponse.json({ entry: data });
}

// Update an entry ({ id, ...fields }) or the vault link ({ vault: { name, url } }).
export async function PATCH(req: Request) {
  const gate = await requireKeeper();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));

  if (body?.vault) {
    const name = String(body.vault.name || "").trim().slice(0, 120);
    const url = String(body.vault.url || "").trim().slice(0, 500);
    if (url && !/^https:\/\//i.test(url)) {
      return NextResponse.json({ error: "The vault link must start with https://" }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from("credential_settings")
      .upsert({ key: "vault", value: { name, url }, updated_at: new Date().toISOString(), updated_by: gate.email });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await log(gate.email, "changed vault link");
    return NextResponse.json({ ok: true });
  }

  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const entry = cleanEntry(body);
  if ("name" in entry && !entry.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const refused = secretRefusal(entry);
  if (refused) return refused;

  const { data, error } = await supabaseAdmin
    .from("credential_entries")
    .update({ ...entry, updated_at: new Date().toISOString(), updated_by: gate.email })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await log(gate.email, "edited", data);
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: Request) {
  const gate = await requireKeeper();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("credential_entries").delete().eq("id", id).select("id,name").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await log(gate.email, "removed", (data as { id: string; name: string } | null) ?? undefined);
  return NextResponse.json({ ok: true });
}
