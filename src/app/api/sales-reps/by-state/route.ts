import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { resolveRepsByKind } from "@/lib/sales/regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await supabaseRoute();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "";
  const country = url.searchParams.get("country") || "US";
  const zip = url.searchParams.get("zip") || "";

  // Customer-facing dashboard shows external (outside) reps for the state. The
  // ZIP narrows ZIP-split territories (TX Houston/Gulf vs the rest) to one rep.
  const { external } = await resolveRepsByKind(country, state, zip);
  const reps = external.map((r) => ({
    name: r.name,
    email: r.email,
    teams_link: r.teams_link,
  }));

  // `rep` (first match) retained for backward compatibility with older clients.
  return NextResponse.json({ reps, rep: reps[0] ?? null });
}
