"use client";

// An address input with a typeahead dropdown, and optionally a "use my current
// location" button.
//
// Degrades to a plain text input whenever lookup isn't available — no key
// configured, provider down, offline. A rep on a roof can always just type,
// which is why nothing here ever blocks or clears what they've entered.
//
// The parent owns the text (`value`/`onChange`, as with any controlled Input).
// `onSelect` fires only when a real suggestion is chosen, handing over the
// broken-out parts so a form can fill its city/state/ZIP fields at the same time.

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/app/components/ui/Field";
import type { AddressSuggestion } from "@/lib/address";

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  showCurrentLocation = false,
  placeholder,
  className = "",
  autoComplete = "street-address",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: AddressSuggestion) => void;
  // Only worth offering where the rep is standing at the place they're
  // describing — a job site, not a customer's shipping address.
  showCurrentLocation?: boolean;
  placeholder?: string;
  className?: string;
  autoComplete?: string;
  id?: string;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateErr, setLocateErr] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Set while filling from a suggestion, so the resulting value change doesn't
  // immediately fire a fresh search for the text we just inserted.
  const skipNextSearch = useRef(false);
  // Guards against a slow early request overwriting a newer one's results.
  const requestSeq = useRef(0);

  // Is lookup available at all? One cheap call, no provider round-trip.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/address", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (alive) setConfigured(!!json?.configured);
      } catch {
        if (alive) setConfigured(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Debounced typeahead. Below 3 characters isn't worth a lookup.
  useEffect(() => {
    if (configured === false) return;
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (seq !== requestSeq.current) return; // a newer keystroke won
        if (json?.configured === false) {
          setConfigured(false);
          return;
        }
        const list: AddressSuggestion[] = json?.suggestions || [];
        setSuggestions(list);
        setActive(-1);
        if (list.length) setOpen(true);
      } catch {
        // Silent: typing must keep working when lookup doesn't.
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value, configured]);

  // Close when focus or a click goes elsewhere.
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const choose = useCallback(
    (s: AddressSuggestion) => {
      skipNextSearch.current = true;
      setOpen(false);
      setSuggestions([]);
      setActive(-1);
      setLocateErr(null);
      onSelect(s);
    },
    [onSelect]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Only intercept Enter when a suggestion is actually highlighted, so it
      // still submits the form otherwise.
      if (active >= 0) {
        e.preventDefault();
        choose(suggestions[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocateErr("This device can't share its location.");
      return;
    }
    setLocating(true);
    setLocateErr(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `/api/address?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`,
            { cache: "no-store" }
          );
          const json = await res.json().catch(() => null);
          const first: AddressSuggestion | undefined = json?.suggestions?.[0];
          if (first) {
            // Keep the device's own coordinates: they're more precise than the
            // matched address, and the intake form records lat/long directly.
            choose({ ...first, latitude, longitude });
          } else {
            setLocateErr("Couldn't find an address at your location — type it in.");
          }
        } catch {
          setLocateErr("Couldn't look up your location — type the address in.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocateErr(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked for this site — allow it in your browser settings, or type the address."
            : "Couldn't get your location — type the address in."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  const canLocate = showCurrentLocation && configured === true;

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        placeholder={placeholder}
        className={className}
        autoComplete={autoComplete}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--border-default)] bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: the input's blur would otherwise close
                // the list before the click landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition " +
                  (i === active ? "bg-[var(--anchor-mint)]/40" : "hover:bg-[var(--surface-soft)]")
                }
              >
                <span aria-hidden className="mt-0.5 shrink-0 text-[var(--anchor-gray)]">📍</span>
                <span className="min-w-0 text-black">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {canLocate && (
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/30 disabled:opacity-50"
        >
          <span aria-hidden>➳</span>
          {locating ? "Finding you…" : "Use my current location"}
        </button>
      )}

      {locateErr && <p className="mt-1 text-[11px] text-amber-700">{locateErr}</p>}
    </div>
  );
}
