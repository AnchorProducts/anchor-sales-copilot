import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { buildWeeklyOemMatrixPdf, buildWeeklyUserAnalyticsPdf } from "@/lib/analytics/weeklyReportPdfs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseRecipients(v: string) {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: Request) {
  try {
    // --- protect this endpoint (cron only) ---
    const secret = mustGetEnv("CRON_SECRET");
    const provided = new URL(req.url).searchParams.get("secret") || "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resendKey = (process.env.RESEND_API_KEY || "").trim();

    // Recipients: admin-managed table, falling back to the env var.
    let recipients: string[] = [];
    try {
      const { data } = await supabaseAdmin
        .from("notification_settings")
        .select("weekly_report_emails")
        .eq("id", 1)
        .maybeSingle();
      const dbList = (data as { weekly_report_emails?: string[] | null } | null)?.weekly_report_emails;
      if (Array.isArray(dbList)) recipients = dbList.filter((e) => typeof e === "string" && e.trim());
    } catch {
      // Soft-fail to env var.
    }
    if (recipients.length === 0) {
      recipients = parseRecipients(process.env.WEEKLY_REPORT_TO || "");
    }

    const emailsEnabled = !!resendKey && recipients.length > 0;

    // Retention: keep user_events for 90 days, prune older rows.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin.from("user_events").delete().lt("created_at", ninetyDaysAgo);

    if (emailsEnabled) {
      // The report is the two analytics PDFs over the last 7 days, no filters.
      const [matrixPdf, userPdf] = await Promise.all([
        buildWeeklyOemMatrixPdf(),
        buildWeeklyUserAnalyticsPdf(),
      ]);
      const resend = new Resend(resendKey);
      const today = new Date().toISOString().slice(0, 10);
      await resend.emails.send({
        from: "Anchor Co-Pilot <reports@anchorp.com>",
        to: recipients,
        subject: `Anchor Sales Co-Pilot — Weekly Analytics (last 7 days, ${today})`,
        text:
          "Attached are this week's analytics, covering the last 7 days:\n\n" +
          "• OEM Matrix — manufacturer rep & consultant engagement\n" +
          "• User Analytics — internal staff & other app users\n",
        attachments: [
          { filename: `oem-matrix_last-7-days_${today}.pdf`, content: matrixPdf },
          { filename: `user-analytics_last-7-days_${today}.pdf`, content: userPdf },
        ],
      });
    }

    return NextResponse.json(
      { ok: true, sentTo: emailsEnabled ? recipients : [], emailSent: emailsEnabled },
      { status: 200 },
    );
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
