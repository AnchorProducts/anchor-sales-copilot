import { US_STATES } from "@/lib/sales/states";

// Derive a US state (2-letter abbr) for territory routing when a form only
// captured a free-text address (+ optional lat/long) — e.g. the Project Intake
// form. Order of preference: reverse-geocode the lat/long (most reliable when
// present), then a conservative parse of the address text, then a forward
// geocode of the address. Returns null when no confident state is found; the
// caller then leaves the row unscoped (admin-only) rather than misrouting it.

const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA = "AnchorSalesCopilot/1.0 (https://anchorp.com; reports@anchorp.com)";
const ABBR_SET = new Set(US_STATES);

const NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function abbrFromStateName(name: string | undefined | null): string | null {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  if (ABBR_SET.has(key.toUpperCase())) return key.toUpperCase();
  return NAME_TO_ABBR[key] ?? null;
}

// Conservative: only match a 2-letter state code that sits right before a ZIP,
// or at the end of the address after a comma. Avoids treating common words
// ("IN", "OR", "OK") mid-address as states.
export function stateFromAddressText(address: string): string | null {
  const s = String(address || "").toUpperCase();
  if (!s) return null;
  let m = s.match(/\b([A-Z]{2})\b[ ,]+\d{5}(?:-\d{4})?\b/);
  if (m && ABBR_SET.has(m[1])) return m[1];
  m = s.match(/,\s*([A-Z]{2})\s*,?\s*(?:USA?|UNITED STATES)?\.?\s*$/);
  if (m && ABBR_SET.has(m[1])) return m[1];
  return null;
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseLatLng(latLong: string): { lat: string; lon: string } | null {
  const m = String(latLong || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { lat: m[1], lon: m[2] };
}

// Best-effort US state for a submission. Never throws — returns null on failure.
export async function deriveUsState(address: string, latLong?: string): Promise<string | null> {
  // 1) Reverse-geocode the lat/long if the submitter filled it in.
  const ll = latLong ? parseLatLng(latLong) : null;
  if (ll) {
    const j = await fetchJson(
      `${NOMINATIM}/reverse?format=json&addressdetails=1&zoom=5&lat=${encodeURIComponent(ll.lat)}&lon=${encodeURIComponent(ll.lon)}`
    );
    const abbr = abbrFromStateName(j?.address?.state);
    if (abbr) return abbr;
  }

  // 2) Conservative parse of the address text (offline, high precision).
  const fromText = stateFromAddressText(address);
  if (fromText) return fromText;

  // 3) Forward-geocode the address string.
  const addr = String(address || "").trim();
  if (addr.length >= 4) {
    const rows = await fetchJson(
      `${NOMINATIM}/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(addr)}`
    );
    const abbr = abbrFromStateName(Array.isArray(rows) ? rows[0]?.address?.state : null);
    if (abbr) return abbr;
  }

  return null;
}
