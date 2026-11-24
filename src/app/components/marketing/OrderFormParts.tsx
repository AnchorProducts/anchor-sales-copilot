"use client";

import { Input, Select } from "@/app/components/ui/Field";
import AddressAutocomplete from "@/app/components/ui/AddressAutocomplete";
import { CA_PROVINCES, SHIP_COUNTRIES, US_STATES } from "@/lib/sales/states";

// `country` is an ISO alpha-2 code from SHIP_COUNTRIES; "US" unless changed.
export type ShipTo = { name: string; street: string; city: string; state: string; zip: string; country: string };

export const EMPTY_SHIP_TO: ShipTo = { name: "", street: "", city: "", state: "", zip: "", country: "US" };

// US, Canada and Mexico always have a state/province and a postal code; plenty
// of South American addresses don't use one or the other, so they're optional there.
function regionRequired(country: string): boolean {
  return country === "US" || country === "CA" || country === "MX";
}

function countryName(code: string): string {
  return SHIP_COUNTRIES.find((c) => c.code === code)?.name || code;
}

export function shipToComplete(s: ShipTo): boolean {
  const base = !!(s.name.trim() && s.street.trim() && s.city.trim() && s.country);
  if (!base) return false;
  return regionRequired(s.country) ? !!(s.state.trim() && s.zip.trim()) : true;
}

// The ship-to block as the API stores it: name, street, "City, ST ZIP", plus a
// country line for anything outside the US.
export function formatShipTo(s: ShipTo): string {
  const cityLine = [[s.city.trim(), s.state.trim()].filter(Boolean).join(", "), s.zip.trim()]
    .filter(Boolean)
    .join(" ");
  const lines = [s.name.trim(), s.street.trim(), cityLine];
  if (s.country && s.country !== "US") lines.push(countryName(s.country));
  return lines.join("\n");
}

// Needed-by date plus a full ship-to address, laid out as one address block.
export function DeliveryFields({
  neededBy,
  onNeededBy,
  shipTo,
  onShipTo,
  neededByHint = "Have a deadline (e.g. a trade show)? Let the marketing team know.",
}: {
  neededBy: string;
  onNeededBy: (v: string) => void;
  shipTo: ShipTo;
  onShipTo: (v: ShipTo) => void;
  neededByHint?: string;
}) {
  const set = (patch: Partial<ShipTo>) => onShipTo({ ...shipTo, ...patch });
  const isUS = shipTo.country === "US";
  // Dropdowns where the codes are standard; free text elsewhere.
  const regionOptions = isUS ? US_STATES : shipTo.country === "CA" ? CA_PROVINCES : null;
  const regionLabel = isUS || shipTo.country === "MX" ? "State" : shipTo.country === "CA" ? "Province" : "Region";
  return (
    <>
      <label className="grid gap-1.5 text-sm">
        <span className="text-[13px] font-medium text-[var(--anchor-gray)]">Needed by</span>
        <Input
          type="date"
          value={neededBy}
          onChange={(e) => onNeededBy(e.target.value)}
          className="h-11 px-3.5"
        />
        <span className="text-[12px] leading-snug text-[var(--anchor-gray)]">{neededByHint}</span>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="text-[13px] font-medium text-[var(--anchor-gray)]">Recipient name</span>
        <Input
          value={shipTo.name}
          onChange={(e) => set({ name: e.target.value })}
          className="h-11 px-3.5"
          placeholder="Full name"
          autoComplete="name"
        />
      </label>

      <label className="grid gap-1.5 text-sm sm:col-span-2">
        <span className="text-[13px] font-medium text-[var(--anchor-gray)]">Country</span>
        <Select
          value={shipTo.country}
          // A US state or ZIP means nothing in another country, so start those fresh.
          onChange={(e) => set({ country: e.target.value, state: "", zip: "" })}
          className="h-11 px-3"
          autoComplete="country"
        >
          {(["North America", "South America"] as const).map((g) => (
            <optgroup key={g} label={g}>
              {SHIP_COUNTRIES.filter((c) => c.group === g).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>

      <div className="grid gap-1.5 text-sm sm:col-span-2">
        <span className="text-[13px] font-medium text-[var(--anchor-gray)]">Street address</span>
        {/* No current-location button: orders ship to a customer, not to
            wherever the rep happens to be standing. */}
        <AddressAutocomplete
          value={shipTo.street}
          onChange={(v) => set({ street: v })}
          onSelect={(a) =>
            set({
              street: a.line1 || a.formatted,
              ...(a.city ? { city: a.city } : {}),
              ...(a.state ? { state: a.state } : {}),
              ...(a.postalCode ? { zip: a.postalCode } : {}),
            })
          }
          className="h-11 px-3.5"
          placeholder="Street address"
          country={shipTo.country.toLowerCase()}
        />
      </div>

      {/* City / State / ZIP read as one address line, so they sit on one. */}
      <div className="grid grid-cols-6 gap-3 sm:col-span-2">
        <label className="col-span-6 grid gap-1.5 text-sm sm:col-span-3">
          <span className="text-[13px] font-medium text-[var(--anchor-gray)]">City</span>
          <Input
            value={shipTo.city}
            onChange={(e) => set({ city: e.target.value })}
            className="h-11 px-3.5"
            placeholder="City"
            autoComplete="address-level2"
          />
        </label>
        <label className="col-span-2 grid gap-1.5 text-sm sm:col-span-1">
          <span className="text-[13px] font-medium text-[var(--anchor-gray)]">{regionLabel}</span>
          {regionOptions ? (
            <Select value={shipTo.state} onChange={(e) => set({ state: e.target.value })} className="h-11 px-2.5">
              <option value="">—</option>
              {regionOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={shipTo.state}
              onChange={(e) => set({ state: e.target.value })}
              className="h-11 px-3"
              placeholder={regionRequired(shipTo.country) ? regionLabel : "Optional"}
              autoComplete="address-level1"
            />
          )}
        </label>
        <label className="col-span-4 grid gap-1.5 text-sm sm:col-span-2">
          <span className="text-[13px] font-medium text-[var(--anchor-gray)]">{isUS ? "ZIP" : "Postal code"}</span>
          <Input
            value={shipTo.zip}
            onChange={(e) => set({ zip: e.target.value })}
            className="h-11 px-3.5"
            placeholder={isUS ? "ZIP" : regionRequired(shipTo.country) ? "Postal code" : "Optional"}
            autoComplete="postal-code"
            inputMode={isUS ? "numeric" : "text"}
          />
        </label>
      </div>
    </>
  );
}
