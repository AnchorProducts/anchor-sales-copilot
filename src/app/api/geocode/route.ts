import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Address -> latitude/longitude via OpenStreetMap Nominatim. Keyless (no API key
// or billing). We call it server-side so we can set the required User-Agent and
// keep the flow CORS-free. Gated to signed-in users; a manual button per form
// submission stays well under Nominatim's 1 req/sec usage policy.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "AnchorSalesCopilot/1.0 (https://anchorp.com; reports@anchorp.com)";

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = new URL(req.url).searchParams.get("q")?.trim() || "";
    if (q.length < 4) {
      return NextResponse.json({ error: "Enter a fuller address." }, { status: 400 });
    }

    const url = `${NOMINATIM}?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Lookup service unavailable." }, { status: 502 });
    }
    const rows = (await res.json().catch(() => [])) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    const hit = rows[0];
    if (!hit?.lat || !hit?.lon) {
      return NextResponse.json({ error: "No match found for that address." }, { status: 404 });
    }

    // Round to ~1 m precision; keep it tidy for the form field.
    const lat = Number(hit.lat).toFixed(6);
    const lon = Number(hit.lon).toFixed(6);
    return NextResponse.json({ lat, lon, matched: hit.display_name || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Lookup failed." }, { status: 500 });
  }
}
