import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: leads, error } = await supa
  .from("leads")
  .select("id,customer_company,region_code,state,country,status,created_by_email,created_at")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(`Most recent ${leads.length} lead(s):`);
for (const l of leads) {
  console.log(
    `  ${l.created_at}  region=${(l.region_code ?? "—").padEnd(4)}  state=${(l.state ?? "—").padEnd(3)}  status=${l.status.padEnd(8)}  by=${l.created_by_email ?? "—"}  ${l.customer_company}`
  );
}

console.log("\nSales reps and their states:");
const { data: reps } = await supa
  .from("sales_reps")
  .select("outside_sales_name,outside_sales_email,states")
  .order("outside_sales_name");
for (const r of reps || []) {
  console.log(`  ${(r.outside_sales_email ?? "—").padEnd(40)}  ${(r.states || []).join(",") || "(none)"}  — ${r.outside_sales_name}`);
}
