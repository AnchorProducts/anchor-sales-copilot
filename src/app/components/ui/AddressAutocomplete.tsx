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
  const inputRef = useRef<HTMLInputElement | null>(null);
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
    if (!open || rowCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rowCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? rowCount - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Only intercept Enter when a row is actually highlighted, so it still
      // submits the form otherwise.
      if (active >= 0) {
        e.preventDefault();
        if (hasLocateRow && active === 0) useCurrentLocation();
        else choose(suggestions[active - (hasLocateRow ? 1 : 0)]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
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



  // "Current location" sits at the top of the sheet the way Maps and every
  // ride app do it — that's where people look for it, and it keeps the field
  // itself clean. The list is one array so the arrow keys walk it naturally.
  const canLocate = showCurrentLocation && configured === true;
  const hasLocateRow = canLocate;
  const rowCount = suggestions.length + (hasLocateRow ? 1 : 0);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        // Room for the trailing button; inline so it can't be lost to CSS order.
        style={canLocate ? { paddingRight: 42 } : undefined}
        autoComplete={autoComplete}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
      />

      {/* Trailing glyph inside the field, the way iOS puts the locate control
          in a search bar rather than parking a button underneath it. */}
      {canLocate && (
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          aria-label="Use my current location"
          title="Use my current location"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--anchor-green)] transition active:scale-90 active:bg-[var(--anchor-green)]/10 disabled:opacity-40 sm:hover:bg-[var(--anchor-green)]/10"
        >
          {locating ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            // SF Symbol "location.fill" — the arrow iOS uses for this everywhere.
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
              <path d="M21.4 2.6a1 1 0 0 0-1.1-.2L3 9.9c-.9.4-.8 1.7.1 2l7 2.3 2.3 7c.3.9 1.6 1 2 .1l7.5-17.3a1 1 0 0 0-.5-1.4z" />
            </svg>
          )}
        </button>
      )}

      {open && rowCount > 0 && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto overscroll-contain rounded-2xl border border-black/5 bg-white py-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
        >
          {hasLocateRow && (
            <li role="option" aria-selected={active === 0}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  useCurrentLocation();
                }}
                onMouseEnter={() => setActive(0)}
                disabled={locating}
                className={
                  "flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium text-[var(--anchor-green)] transition " +
                  (active === 0 ? "bg-[var(--anchor-green)]/8" : "")
                }
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--anchor-green)]/10">
                  <svg viewBox="0 0 24 24" className={"h-4 w-4" + (locating ? " animate-spin" : "")} fill={locating ? "none" : "currentColor"} aria-hidden>
                    {locating ? (
                      <>
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </>
                    ) : (
                      <path d="M21.4 2.6a1 1 0 0 0-1.1-.2L3 9.9c-.9.4-.8 1.7.1 2l7 2.3 2.3 7c.3.9 1.6 1 2 .1l7.5-17.3a1 1 0 0 0-.5-1.4z" />
                    )}
                  </svg>
                </span>
                {locating ? "Finding you\u2026" : "Current location"}
              </button>
            </li>
          )}

          {suggestions.map((s, i) => {
            const idx = i + (hasLocateRow ? 1 : 0);
            return (
              <li key={s.id} role="option" aria-selected={idx === active}>
                <button
                  type="button"
                  // mousedown, not click: the input's blur would otherwise close
                  // the list before the click landed.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                  onMouseEnter={() => setActive(idx)}
                  className={
                    "flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] transition " +
                    (idx === active ? "bg-black/[0.04]" : "")
                  }
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[var(--anchor-gray)]">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate leading-snug text-black">{s.label}</span>
                    {s.secondary && (
                      <span className="block truncate text-[13px] leading-snug text-[var(--anchor-gray)]">
                        {s.secondary}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {locateErr && <p className="mt-1.5 text-[13px] leading-snug text-amber-700">{locateErr}</p>}
    </div>
  );
}
