// Address lookup shared between the API proxy and the autocomplete input.
//
// Suggestions come from Geoapify through our own /api/address route, so the key
// stays server-side and every provider detail is normalized to the one shape
// below before it reaches a form. Swapping providers means changing this file
// and the route — never the four forms that consume it.

export type AddressSuggestion = {
  // Stable enough for a React key within one result set.
  id: string;
  // Street line shown as the first line of a suggestion row.
  label: string;
  // "San Leandro, CA 94577" — the muted second line, the way Maps splits a
  // result into title and subtitle instead of one long wrapping string.
  secondary: string;
  // Street line only — "1200 Marina Blvd" — for forms with separate city/state/
  // ZIP inputs. Forms with a single address box use `formatted` instead.
  line1: string;
  city: string;
  // Two-letter code, matching the US_STATES <select> options.
  state: string;
  postalCode: string;
  formatted: string;
  latitude: number | null;
  longitude: number | null;
};

// A Geoapify result, narrowed to the fields we use. Requested with format=json,
// which returns these flat rather than wrapped in GeoJSON features.
type GeoapifyResult = {
  formatted?: string;
  address_line1?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  lat?: number;
  lon?: number;
  place_id?: string;
};

const str = (v: unknown) => String(v ?? "").trim();

// Geoapify's address_line1 is already the street line ("1200 Marina Blvd");
// fall back to assembling it from the parts when a result lacks it.
function streetLine(r: GeoapifyResult): string {
  const line1 = str(r.address_line1);
  if (line1) return line1;
  return [str(r.housenumber), str(r.street)].filter(Boolean).join(" ");
}

// Geoapify tacks the country onto every formatted address. It's noise in a
// US-only app — it wraps the row onto a second line and would be pasted into
// the single-box address fields verbatim.
function stripCountry(formatted: string): string {
  return formatted.replace(/,\s*United States(\s+of\s+America)?\s*$/i, "").trim();
}

export function normalizeGeoapifyResult(r: GeoapifyResult, index: number): AddressSuggestion {
  const line1 = streetLine(r);
  const city = str(r.city);
  // state_code is the 2-letter form the US_STATES dropdowns use; `state` is the
  // full name, which wouldn't match an <option value>.
  const state = str(r.state_code).toUpperCase();
  const postalCode = str(r.postcode);
  const secondary = [[city, state].filter(Boolean).join(", "), postalCode]
    .filter(Boolean)
    .join(" ");
  const formatted =
    stripCountry(str(r.formatted)) || [line1, secondary].filter(Boolean).join(", ");

  return {
    id: str(r.place_id) || `${line1}|${city}|${state}|${postalCode}|${index}`,
    // Street on top, place underneath. Fall back to the full string when a
    // result has no street line of its own.
    label: line1 || formatted,
    secondary,
    line1,
    city,
    state,
    postalCode,
    formatted,
    latitude: typeof r.lat === "number" ? r.lat : null,
    longitude: typeof r.lon === "number" ? r.lon : null,
  };
}

export function normalizeGeoapifyResults(list: unknown): AddressSuggestion[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((r, i) => normalizeGeoapifyResult(r as GeoapifyResult, i))
    // A suggestion with nothing to show is noise in the dropdown.
    .filter((s) => s.label.length > 0);
}

// ~1m precision — no point sending more than a phone GPS actually has.
export function roundCoordinate(v: number): string {
  return v.toFixed(6);
}
