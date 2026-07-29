import { NextResponse } from "next/server";
import { requireMarketingUser } from "@/lib/portalAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PITCH_TEMPLATES, templateDef } from "@/lib/email/pitchTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * Marketing Hub → Email templates (the copy behind the Pitch to Marketing
 * notifications).
 *
 *   GET    → the catalog, each entry merged with marketing's saved copy
 *   PATCH  → save one template  { key, subject, heading, body, buttonLabel }
 *   DELETE → revert one template to its built-in default  { key }
 *
 * Marketing-guarded; writes use the service role. Keys are validated against
 * the code catalog, so this can only ever edit templates the app actually
 * sends — no arbitrary rows.
 * ==========================================================================*/

function clean(v: unknown) {
  return String(v ?? "").trim();
}

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET() {
  if (!(await requireMarketingUser())) return forbidden();

  const { data, error } = await supabaseAdmin
    .from("mkt_email_template")
    .select("key, subject, heading, body, button_label, updated_at");

  // A missing table just means nobody has customized anything yet.
  const migrated = !error;
  const saved = new Map(
    ((migrated ? data : []) ?? []).map((r) => [
      (r as { key: string }).key,
      r as { subject: string; heading: string; body: string; button_label: string; updated_at: string },
    ])
  );

  const templates = PITCH_TEMPLATES.map((def) => {
    const row = saved.get(def.key);
    return {
      key: def.key,
      label: def.label,
      audience: def.audience,
      trigger: def.trigger,
      variables: def.variables,
      defaults: def.defaults,
      customized: Boolean(row),
      updatedAt: row?.updated_at ?? null,
      subject: clean(row?.subject) || def.defaults.subject,
      heading: clean(row?.heading) || def.defaults.heading,
      body: clean(row?.body) || def.defaults.body,
      buttonLabel: clean(row?.button_label) || def.defaults.buttonLabel,
    };
  });

  return NextResponse.json({ templates, migrated });
}

export async function PATCH(req: Request) {
  const access = await requireMarketingUser();
  if (!access) return forbidden();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const key = clean(body.key);
  if (!templateDef(key)) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

  const subject = clean(body.subject);
  const copy = clean(body.body);
  if (!subject) return NextResponse.json({ error: "The subject line can't be empty." }, { status: 400 });
  if (!copy) return NextResponse.json({ error: "The body can't be empty." }, { status: 400 });

  const { error } = await supabaseAdmin.from("mkt_email_template").upsert(
    {
      key,
      subject,
      heading: clean(body.heading),
      body: copy,
      button_label: clean(body.buttonLabel),
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    if (/mkt_email_template/.test(error.message)) {
      return NextResponse.json(
        { error: "Email templates aren't switched on yet — the database migration is still pending." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await requireMarketingUser())) return forbidden();

  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const key = clean(body.key ?? url.searchParams.get("key"));
  if (!templateDef(key)) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

  const { error } = await supabaseAdmin.from("mkt_email_template").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
