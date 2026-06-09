import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETING_CATEGORY_KEYS, type MarketingRecipients } from "@/lib/marketingOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valid keys for the per-category marketing-order recipient map: each category
// plus the "default" fallback.
const MARKETING_RECIPIENT_KEYS = [...MARKETING_CATEGORY_KEYS, "default"];

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

type Settings = {
  commission_recipient_email: string | null;
  weekly_report_emails: string[];
  marketing_orders_recipients: MarketingRecipients;
};

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // select("*") so the page keeps working even before the marketing_orders
  // migration is applied (a named, non-existent column would 500 the whole read).
  const { data, error } = await supabaseAdmin
    .from("notification_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Settings = {
    commission_recipient_email: (data?.commission_recipient_email as string | null) ?? null,
    weekly_report_emails: (data?.weekly_report_emails as string[] | null) ?? [],
    marketing_orders_recipients:
      (data?.marketing_orders_recipients as MarketingRecipients | null) ?? {},
  };
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => null)) as Partial<Settings> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("commission_recipient_email" in body) {
    const v = body.commission_recipient_email;
    if (v === null || v === "") {
      update.commission_recipient_email = null;
    } else if (typeof v === "string" && EMAIL_RE.test(v.trim())) {
      update.commission_recipient_email = v.trim().toLowerCase();
    } else {
      return NextResponse.json({ error: "Invalid commission recipient email." }, { status: 400 });
    }
  }

  if ("weekly_report_emails" in body) {
    const list = body.weekly_report_emails;
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: "weekly_report_emails must be an array." }, { status: 400 });
    }
    const cleaned: string[] = [];
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim().toLowerCase();
      if (!trimmed) continue;
      if (!EMAIL_RE.test(trimmed)) {
        return NextResponse.json({ error: `Invalid email: ${raw}` }, { status: 400 });
      }
      if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
    }
    update.weekly_report_emails = cleaned;
  }

  if ("marketing_orders_recipients" in body) {
    const map = body.marketing_orders_recipients;
    if (typeof map !== "object" || map === null || Array.isArray(map)) {
      return NextResponse.json(
        { error: "marketing_orders_recipients must be an object." },
        { status: 400 }
      );
    }
    const cleaned: MarketingRecipients = {};
    for (const [rawKey, rawVal] of Object.entries(map as Record<string, unknown>)) {
      if (!MARKETING_RECIPIENT_KEYS.includes(rawKey)) {
        return NextResponse.json({ error: `Unknown category: ${rawKey}` }, { status: 400 });
      }
      // Empty string clears that category (falls back to default/env).
      if (rawVal === null || rawVal === "") continue;
      if (typeof rawVal !== "string") {
        return NextResponse.json({ error: `Invalid email for ${rawKey}.` }, { status: 400 });
      }
      const trimmed = rawVal.trim().toLowerCase();
      if (!trimmed) continue;
      if (!EMAIL_RE.test(trimmed)) {
        return NextResponse.json({ error: `Invalid email for ${rawKey}: ${rawVal}` }, { status: 400 });
      }
      cleaned[rawKey] = trimmed;
    }
    update.marketing_orders_recipients = cleaned;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { data, error } = await supabaseAdmin
    .from("notification_settings")
    .update(update)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
