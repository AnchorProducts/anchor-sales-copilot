// OEM orders — the request shape, shared by the store, the API and the views
// that render one.
//
// Samples are pizza boxes. A customer order sends the ones we have on the shelf
// (small orders, capped — see CUSTOMER_SAMPLE_CAP). An OEM order is for a large
// run or a manufacturing partner, and everything in it is printed for that
// partner: the box, inserts, overlay and printables, with the anchors printed
// separately. Nothing comes out of marketing inventory.
//
// Both kinds offer the same three builds per sample: a fully built box, the
// anchor with its overlay, or just the anchor.
//
// Safe to import from client and server — no server-only dependencies.

export type MarketingOrderType = "customer" | "oem";

export function marketingOrderTypeLabel(key: string | null | undefined): string {
  return key === "oem" ? "OEM order" : "Customer order";
}

// ── Builds ──────────────────────────────────────────────────────────────────

export type SampleBuild = "full" | "overlay" | "anchor";

export const SAMPLE_BUILDS: { key: SampleBuild; label: string; stock: string; oem: string }[] = [
  {
    key: "full",
    label: "Fully built box",
    stock: "Anchor in its pizza box with the inserts, overlay and printables",
    oem: "Box, inserts, overlay and printables — all printed custom",
  },
  {
    key: "overlay",
    label: "Anchor + overlay",
    stock: "The anchor with its plastic overlay, no box",
    oem: "The anchor with a custom-printed overlay, no box",
  },
  {
    key: "anchor",
    label: "Anchor only",
    stock: "Just the anchor",
    oem: "Just the printed anchor",
  },
];

export function sampleBuildLabel(key: string | null | undefined): string {
  return SAMPLE_BUILDS.find((b) => b.key === key)?.label || "Anchor only";
}

export function isSampleBuild(v: unknown): v is SampleBuild {
  return v === "full" || v === "overlay" || v === "anchor";
}

// ── Artwork ─────────────────────────────────────────────────────────────────

// Private bucket + prefix artwork is uploaded under. The API refuses artwork
// paths outside it, so an order can't be made to point at someone else's file.
export const OEM_ARTWORK_BUCKET = "knowledge";
export const OEM_ARTWORK_PREFIX = "marketing-orders/oem/";
export const OEM_ARTWORK_MAX_FILES = 20;
// Print files run big (layered PDFs, AI, PSD); they go browser→storage on a
// signed URL, so this is a sanity cap, not Vercel's body limit.
export const OEM_ARTWORK_MAX_BYTES = 200 * 1024 * 1024;

export type OemArtworkFile = { path: string; filename: string; size: number; content_type: string };

export type OemArtworkStatus = "ready" | "coming" | "needs_design";

export const OEM_ARTWORK_STATUSES: { key: OemArtworkStatus; label: string; hint: string }[] = [
  { key: "ready", label: "Artwork attached", hint: "Print-ready files are uploaded or linked below." },
  { key: "coming", label: "Partner is sending it", hint: "Files will follow in the order's messages." },
  { key: "needs_design", label: "Marketing designs it", hint: "Send logos and brand notes; marketing lays it out." },
];

// ── The request ─────────────────────────────────────────────────────────────

export type OemLine = {
  // The catalog anchor it's based on; "" for one that isn't in the catalog.
  item_id: string;
  model: string;
  build: SampleBuild;
  quantity: number;
  // The print on the anchor itself — its own run.
  imprint: string;
  // The print on the box / inserts / overlay, when the build has any.
  print: string;
};

export type OemSpec = {
  company: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  project: string;
  lines: OemLine[];
  artwork_status: OemArtworkStatus;
  artwork_link: string;
  artwork: OemArtworkFile[];
  proof_required: boolean;
};

export const OEM_LIMITS = {
  MAX_QTY: 100000,
  MAX_ROWS: 40,
  TEXT: 500,
  SHORT: 200,
};

function str(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function qty(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, OEM_LIMITS.MAX_QTY) : 0;
}

// Coerce whatever the client sent into a clean spec. Used by the API before it
// validates, and by the views to read a stored spec defensively.
export function normalizeOemSpec(raw: unknown): OemSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const status = OEM_ARTWORK_STATUSES.some((s) => s.key === r.artwork_status)
    ? (r.artwork_status as OemArtworkStatus)
    : "ready";
  return {
    company: str(r.company, OEM_LIMITS.SHORT),
    contact_name: str(r.contact_name, OEM_LIMITS.SHORT),
    contact_email: str(r.contact_email, OEM_LIMITS.SHORT),
    contact_phone: str(r.contact_phone, 40),
    project: str(r.project, OEM_LIMITS.SHORT),
    lines: (Array.isArray(r.lines) ? r.lines : [])
      .slice(0, OEM_LIMITS.MAX_ROWS)
      .map((l: any) => ({
        item_id: str(l?.item_id, 64),
        model: str(l?.model, OEM_LIMITS.SHORT),
        build: isSampleBuild(l?.build) ? l.build : "anchor",
        quantity: qty(l?.quantity),
        imprint: str(l?.imprint, OEM_LIMITS.TEXT),
        print: str(l?.print, OEM_LIMITS.TEXT),
      }))
      .filter((l: OemLine) => l.model && l.quantity > 0),
    artwork_status: status,
    artwork_link: str(r.artwork_link, 1000),
    artwork: (Array.isArray(r.artwork) ? r.artwork : [])
      .slice(0, OEM_ARTWORK_MAX_FILES)
      .map((f: any) => ({
        path: str(f?.path, 500),
        filename: str(f?.filename, OEM_LIMITS.SHORT),
        size: Math.max(0, Math.floor(Number(f?.size)) || 0),
        content_type: str(f?.content_type, 100),
      }))
      .filter((f: OemArtworkFile) => f.path.startsWith(OEM_ARTWORK_PREFIX) && !f.path.includes("..")),
    proof_required: r.proof_required !== false,
  };
}

// What's wrong with a spec, as one sentence for the rep. null = good to go.
export function oemSpecProblem(spec: OemSpec): string | null {
  if (!spec.company) return "Name the OEM partner this order is for.";
  if (spec.lines.length === 0) return "Add at least one sample to the OEM order.";
  if (spec.artwork_status === "ready" && spec.artwork.length === 0 && !spec.artwork_link) {
    return "Attach the artwork or add a link to it — or say it's coming later.";
  }
  return null;
}

export function oemUnits(spec: Pick<OemSpec, "lines">): number {
  return spec.lines.reduce((n, l) => n + l.quantity, 0);
}

export function oemBoxes(spec: Pick<OemSpec, "lines">): number {
  return spec.lines.filter((l) => l.build === "full").reduce((n, l) => n + l.quantity, 0);
}

function buildWords(build: SampleBuild): string {
  if (build === "full") return "fully built box (box, inserts, overlay & printables printed custom)";
  if (build === "overlay") return "anchor + custom-printed overlay";
  return "anchor only";
}

// The order in words — the `items` text every existing view, email and printout
// already renders, so an OEM order reads correctly everywhere without them
// having to know its shape.
export function describeOemSpec(spec: OemSpec): string[] {
  const lines: string[] = [];
  lines.push(`OEM order for ${spec.company || "—"}${spec.project ? ` — ${spec.project}` : ""}`);
  for (const l of spec.lines) {
    let line = `${l.quantity} × ${l.model} — ${buildWords(l.build)}`;
    line += ` · anchor printed separately${l.imprint ? `: ${l.imprint}` : ""}`;
    if (l.print && l.build !== "anchor") line += ` · print: ${l.print}`;
    lines.push(line);
  }
  const art = OEM_ARTWORK_STATUSES.find((s) => s.key === spec.artwork_status)?.label || "—";
  const files = spec.artwork.length
    ? ` (${spec.artwork.length} file${spec.artwork.length === 1 ? "" : "s"}: ${spec.artwork
        .map((f) => f.filename)
        .join(", ")})`
    : "";
  lines.push(`Artwork: ${art}${files}${spec.artwork_link ? ` · ${spec.artwork_link}` : ""}`);
  if (spec.proof_required) lines.push("Proof required before production");
  const contact = [spec.contact_name, spec.contact_email, spec.contact_phone].filter(Boolean).join(" · ");
  if (contact) lines.push(`Partner contact: ${contact}`);
  return lines;
}
