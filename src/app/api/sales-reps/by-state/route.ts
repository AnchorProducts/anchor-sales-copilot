import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { resolveRegionalAssignment } from "@/lib/sales/regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await supabaseRoute();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "";
  const country = url.searchParams.get("country") || "US";

  const rep = await resolveRegionalAssignment(country, state);
  if (!rep) return NextResponse.json({ rep: null });

  return NextResponse.json({
    rep: {
      outside_sales_name: rep.outside_sales_name,
      outside_sales_email: rep.outside_sales_email,
      teams_link: rep.teams_link,
    },
  });
}
