import jsPDF from "jspdf";

// OEM matrix PDF: the full per-manufacturer matrix (Sales/Tech/Consultant, all
// six on-screen columns) plus, for every OEM, the people behind each cell — the
// same drill-down you get by expanding a row — followed by detailed logs of
// every event and every project, with who did each. Everything reflects the
// caller's selected time window (passed as windowLabel).

export type MatrixCellPerson = {
  name: string;
  email: string | null;
  signedUp: boolean;
  uses: number;
  leads: number;
  reports: number;
};

export type MatrixCell = {
  downloaded: number;
  notDownloaded: number;
  uses: number;
  notReporting: number;
  leads: number;
  reports: number;
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

const GROUP_LABEL: Record<MatrixGroup, string> = { sales: "Sales Reps", tech: "Tech Reps", consultant: "Consultants" };
const ALL_GROUPS: MatrixGroup[] = ["sales", "tech", "consultant"];

// Mirror the on-screen matrix columns exactly.
const SUB_COLS = [
  { key: "downloaded", label: "Down" },
  { key: "notDownloaded", label: "Not" },
  { key: "uses", label: "Uses" },
  { key: "notReporting", label: "No proj" },
  { key: "leads", label: "Leads" },
  { key: "reports", label: "Reps" },
] as const;

function emptyCell(): MatrixCell {
  return { downloaded: 0, notDownloaded: 0, uses: 0, notReporting: 0, leads: 0, reports: 0, people: [] };
}

export function computeTotals(rows: MatrixRow[]): Record<MatrixGroup, MatrixCell> {
  const totals: Record<MatrixGroup, MatrixCell> = { sales: emptyCell(), tech: emptyCell(), consultant: emptyCell() };
  for (const r of rows) {
    for (const g of ALL_GROUPS) {
      const t = totals[g];
      const c = r.groups[g];
      t.downloaded += c.downloaded;
      t.notDownloaded += c.notDownloaded;
      t.uses += c.uses;
      t.notReporting += c.notReporting;
      t.leads += c.leads;
      t.reports += c.reports;
    }
  }
  return totals;
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

function header(d: Doc, title: string, subtitle: string) {
  d.doc.setFont("helvetica", "bold");
  d.doc.setFontSize(16);
  d.doc.setTextColor(...ANCHOR_DEEP);
  d.doc.text(title, d.m, d.y);
  d.y += 16;
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(9);
  d.doc.setTextColor(110);
  d.doc.text(`${subtitle}  ·  Generated ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`, d.m, d.y);
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
  d.doc.text("Down = signed up · Not = not signed up · Uses = events · No proj = signed up but no lead/report · Leads / Reps = leads / reports submitted — all within the selected window", d.m, d.y);
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

// Per-OEM drill-down: the people behind each cell, exactly like expanding a row
// on screen. One block per manufacturer, all three groups in one table.
function drawDrilldown(d: Doc, rows: MatrixRow[], groups: MatrixGroup[]) {
  sectionTitle(d, "OEM drill-down — people behind each cell");
  const cols: Array<{ label: string; w: number; align?: "left" | "right" }> = [
    { label: "Name", w: 220 },
    { label: "Type", w: 110 },
    { label: "Signed up", w: 80 },
    { label: "Uses", w: 70, align: "right" },
    { label: "Leads", w: 60, align: "right" },
    { label: "Reps", w: 60, align: "right" },
  ];
  for (const r of rows) {
    const peopleRows: string[][] = [];
    for (const g of groups) {
      for (const p of r.groups[g].people) {
        peopleRows.push([
          p.name,
          GROUP_LABEL[g],
          p.signedUp ? "Yes" : "No",
          String(p.uses),
          String(p.leads),
          String(p.reports),
        ]);
      }
    }
    // Keep the manufacturer heading with at least its table header + a row.
    ensure(d, 16 + 13 * 2);
    d.doc.setFont("helvetica", "bold");
    d.doc.setFontSize(10);
    d.doc.setTextColor(...ANCHOR_DEEP);
    d.doc.text(r.manufacturer, d.m, d.y + 10);
    d.y += 16;
    if (peopleRows.length === 0) {
      d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
      d.doc.text("No people associated.", d.m, d.y + 8);
      d.y += 18;
    } else {
      drawTable(d, cols, peopleRows);
    }
  }
}

export type MatrixPdfFilters = {
  windowLabel: string;
  manufacturers: string[]; // empty = all
  groups: MatrixGroup[]; // empty = all
};

function filterSummary(f: MatrixPdfFilters): string {
  const m = f.manufacturers.length === 0
    ? "All manufacturers"
    : f.manufacturers.length <= 3
    ? f.manufacturers.join(", ")
    : `${f.manufacturers.length} manufacturers`;
  const g = f.groups.length === 0 ? "All types" : f.groups.map((x) => GROUP_LABEL[x]).join(", ");
  return `${m}  ·  ${g}`;
}

function renderMatrix(payload: MatrixPdfPayload, filters: MatrixPdfFilters): jsPDF {
  const d = landscapeDoc();
  const groups = filters.groups.length ? filters.groups : ALL_GROUPS;
  const mfrSet = new Set(filters.manufacturers);
  const rows = mfrSet.size ? (payload.rows ?? []).filter((r) => mfrSet.has(r.manufacturer)) : (payload.rows ?? []);
  const totals = computeTotals(rows);
  const inScope = (group: string, manufacturers: string[]) =>
    (groups.length === ALL_GROUPS.length || (groups as string[]).includes(group)) &&
    (mfrSet.size === 0 || manufacturers.some((m) => mfrSet.has(m)));
  const events = (payload.events ?? []).filter((e) => inScope(e.group, e.manufacturers));
  const projects = (payload.projects ?? []).filter((p) => inScope(p.group, p.manufacturers));
  header(d, "OEM Matrix", `${filters.windowLabel}  ·  ${filterSummary(filters)}`);

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
    d.doc.text(`${contacts} contacts · ${t.downloaded} signed up · ${t.uses} uses · ${t.leads} leads · ${t.reports} reports`, d.m + 110, d.y + 10);
    d.y += 16;
  }
  d.y += 8;

  if (rows.length > 0) {
    drawMatrix(d, groups, rows, totals);
    drawDrilldown(d, rows, groups);
  }

  // Events detail.
  sectionTitle(d, `Events — ${filters.windowLabel.toLowerCase()} (${events.length})`);
  if (events.length === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
    d.doc.text("No events in range.", d.m, d.y + 8); d.y += 18;
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
  sectionTitle(d, `Projects — ${filters.windowLabel.toLowerCase()} (${projects.length})`);
  if (projects.length === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
    d.doc.text("No projects in range.", d.m, d.y + 8); d.y += 18;
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

  return d.doc;
}

function matrixFilename(filters: MatrixPdfFilters) {
  return `oem-matrix_${filters.windowLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
}

// Browser: trigger a download.
export function generateFullAnalyticsPdf(payload: MatrixPdfPayload, filters: MatrixPdfFilters) {
  renderMatrix(payload, filters).save(matrixFilename(filters));
}

// Server: return the PDF bytes (e.g. to attach to the weekly report email).
export function buildOemMatrixPdf(payload: MatrixPdfPayload, filters: MatrixPdfFilters): Buffer {
  return Buffer.from(renderMatrix(payload, filters).output("arraybuffer"));
}
