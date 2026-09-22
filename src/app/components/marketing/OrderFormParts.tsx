"use client";

import { Input, Select } from "@/app/components/ui/Field";
import AddressAutocomplete from "@/app/components/ui/AddressAutocomplete";
import { US_STATES } from "@/lib/sales/states";

export type ShipTo = { name: string; street: string; city: string; state: string; zip: string };

export const EMPTY_SHIP_TO: ShipTo = { name: "", street: "", city: "", state: "", zip: "" };

export function shipToComplete(s: ShipTo): boolean {
  return !!(s.name.trim() && s.street.trim() && s.city.trim() && s.state.trim() && s.zip.trim());
}

// The ship-to block as the API stores it: name, street, "City, ST ZIP".
export function formatShipTo(s: ShipTo): string {
  return [s.name.trim(), s.street.trim(), `${s.city.trim()}, ${s.state.trim()} ${s.zip.trim()}`].join("\n");
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
          <span className="text-[13px] font-medium text-[var(--anchor-gray)]">State</span>
          <Select value={shipTo.state} onChange={(e) => set({ state: e.target.value })} className="h-11 px-2.5">
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        <label className="col-span-4 grid gap-1.5 text-sm sm:col-span-2">
          <span className="text-[13px] font-medium text-[var(--anchor-gray)]">ZIP</span>
          <Input
            value={shipTo.zip}
            onChange={(e) => set({ zip: e.target.value })}
            className="h-11 px-3.5"
            placeholder="ZIP"
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </label>
      </div>
    </>
  );
}
