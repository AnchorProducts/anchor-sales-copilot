"use client";

// PUBLIC (no login) pizza-box scanner, opened by scanning the QR label on a
// pre-assembled box. Marketing builds the boxes ahead of time; this is how one
// leaves the shelf and comes off inventory.
//
//   Scan    — the first box's label opens this page and counts itself. "Scan a
//             box" keeps the camera open right here, so a stack is one pass:
//             each label adds a box. Labels are one per box TYPE, so the same
//             code only counts again once it has left the frame — holding the
//             camera on one box can't count it twice.
//   Review  — everything those boxes hold, added up: anchors, each series'
//             pieces, the printables every box gets. Pulled a brochure out to
//             leave behind? Lower that line. Only what's left is subtracted.
//
// The pass lives in localStorage, so a label scanned with the phone's own
// camera app (which opens a fresh tab per code) adds to the same pass instead
// of starting over. Name and email are shared with the aisle page.
//
// Reached at /grab/<token>/boxes; ?box=<sample id> is the label that opened it.

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Field";
import { boxIdFromScan, boxTotals, type BoxPart, type BoxPartKind } from "@/lib/inventory";

export const dynamic = "force-dynamic";

type BoxType = {
  id: string;
  name: string;
  kit: string;
  kit_label: string;
  image_url: string | null;
  parts: BoxPart[];
};

// Box counts per type, and how many of each item were pulled back out.
type Pass = { at: number; counts: Record<string, number>; removed: Record<string, number> };

type Result = {
  boxes: { name: string; count: number }[];
  lines: { item_id: string; item_name: string; quantity: number; removed: number; short: number }[];
  failed: { item_name: string; error: string }[];
};

const ID_KEY = "anchor-grab-identity"; // shared with the aisle page
const PASS_KEY = "anchor-box-scan";
// A pass nobody finished by the next morning is abandoned, not still going.
const PASS_TTL_MS = 12 * 60 * 60 * 1000;
// How long a code must be out of frame before it counts again.
const REARM_MS = 1000;

const KIND_LABEL: Record<BoxPartKind, string> = {
  anchor: "Anchor",
  piece: "Pizza box piece",
  extra: "In every box",
};

function emptyPass(): Pass {
  return { at: Date.now(), counts: {}, removed: {} };
}

// The stored pass: null when there isn't one (or it's expired), undefined when
// storage itself is unavailable — so a private window falls back to memory
// instead of forgetting every scan.
function readStoredPass(): Pass | null | undefined {
  try {
    const p = JSON.parse(localStorage.getItem(PASS_KEY) || "null");
    if (!p || Date.now() - Number(p.at) > PASS_TTL_MS) return null;
    return { at: Number(p.at), counts: p.counts || {}, removed: p.removed || {} };
  } catch {
    return undefined;
  }
}

function writeStoredPass(p: Pass) {
  try {
    if (Object.keys(p.counts).length) localStorage.setItem(PASS_KEY, JSON.stringify(p));
    else localStorage.removeItem(PASS_KEY);
  } catch {
    /* ignore — the in-memory pass still works */
  }
}

function Stepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-lg font-bold text-[var(--anchor-deep,#0f2e2a)] disabled:opacity-30"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-bold text-[var(--anchor-deep,#0f2e2a)]">{value}</span>
      <button
        type="button"
        aria-label={`One more ${label}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-lg font-bold text-[var(--anchor-deep,#0f2e2a)] disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

// The in-page camera. Decodes a downscaled frame a few times a second with
// jsQR — pure JS, so it works in iOS Safari, which has no BarcodeDetector.
// Reports every decode (or "" for a frame with no code) and leaves deciding
// what counts to the page.
function Scanner({ onFrame, onClose }: { onFrame: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFrameRef = useRef(onFrame);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let stream: MediaStream | null = null;
    let last = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("This browser can't open the camera here. Add boxes by hand below.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setErr("Couldn't open the camera. Allow camera access for this site, or add boxes by hand below.");
        return;
      }
      if (!alive || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const tick = (now: number) => {
        if (!alive) return;
        raf = requestAnimationFrame(tick);
        if (now - last < 150 || video.readyState < 2 || !ctx) return;
        last = now;
        // A full 1080p frame every 150ms stutters an older phone; a label fills
        // enough of the frame to read at 640px.
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        onFrameRef.current(hit?.data || "");
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card className="mb-4 overflow-hidden p-0">
      {err ? (
        <div className="p-4 text-sm text-amber-800">{err}</div>
      ) : (
        <div className="relative aspect-square w-full bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 p-3">
        <span className="text-xs text-[var(--anchor-gray,#5b6b66)]">Point at the label on each box.</span>
        <Button variant="secondary" onClick={onClose} className="shrink-0">
          Done scanning
        </Button>
      </div>
    </Card>
  );
}

export default function BoxScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ box?: string }>;
}) {
  const { token } = use(params);
  const { box } = use(searchParams);
  const openedWith = (box || "").trim();

  const [types, setTypes] = useState<BoxType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [removed, setRemoved] = useState<Record<string, number>>({});
  const memPass = useRef<Pass>(emptyPass());
  const consumedLabel = useRef(false);

  const [step, setStep] = useState<"scan" | "review">("scan");
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean; key: number } | null>(null);
  const [manualId, setManualId] = useState("");
  const seen = useRef({ code: "", at: 0 });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  // Every change re-reads the stored pass first, so a box another tab added
  // (the camera app opens one per label) is kept rather than overwritten.
  const update = useCallback((fn: (p: Pass) => void) => {
    const stored = readStoredPass();
    const base = stored === undefined ? memPass.current : stored || emptyPass();
    const pass: Pass = { at: Date.now(), counts: { ...base.counts }, removed: { ...base.removed } };
    fn(pass);
    for (const [k, v] of Object.entries(pass.counts)) if (!(v > 0)) delete pass.counts[k];
    for (const [k, v] of Object.entries(pass.removed)) if (!(v > 0)) delete pass.removed[k];
    memPass.current = pass;
    writeStoredPass(pass);
    setCounts(pass.counts);
    setRemoved(pass.removed);
  }, []);

  // Restore the pass, count the label that opened the page, and strip ?box so a
  // reload doesn't count that box a second time.
  useEffect(() => {
    if (openedWith && !consumedLabel.current) {
      consumedLabel.current = true;
      update((p) => {
        p.counts[openedWith] = (p.counts[openedWith] || 0) + 1;
      });
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("box");
        window.history.replaceState(window.history.state, "", url.toString());
      } catch {
        /* ignore */
      }
    } else {
      update(() => {});
    }
  }, [openedWith, update]);

  // Keep open tabs of the same pass in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PASS_KEY) return;
      const p = readStoredPass() || emptyPass();
      setCounts(p.counts);
      setRemoved(p.removed);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ID_KEY) || "null");
      if (saved?.name) setName(String(saved.name));
      if (saved?.email) setEmail(String(saved.email));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/grab/boxes?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setLoadErr(json?.error || "This pickup link is invalid or disabled.");
          return;
        }
        setTypes(json?.boxes || []);
      } catch {
        if (alive) setLoadErr("Couldn't reach the server. Check your connection and try again.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const addBox = useCallback(
    (id: string, delta: number) => {
      update((p) => {
        p.counts[id] = Math.max(0, (p.counts[id] || 0) + delta);
      });
    },
    [update]
  );

  // A code counts when it arrives, then not again until it has been out of
  // frame for REARM_MS — every detection of it pushes that window out.
  const onFrame = useCallback(
    (text: string) => {
      if (!text) return;
      const now = Date.now();
      const again = text === seen.current.code && now - seen.current.at < REARM_MS;
      seen.current = { code: text, at: now };
      if (again) return;
      const type = typeById.get(boxIdFromScan(text));
      if (!type) {
        setFlash({ text: "That code isn't a pizza box label.", ok: false, key: now });
        return;
      }
      addBox(type.id, 1);
      navigator.vibrate?.(60);
      setFlash({ text: `+1 ${type.name}`, ok: true, key: now });
    },
    [typeById, addBox]
  );

  const scanned = useMemo(() => types.filter((t) => (counts[t.id] || 0) > 0), [types, counts]);
  const totalBoxes = useMemo(() => scanned.reduce((n, t) => n + counts[t.id], 0), [scanned, counts]);
  // Scanned before this page knew the type — a label for a sample that isn't a
  // box anymore. The server ignores these; say so rather than silently drop them.
  const unknownIds = useMemo(
    () => (loading ? [] : Object.keys(counts).filter((id) => !typeById.has(id))),
    [loading, counts, typeById]
  );

  const totals = useMemo(
    () => boxTotals(scanned.map((t) => ({ count: counts[t.id], parts: t.parts }))),
    [scanned, counts]
  );
  const taking = (line: { item_id: string; packed: number }) =>
    Math.max(0, line.packed - (removed[line.item_id] || 0));
  const pulledOut = totals.reduce((n, l) => n + (l.packed - taking(l)), 0);

  function setTaking(line: { item_id: string; packed: number }, next: number) {
    const keep = Math.max(0, Math.min(next, line.packed));
    update((p) => {
      p.removed[line.item_id] = line.packed - keep;
    });
  }

  function clearPass() {
    update((p) => {
      p.counts = {};
      p.removed = {};
    });
    setStep("scan");
  }

  async function submit() {
    setFormErr(null);
    if (!scanned.length) return setFormErr("Scan at least one box.");
    if (!name.trim()) return setFormErr("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setFormErr("Enter a valid email.");

    setBusy(true);
    try {
      const res = await fetch("/api/public/grab/boxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim(),
          email: email.trim(),
          website,
          boxes: scanned.map((t) => ({ item_id: t.id, count: counts[t.id] })),
          take: Object.fromEntries(totals.map((l) => [l.item_id, taking(l)])),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormErr(json?.error || "Couldn't record those boxes.");
        return;
      }
      try {
        localStorage.setItem(ID_KEY, JSON.stringify({ name: name.trim(), email: email.trim() }));
      } catch {
        /* ignore */
      }
      setResult({ boxes: json?.boxes || [], lines: json?.lines || [], failed: json?.failed || [] });
      clearPass();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const resultBoxes = result ? result.boxes.reduce((n, b) => n + b.count, 0) : 0;

  return (
    <main className="min-h-screen bg-[var(--surface-soft,#f6f7f5)] px-4 pb-28 pt-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 text-center">
          <h1 className="text-xl font-bold text-[var(--anchor-deep,#0f2e2a)]">🍕 Pizza boxes</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray,#5b6b66)]">
            {step === "scan"
              ? "Scan the label on every box you're taking, then review what's inside."
              : "Took something out of the boxes to leave behind? Lower it — only what you keep comes off inventory."}
          </p>
        </header>

        {result && (
          <Card className="mb-4 border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Thanks! Recorded <strong>{resultBoxes}</strong> pizza box{resultBoxes === 1 ? "" : "es"}.
            {result.lines.some((l) => l.removed > 0) && (
              <div className="mt-1">
                Left out:{" "}
                {result.lines
                  .filter((l) => l.removed > 0)
                  .map((l) => `${l.removed} × ${l.item_name}`)
                  .join(", ")}
                .
              </div>
            )}
            {result.lines.some((l) => l.short > 0) && (
              <div className="mt-2 text-amber-800">
                The count for{" "}
                {result.lines
                  .filter((l) => l.short > 0)
                  .map((l) => l.item_name)
                  .join(", ")}{" "}
                was lower than what was in the boxes — marketing has been told to recount.
              </div>
            )}
            {result.failed.length > 0 && (
              <div className="mt-2 text-amber-800">
                Couldn&apos;t take: {result.failed.map((f) => `${f.item_name}: ${f.error}`).join("; ")}.
              </div>
            )}
          </Card>
        )}

        {flash && (
          <div
            key={flash.key}
            className={`fixed inset-x-4 top-4 z-20 mx-auto max-w-md rounded-xl px-4 py-3 text-center text-sm font-semibold shadow-lg ${
              flash.ok ? "bg-[var(--anchor-green,#1f8a4c)] text-white" : "bg-amber-100 text-amber-900"
            }`}
          >
            {flash.text}
          </div>
        )}

        {formErr && <Card className="mb-3 border-red-200 bg-red-50 p-3 text-sm text-red-700">{formErr}</Card>}

        {loading ? (
          <Card className="p-5 text-sm text-black/60">Loading…</Card>
        ) : loadErr ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
        ) : types.length === 0 ? (
          <Card className="p-6 text-center text-sm text-[var(--anchor-gray,#5b6b66)]">
            No pizza boxes are set up yet — let marketing know.
          </Card>
        ) : step === "scan" ? (
          <>
            {scanning ? (
              <Scanner onFrame={onFrame} onClose={() => setScanning(false)} />
            ) : (
              <Button onClick={() => setScanning(true)} className="mb-4 w-full">
                📷 {totalBoxes ? "Scan another box" : "Scan a box"}
              </Button>
            )}

            {unknownIds.length > 0 && (
              <Card className="mb-3 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {unknownIds.length === 1 ? "A label you scanned isn't" : "Some labels you scanned aren't"} a pizza
                box that&apos;s set up anymore, so {unknownIds.length === 1 ? "it" : "they"} won&apos;t count.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() =>
                    update((p) => {
                      for (const id of unknownIds) delete p.counts[id];
                    })
                  }
                >
                  Remove
                </button>
              </Card>
            )}

            {scanned.length === 0 ? (
              <Card className="p-6 text-center text-sm text-[var(--anchor-gray,#5b6b66)]">
                No boxes yet — scan the label on each box you&apos;re taking.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {scanned.map((t) => (
                  <Card key={t.id} className="flex items-center gap-3 p-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/5">
                      {t.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.image_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold leading-snug text-[var(--anchor-deep,#0f2e2a)] break-words">
                        {t.name}
                      </h3>
                      <p className="text-xs text-[var(--anchor-gray,#5b6b66)]">{t.kit_label} pizza box</p>
                    </div>
                    <Stepper
                      value={counts[t.id]}
                      max={500}
                      onChange={(n) => addBox(t.id, n - counts[t.id])}
                      label={`${t.name} box`}
                    />
                  </Card>
                ))}
              </div>
            )}

            {/* The camera won't always cooperate — a glare-y label, a blocked
                permission. Counting by hand is the same list. */}
            <Card className="mt-4 p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                Label won&apos;t scan? Add a box by hand
              </p>
              <div className="flex gap-2">
                <select
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 text-sm"
                >
                  <option value="">Choose a box…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.kit_label})
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  disabled={!manualId}
                  onClick={() => {
                    addBox(manualId, 1);
                    setManualId("");
                  }}
                  className="shrink-0"
                >
                  Add
                </Button>
              </div>
            </Card>

            <p className="mt-4 text-center text-xs text-[var(--anchor-gray,#5b6b66)]">
              Taking loose items instead?{" "}
              <a href={`/grab/${encodeURIComponent(token)}`} className="font-semibold underline">
                Go to the aisle
              </a>
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("scan")}
              className="mb-3 text-sm font-semibold text-[var(--anchor-green,#1f8a4c)] underline"
            >
              ← Keep scanning
            </button>

            <Card className="mb-3 p-3 text-xs text-[var(--anchor-gray,#5b6b66)]">
              {scanned.map((t) => `${counts[t.id]} × ${t.name}`).join(" · ")}
            </Card>

            <div className="grid grid-cols-1 gap-2.5">
              {totals.map((line) => {
                const n = taking(line);
                const out = line.packed - n;
                return (
                  <Card key={line.item_id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold leading-snug text-[var(--anchor-deep,#0f2e2a)] break-words">
                        {line.name}
                      </h3>
                      <p className="text-xs text-[var(--anchor-gray,#5b6b66)]">
                        {KIND_LABEL[line.kind]} · {line.packed} in the boxes
                      </p>
                      {out > 0 && <p className="text-xs font-semibold text-amber-700">{out} pulled out</p>}
                    </div>
                    <Stepper value={n} max={line.packed} onChange={(v) => setTaking(line, v)} label={line.name} />
                  </Card>
                );
              })}
            </div>

            <Card className="mt-4 p-4">
              <div className="grid grid-cols-1 gap-2.5">
                <label className="block text-sm">
                  <span className="font-medium">Your name</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Your email</span>
                  <Input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </label>
                {/* Honeypot — off-screen; bots fill it, humans don't. */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="absolute left-[-9999px] h-0 w-0 opacity-0"
                />
              </div>
            </Card>
          </>
        )}

        <p className="mt-5 text-center text-[11px] text-black/35">Anchor Products · Marketing inventory</p>
      </div>

      {!loading && !loadErr && totalBoxes > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                {totalBoxes} box{totalBoxes === 1 ? "" : "es"}
                {step === "review" && pulledOut > 0 ? ` · ${pulledOut} pulled out` : ""}
              </div>
              <button
                type="button"
                onClick={clearPass}
                className="text-xs text-[var(--anchor-gray,#5b6b66)] underline"
              >
                Start over
              </button>
            </div>
            {step === "scan" ? (
              <Button
                onClick={() => {
                  setScanning(false);
                  setResult(null);
                  setStep("review");
                  window.scrollTo({ top: 0 });
                }}
                className="shrink-0"
              >
                Review what&apos;s inside
              </Button>
            ) : (
              <Button onClick={submit} disabled={busy} className="shrink-0">
                {busy ? "Recording…" : `Take ${totalBoxes} box${totalBoxes === 1 ? "" : "es"}`}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
