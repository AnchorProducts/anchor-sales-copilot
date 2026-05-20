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

const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/whois.mjs <uuid-prefix>");
  process.exit(1);
}

// Pull recent profiles and filter client-side; uuid columns can't be LIKE'd.
const { data, error } = await supa
  .from("profiles")
  .select("id,email,full_name,role,user_type,created_at")
  .order("created_at", { ascending: false })
  .limit(1000);

const filtered = (data || []).filter((p) => p.id.startsWith(id));

if (error) {
  console.error(error);
  process.exit(1);
}

if (error) {
  console.error(error);
  process.exit(1);
}
for (const p of filtered) {
  console.log(p);
}
if (filtered.length === 0) console.log("(no match)");
