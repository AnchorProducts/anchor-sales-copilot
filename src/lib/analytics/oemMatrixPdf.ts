"use client";

import jsPDF from "jspdf";

// Full analytics report PDF: the per-manufacturer matrix (Sales/Tech/Consultant,
// leads and reports broken out — notable projects excluded) plus detailed
// last-30-day logs of every event and every project, with who did each.
// Honours optional manufacturer + group filters.

export type MatrixCellPerson = {
  name: string;
  email: string | null;
  signedUp: boolean;
  uses30: number;
  leads30: number;
  reports30: number;
};

export type MatrixCell = {
  downloaded: number;
  notDownloaded: number;
  usesPerWeek: number;
  uses30: number;
  notReporting: number;
  leads30: number;
  reports30: number;
  people: MatrixCellPerson[];
};

export type MatrixGroup = "sales" | "tech" | "consultant";
export type MatrixRow = { manufacturer: string; groups: Record<MatrixGroup, MatrixCell> };

export type EventDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; type: string; at: string; label: string };
export type ProjectDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; kind: "Lead" | "Report"; at: string; company: string };

export type MatrixPdfPayload = {
  rows: MatrixRow[];
  totals: Record<MatrixGroup, MatrixCell>;
  events: EventDetail[];
  projects: ProjectDetail[];
};

export type MatrixPdfFilters = { manufacturer: string; group: string };

const GROUP_LABEL: Record<MatrixGroup, string> = { sales: "Sales Reps", tech: "Tech Reps", consultant: "Consultants" };
const ALL_GROUPS: MatrixGroup[] = ["sales", "tech", "consultant"];
const SUB_COLS = [
  { key: "downloaded", label: "Down" },
  { key: "notDownloaded", label: "Not" },
  { key: "uses30", label: "Uses" },
  { key: "leads30", label: "Leads" },
  { key: "reports30", label: "Reps" },
] as const;

function emptyCell(): MatrixCell {
  return { downloaded: 0, notDownloaded: 0, usesPerWeek: 0, uses30: 0, notReporting: 0, leads30: 0, reports30: 0, people: [] };
}

function matchesFilters(group: string, manufacturers: string[], f: MatrixPdfFilters): boolean {
  if (f.group !== "all" && group !== f.group) return false;
  if (f.manufacturer !== "all" && !manufacturers.includes(f.manufacturer)) return false;
  return true;
}

function resolve(payload: MatrixPdfPayload, filters: MatrixPdfFilters) {
  const groups: MatrixGroup[] = filters.group === "all" ? ALL_GROUPS : [filters.group as MatrixGroup];
  const rows = filters.manufacturer === "all" ? payload.rows : payload.rows.filter((r) => r.manufacturer === filters.manufacturer);
  const totals: Record<MatrixGroup, MatrixCell> = { sales: emptyCell(), tech: emptyCell(), consultant: emptyCell() };
  for (const r of rows) {
    for (const g of ALL_GROUPS) {
      const t = totals[g];
      const c = r.groups[g];
      t.downloaded += c.downloaded;
      t.notDownloaded += c.notDownloaded;
      t.uses30 += c.uses30;
      t.leads30 += c.leads30;
      t.reports30 += c.reports30;
    }
  }
  const events = (payload.events ?? []).filter((e) => matchesFilters(e.group, e.manufacturers, filters));
  const projects = (payload.projects ?? []).filter((p) => matchesFilters(p.group, p.manufacturers, filters));
  return { groups, rows, totals, events, projects };
}

function filterSummary(f: MatrixPdfFilters): string {
  const mfr = f.manufacturer === "all" ? "All manufacturers" : f.manufacturer;
  const grp = f.group === "all" ? "All types" : GROUP_LABEL[f.group as MatrixGroup] ?? f.group;
  return `${mfr}  ·  ${grp}`;
}

function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "report";
}

function fmtAt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const ANCHOR_DEEP: [number, number, number] = [12, 74, 50];
const SOFT: [number, number, number] = [236, 240, 238];

type Doc = { doc: jsPDF; W: number; H: number; m: number; y: number };

function landscapeDoc(): Doc {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  return { doc, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight(), m: 36, y: 40 };
}

function ensure(d: Doc, need: number) {
  if (d.y + need > d.H - d.m) { d.doc.addPage(); d.y = 40; }
}

function header(d: Doc, title: string, f: MatrixPdfFilters) {
  d.doc.setFont("helvetica", "bold");
  d.doc.setFontSize(16);
  d.doc.setTextColor(...ANCHOR_DEEP);
  d.doc.text(title, d.m, d.y);
  d.y += 16;
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(9);
  d.doc.setTextColor(110);
  d.doc.text(`Last 30 days  ·  ${filterSummary(f)}  ·  Generated ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`, d.m, d.y);
  d.y += 18;
}

function sectionTitle(d: Doc, title: string) {
  ensure(d, 30);
  d.doc.setFont("helvetica", "bold");
  d.doc.setFontSize(12);
  d.doc.setTextColor(...ANCHOR_DEEP);
  d.doc.text(title, d.m, d.y + 10);
  d.y += 22;
}

function drawMatrix(d: Doc, groups: MatrixGroup[], rows: MatrixRow[], totals: Record<MatrixGroup, MatrixCell>) {
  const usable = d.W - d.m * 2;
  const mfrW = 96;
  const cellW = (usable - mfrW) / (groups.length * SUB_COLS.length);
  const rowH = 15;

  const drawHead = () => {
    d.doc.setFillColor(...ANCHOR_DEEP);
    d.doc.rect(d.m + mfrW, d.y, groups.length * SUB_COLS.length * cellW, rowH, "F");
    d.doc.setTextColor(255);
    d.doc.setFont("helvetica", "bold");
    d.doc.setFontSize(8);
    groups.forEach((g, gi) => {
      const x = d.m + mfrW + gi * SUB_COLS.length * cellW;
      d.doc.text(GROUP_LABEL[g], x + (SUB_COLS.length * cellW) / 2, d.y + 10, { align: "center" });
    });
    d.doc.setTextColor(...ANCHOR_DEEP);
    d.doc.text("Manufacturer", d.m + 2, d.y + 10);
    d.y += rowH;
    d.doc.setFillColor(...SOFT);
    d.doc.rect(d.m, d.y, usable, rowH, "F");
    d.doc.setFontSize(7);
    d.doc.setTextColor(110);
    groups.forEach((g, gi) => SUB_COLS.forEach((sc, si) => {
      const x = d.m + mfrW + (gi * SUB_COLS.length + si) * cellW;
      d.doc.text(sc.label, x + cellW - 3, d.y + 10, { align: "right" });
    }));
    d.y += rowH;
  };

  ensure(d, rowH * 3);
  drawHead();
  d.doc.setFont("helvetica", "normal");
  for (const r of rows) {
    if (d.y + rowH > d.H - d.m) { d.doc.addPage(); d.y = 40; drawHead(); d.doc.setFont("helvetica", "normal"); }
    d.doc.setFontSize(8);
    d.doc.setFont("helvetica", "bold");
    d.doc.setTextColor(...ANCHOR_DEEP);
    d.doc.text(String(r.manufacturer).slice(0, 18), d.m + 2, d.y + 10);
    d.doc.setFont("helvetica", "normal");
    d.doc.setTextColor(40);
    groups.forEach((g, gi) => SUB_COLS.forEach((sc, si) => {
      const x = d.m + mfrW + (gi * SUB_COLS.length + si) * cellW;
      d.doc.text(String(r.groups[g][sc.key] as number), x + cellW - 3, d.y + 10, { align: "right" });
    }));
    d.doc.setDrawColor(225);
    d.doc.line(d.m, d.y + rowH, d.m + usable, d.y + rowH);
    d.y += rowH;
  }
  ensure(d, rowH);
  d.doc.setFillColor(...SOFT);
  d.doc.rect(d.m, d.y, usable, rowH, "F");
  d.doc.setFont("helvetica", "bold");
  d.doc.setTextColor(...ANCHOR_DEEP);
  d.doc.setFontSize(8);
  d.doc.text("Total", d.m + 2, d.y + 10);
  groups.forEach((g, gi) => SUB_COLS.forEach((sc, si) => {
    const x = d.m + mfrW + (gi * SUB_COLS.length + si) * cellW;
    d.doc.text(String(totals[g][sc.key] as number), x + cellW - 3, d.y + 10, { align: "right" });
  }));
  d.y += rowH + 6;
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(7);
  d.doc.setTextColor(130);
  d.doc.text("Down = signed up · Not = not signed up · Uses = events (30d) · Leads / Reps = leads / reports submitted (30d)", d.m, d.y);
  d.y += 16;
}

// Generic detail table: columns with fixed widths; rows of strings.
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
      d.doc.text(c.label, c.align === "right" ? x + c.w - 3 : x + 3, d.y + 9, { align: c.align === "right" ? "right" : "left" });
      x += c.w;
    }
    d.y += rowH;
  };
  ensure(d, rowH * 2);
  drawHead();
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(7.5);
  for (const row of rows) {
    if (d.y + rowH > d.H - d.m) { d.doc.addPage(); d.y = 40; drawHead(); d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(7.5); }
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
  d.y += 8;
}

export function generateFullAnalyticsPdf(payload: MatrixPdfPayload, filters: MatrixPdfFilters) {
  const d = landscapeDoc();
  const { groups, rows, totals, events, projects } = resolve(payload, filters);
  header(d, "Analytics Report", filters);

  // Per-group summary.
  d.doc.setFontSize(9);
  for (const g of groups) {
    const t = totals[g];
    const contacts = t.downloaded + t.notDownloaded;
    ensure(d, 16);
    d.doc.setFont("helvetica", "bold");
    d.doc.setTextColor(...ANCHOR_DEEP);
    d.doc.text(GROUP_LABEL[g], d.m, d.y + 10);
    d.doc.setFont("helvetica", "normal");
    d.doc.setTextColor(70);
    d.doc.text(`${contacts} contacts · ${t.downloaded} signed up · ${t.uses30} uses · ${t.leads30} leads · ${t.reports30} reports (30d)`, d.m + 110, d.y + 10);
    d.y += 16;
  }
  d.y += 8;

  if (rows.length > 0) drawMatrix(d, groups, rows, totals);

  // Events detail.
  sectionTitle(d, `Events — last 30 days (${events.length})`);
  if (events.length === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
    d.doc.text("No events in range for this selection.", d.m, d.y + 8); d.y += 18;
  } else {
    drawTable(
      d,
      [
        { label: "When", w: 96 },
        { label: "Who", w: 170 },
        { label: "Group", w: 90 },
        { label: "Event", w: 110 },
        { label: "Detail", w: 254 },
      ],
      events.map((e) => [fmtAt(e.at), e.person, e.groupLabel, e.type.replace(/_/g, " "), e.label || "—"]),
    );
  }

  // Projects detail (leads + reports, separated by the Kind column).
  sectionTitle(d, `Projects — last 30 days (${projects.length})`);
  if (projects.length === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
    d.doc.text("No projects in range for this selection.", d.m, d.y + 8); d.y += 18;
  } else {
    drawTable(
      d,
      [
        { label: "When", w: 96 },
        { label: "Who", w: 190 },
        { label: "Group", w: 90 },
        { label: "Kind", w: 64 },
        { label: "Company", w: 280 },
      ],
      projects.map((p) => [fmtAt(p.at), p.person, p.groupLabel, p.kind, p.company]),
    );
  }

  d.doc.save(`analytics-report_${safeName(filterSummary(filters))}_30d.pdf`);
}
