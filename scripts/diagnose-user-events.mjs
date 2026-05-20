// One-shot diagnostic: does user_events exist, is it queryable, and how
// many rows are in it? Run with: node scripts/diagnose-user-events.mjs
// (Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // ignore — env may be set externally
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log("Connecting to:", url.replace(/^https?:\/\//, ""));

  // 1) Does the table exist + can we read from it?
  const { count, error: countErr } = await supa
    .from("user_events")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    console.log("\n[FAIL] user_events read failed:");
    console.log("   ", countErr.message);
    console.log("    code:", countErr.code);
    console.log("\nIf the message mentions \"relation\" or \"does not exist\",");
    console.log("the migration 20260513_000014_create_user_events.sql has not been applied.");
    return;
  }
  console.log(`\n[OK]   user_events exists. Row count: ${count}`);

  // 2) Last 15 events
  const { data: recent, error: recentErr } = await supa
    .from("user_events")
    .select("user_id,event_type,page_path,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(15);

  if (recentErr) {
    console.log("[FAIL] reading recent rows:", recentErr.message);
  } else {
    console.log(`\nMost recent ${recent.length} event(s):`);
    if (recent.length === 0) {
      console.log("   (none) — table is empty, no inserts have landed.");
    } else {
      for (const r of recent) {
        const meta = r.metadata && Object.keys(r.metadata).length
          ? "  " + JSON.stringify(r.metadata)
          : "";
        console.log(
          `  ${r.created_at}  ${r.event_type.padEnd(20)}  ${(r.page_path ?? "—").padEnd(28)}  user=${r.user_id.slice(0, 8)}…${meta}`
        );
      }
    }
  }

  // 2b) Breakdown by event_type for the past 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: typeRows } = await supa
    .from("user_events")
    .select("event_type")
    .gte("created_at", sevenDaysAgo);
  if (typeRows) {
    const byType = {};
    for (const r of typeRows) byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
    console.log("\nLast 7 days by event_type:");
    if (Object.keys(byType).length === 0) {
      console.log("   (no events in last 7 days)");
    } else {
      for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${k.padEnd(28)} ${v}`);
      }
    }
  }

  // 3) Confirm we can insert as service role (RLS bypass).
  const probeUserId = "00000000-0000-0000-0000-000000000000";
  const { error: insErr } = await supa
    .from("user_events")
    .insert({
      user_id: probeUserId,
      event_type: "diagnostic_probe",
      page_path: "/diagnostic",
      metadata: { ts: new Date().toISOString() },
    });
  if (insErr) {
    console.log("\n[FAIL] service-role insert blocked:");
    console.log("   ", insErr.message);
    console.log("    code:", insErr.code);
    console.log(
      "\nIf this fails with a FK violation, the table exists but no profile row matches"
    );
    console.log(
      "the probe UUID — that's expected; it does not mean inserts from the app would fail."
    );
  } else {
    console.log("\n[OK]   service-role insert succeeded (probe row written).");
    await supa.from("user_events").delete().eq("event_type", "diagnostic_probe");
    console.log("       probe row cleaned up.");
  }

  // 4) Check profile for laurenburrell25@gmail.com — the user testing.
  const { data: profs, error: profErr } = await supa
    .from("profiles")
    .select("id,email,role,user_type")
    .ilike("email", "laurenburrell25@gmail.com");
  if (profErr) {
    console.log("\n[FAIL] reading profile:", profErr.message);
  } else if (profs && profs.length > 0) {
    const p = profs[0];
    console.log(
      `\nLauren's profile:  role=${p.role}  user_type=${p.user_type}  id=${p.id}`
    );
    // events for this user
    const { count: lc } = await supa
      .from("user_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", p.id);
    console.log(`Events recorded for Lauren: ${lc}`);
  } else {
    console.log("\nNo profile found for laurenburrell25@gmail.com (?)");
  }
}

main().catch((e) => {
  console.error("Diagnostic crashed:", e);
  process.exit(1);
});
