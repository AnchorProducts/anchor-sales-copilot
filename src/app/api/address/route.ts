// Address lookup proxy.
//
// The autocomplete input never talks to Geoapify directly — it calls here, and
// the key lives only in GEOAPIFY_API_KEY on the server. That keeps the key out
// of the browser bundle (where a leaked key is someone else's bill), gives one
// place to swap providers, and lets us require a signed-in user so this isn't an
// open geocoding relay for the internet.
//
// Three shapes:
//   GET /api/address                  → { configured } — is lookup available?
//   GET /api/address?q=1200 mari      → { suggestions } — typeahead
//   GET /api/address?lat=..&lng=..    → { suggestions } — reverse, for "use my
//                                        current location" (nearest first)
//
// With no key set the route stays healthy and reports configured:false, so the
// forms quietly fall back to plain text inputs instead of erroring.
//
// Not to be confused with /api/geocode, which turns a typed address into
// coordinates via keyless OpenStreetMap Nominatim for the intake form's manual
// lat/long button. Nominatim's usage policy forbids per-keystroke autocomplete,
// which is exactly why this route exists separately.
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { normalizeGeoapifyResults, roundCoordinate } from "@/lib/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEOAPIFY_BASE = "https://api.geoapify.com/v1/geocode";
// US-only: every state dropdown in the app is US, and restricting the provider
// keeps irrelevant foreign matches out of the list.
const COUNTRY_FILTER = "countrycode:us";
const LIMIT = 6;

function apiKey(): string {
  return (process.env.GEOAPIFY_API_KEY || "").trim();
}

async function geoapifyGet(path: string) {
  const res = await fetch(`${GEOAPIFY_BASE}${path}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || `Address lookup failed (${res.status}).`);
  }
  return json;
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const key = apiKey();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");

    // No key configured: report it plainly so the input can hide its dropdown
    // and location button rather than failing on every keystroke.
    if (!key) return NextResponse.json({ configured: false, suggestions: [] });

    // Capability probe — no external call, no cost.
    if (!q && !lat && !lng) return NextResponse.json({ configured: true });

    // Reverse geocode: turn the phone's coordinates into a street address.
    if (lat !== null && lng !== null) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (
        !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
        Math.abs(latNum) > 90 || Math.abs(lngNum) > 180
      ) {
        return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
      }
      const json = await geoapifyGet(
        `/reverse?lat=${roundCoordinate(latNum)}&lon=${roundCoordinate(lngNum)}` +
          `&format=json&limit=1&apiKey=${encodeURIComponent(key)}`
      );
      return NextResponse.json({
        configured: true,
        suggestions: normalizeGeoapifyResults(json?.results),
      });
    }

    // Typeahead. Below 3 characters every query matches, which just burns
    // lookups — the input holds off too, this is the backstop.
    if (q.length < 3) return NextResponse.json({ configured: true, suggestions: [] });

    const json = await geoapifyGet(
      `/autocomplete?text=${encodeURIComponent(q)}&filter=${COUNTRY_FILTER}` +
        `&format=json&limit=${LIMIT}&apiKey=${encodeURIComponent(key)}`
    );
    return NextResponse.json({
      configured: true,
      suggestions: normalizeGeoapifyResults(json?.results),
    });
  } catch (e) {
    // A provider hiccup must never block typing — the caller shows no
    // suggestions and the field stays a normal text input.
    console.warn("address lookup failed", (e as Error)?.message || e);
    return NextResponse.json(
      { configured: true, suggestions: [], error: (e as Error)?.message || "Address lookup failed." },
      { status: 200 }
    );
  }
}
