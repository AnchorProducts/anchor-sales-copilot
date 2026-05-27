"use client";

import jsPDF from "jspdf";

// Full event log for one user over a time window: a summary header plus every
// event (timestamp, type, detail) they logged.

type EventRow = { at: string; type: string; detail: string };

export type UserEventLogPayload = {
  name: string;
  email: string;
  windowLabel: string;
  lastSeen: string | null;
  signedUp?: boolean;
  truncated?: boolean;
  events: EventRow[];
};

const ANCHOR_DEEP: [number, number, number] = [12, 74, 50];
const SOFT: [number, number, number] = [236, 240, 238];

const EVENT_LABELS: Record<string, string> = {
  login: "Login",
  app_open: "App open",
  page_view: "Page view",
  click: "Click",
  chat_message_sent: "Chat message",
  lead_submitted: "Lead",
  commission_submitted: "Commission claim",
  notable_project_submitted: "Notable project",
  doc_opened: "Doc opened",
};
function eventLabel(t: string): string {
  return EVENT_LABELS[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

type Doc = { doc: jsPDF; W: number; H: number; m: number; y: number };

function portraitDoc(): Doc {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  return { doc, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight(), m: 40, y: 48 };
}

function ensure(d: Doc, need: number) {
  if (d.y + need > d.H - d.m) { d.doc.addPage(); d.y = 48; }
}

function fmtAt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function drawTable(d: Doc, cols: Array<{ label: string; w: number; align?: "left" | "right" }>, rows: string[][]) {
  const rowH = 13;
  const drawHead = () => {
    d.doc.setFillColor(...SOFT);
    d.doc.rect(d.m, d.y, cols.reduce((s, c) => s + c.w, 0), rowH, "F");
    d.doc.setFont("helvetica", "bold");
    d.doc.setFontSize(7.5);
    d.doc.setTextColor(110);
    let x = d.m;
    for (const c of cols) {
      const maxChars = Math.floor(c.w / 4.1);
      const label = c.label.length > maxChars ? c.label.slice(0, maxChars - 1) + "…" : c.label;
      d.doc.text(label, c.align === "right" ? x + c.w - 3 : x + 3, d.y + 9, { align: c.align === "right" ? "right" : "left" });
      x += c.w;
    }
    d.y += rowH;
  };
  ensure(d, rowH * 2);
  drawHead();
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(7.5);
  for (const row of rows) {
    if (d.y + rowH > d.H - d.m) { d.doc.addPage(); d.y = 48; drawHead(); d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(7.5); }
    d.doc.setTextColor(45);
    let x = d.m;
    row.forEach((val, i) => {
      const c = cols[i];
      const maxChars = Math.floor(c.w / 4.1);
      const text = val.length > maxChars ? val.slice(0, maxChars - 1) + "…" : val;
      d.doc.text(text, c.align === "right" ? x + c.w - 3 : x + 3, d.y + 9, { align: c.align === "right" ? "right" : "left" });
      x += c.w;
    });
    d.y += rowH;
  }
}

export function generateUserEventLogPdf(p: UserEventLogPayload) {
  const d = portraitDoc();

  // Header.
  d.doc.setFont("helvetica", "bold");
  d.doc.setFontSize(16);
  d.doc.setTextColor(...ANCHOR_DEEP);
  d.doc.text(p.name, d.m, d.y);
  d.y += 16;
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(9);
  d.doc.setTextColor(110);
  const status = p.signedUp === false ? "  ·  Not signed up" : "";
  d.doc.text(`${p.email}  ·  ${p.windowLabel}${status}  ·  Generated ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`, d.m, d.y);
  d.y += 18;

  // Summary line + event-type mix.
  const byType: Record<string, number> = {};
  for (const e of p.events) byType[e.type] = (byType[e.type] ?? 0) + 1;
  const mix = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${eventLabel(t)} ${n}`).join("  ·  ");

  d.doc.setFont("helvetica", "bold");
  d.doc.setFontSize(11);
  d.doc.setTextColor(...ANCHOR_DEEP);
  d.doc.text(`${p.events.length.toLocaleString()} events${p.truncated ? " (most recent shown)" : ""}`, d.m, d.y + 4);
  d.y += 16;
  if (mix) {
    d.doc.setFont("helvetica", "normal");
    d.doc.setFontSize(8);
    d.doc.setTextColor(90);
    const lines = d.doc.splitTextToSize(mix, d.W - d.m * 2);
    d.doc.text(lines, d.m, d.y + 6);
    d.y += 6 + lines.length * 11 + 6;
  }

  // Event table.
  if (p.events.length === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(9); d.doc.setTextColor(120);
    d.doc.text(p.signedUp === false ? "This contact hasn't signed up, so there's no app activity." : "No events in this window.", d.m, d.y + 8);
  } else {
    const usable = d.W - d.m * 2;
    drawTable(
      d,
      [
        { label: "When", w: 120 },
        { label: "Type", w: 110 },
        { label: "Detail", w: usable - 230 },
      ],
      p.events.map((e) => [fmtAt(e.at), eventLabel(e.type), e.detail || "—"]),
    );
  }

  d.doc.save(`events_${p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}_${p.windowLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
}
