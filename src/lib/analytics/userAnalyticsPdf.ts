import jsPDF from "jspdf";

// Master User Analytics PDF: a summary of internal staff + other (non-OEM)
// signed-up users over a chosen time window — headline stats, daily activity,
// the event-type mix, and a per-user table.

type LabeledValue = { label: string; count: number };

// One person's event counts: `counts` lines up with breakdown.typeLabels; `total`
// is every event they logged (so Other = total - sum(counts)).
export type UserAnalyticsPdfPerson = {
  name: string;
  email: string;
  category: string;
  counts: number[];
  total: number;
};

export type UserAnalyticsPdfPayload = {
  title: string; // e.g. "User Analytics" or "OEM People Analytics"
  scopeLabel: string; // e.g. "Internal staff & other app users"
  windowLabel: string;
  stats: { users: number; active: number; events: number; inactive: number };
  series: LabeledValue[];
  byType: LabeledValue[];
  breakdown: { typeLabels: string[]; rows: UserAnalyticsPdfPerson[] };
};

const ANCHOR_DEEP: [number, number, number] = [12, 74, 50];
const GREEN: [number, number, number] = [22, 132, 60];
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

function statStrip(d: Doc, stats: UserAnalyticsPdfPayload["stats"]) {
  const items: Array<[string, number]> = [
    ["Users", stats.users],
    ["Active", stats.active],
    ["Events", stats.events],
    ["Inactive", stats.inactive],
  ];
  const usable = d.W - d.m * 2;
  const cardW = (usable - 12 * (items.length - 1)) / items.length;
  ensure(d, 54);
  items.forEach(([label, value], i) => {
    const x = d.m + i * (cardW + 12);
    d.doc.setFillColor(...SOFT);
    d.doc.roundedRect(x, d.y, cardW, 46, 6, 6, "F");
    d.doc.setFont("helvetica", "normal");
    d.doc.setFontSize(8);
    d.doc.setTextColor(110);
    d.doc.text(label.toUpperCase(), x + 10, d.y + 16);
    d.doc.setFont("helvetica", "bold");
    d.doc.setFontSize(18);
    d.doc.setTextColor(...ANCHOR_DEEP);
    d.doc.text(value.toLocaleString(), x + 10, d.y + 37);
  });
  d.y += 46 + 14;
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * pow;
}

function drawDailyBars(d: Doc, series: LabeledValue[]) {
  const total = series.reduce((s, p) => s + p.count, 0);
  if (total === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
    d.doc.text("No activity in this window.", d.m, d.y + 8); d.y += 18;
    return;
  }
  const usable = d.W - d.m * 2;
  const chartH = 110;
  ensure(d, chartH + 26);
  const max = niceCeil(Math.max(1, ...series.map((p) => p.count)));
  const baseline = d.y + chartH;
  const n = series.length;
  const gap = 2;
  const barW = Math.max(1, (usable - gap * (n - 1)) / n);

  // y-axis max label
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(7);
  d.doc.setTextColor(150);
  d.doc.text(String(max), d.m, d.y + 6);

  d.doc.setFillColor(...GREEN);
  series.forEach((p, i) => {
    const h = (p.count / max) * chartH;
    const x = d.m + i * (barW + gap);
    d.doc.rect(x, baseline - h, barW, h, "F");
  });
  d.doc.setDrawColor(220);
  d.doc.line(d.m, baseline, d.m + usable, baseline);

  // sparse x labels
  d.doc.setFontSize(6.5);
  d.doc.setTextColor(140);
  const every = Math.max(1, Math.floor(n / 10));
  series.forEach((p, i) => {
    if (i % every === 0 || i === n - 1) {
      const x = d.m + i * (barW + gap);
      d.doc.text(p.label, x, baseline + 10);
    }
  });
  d.y = baseline + 20;
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

function renderUserAnalytics(p: UserAnalyticsPdfPayload): jsPDF {
  const d = landscapeDoc();
  header(d, p.title, `${p.windowLabel}  ·  ${p.scopeLabel}`);

  statStrip(d, p.stats);

  // Daily activity.
  sectionTitle(d, `Daily activity — ${p.windowLabel.toLowerCase()}`);
  drawDailyBars(d, p.series);

  // Activity by type.
  sectionTitle(d, "Activity by type");
  if (p.byType.length === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
    d.doc.text("No activity in this window.", d.m, d.y + 8); d.y += 18;
  } else {
    drawTable(
      d,
      [
        { label: "Event type", w: 220 },
        { label: "Count", w: 90, align: "right" },
      ],
      p.byType.map((r) => [r.label, r.count.toLocaleString()]),
    );
  }

  // Per-person event breakdown.
  sectionTitle(d, `Event breakdown per person (${p.breakdown.rows.length})`);
  if (p.breakdown.rows.length === 0) {
    d.doc.setFont("helvetica", "normal"); d.doc.setFontSize(8); d.doc.setTextColor(120);
    d.doc.text("No activity in this window.", d.m, d.y + 8); d.y += 18;
  } else {
    const labels = p.breakdown.typeLabels;
    const usable = d.W - d.m * 2;
    const nameW = 120, emailW = 150, typeW = 48, otherW = 45, totalW = 50;
    const typeColW = (usable - nameW - emailW - typeW - otherW - totalW) / Math.max(1, labels.length);
    const cols: Array<{ label: string; w: number; align?: "left" | "right" }> = [
      { label: "Name", w: nameW },
      { label: "Email", w: emailW },
      { label: "Type", w: typeW },
      ...labels.map((l) => ({ label: l, w: typeColW, align: "right" as const })),
      { label: "Other", w: otherW, align: "right" as const },
      { label: "Total", w: totalW, align: "right" as const },
    ];
    drawTable(
      d,
      cols,
      p.breakdown.rows.map((r) => {
        const shown = r.counts.reduce((s, n) => s + n, 0);
        const other = Math.max(0, r.total - shown);
        return [
          r.name,
          r.email,
          r.category,
          ...r.counts.map((n) => (n ? n.toLocaleString() : "·")),
          other ? other.toLocaleString() : "·",
          r.total.toLocaleString(),
        ];
      }),
    );
  }

  return d.doc;
}

function userAnalyticsFilename(p: UserAnalyticsPdfPayload) {
  return `${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${p.windowLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
}

// Browser: trigger a download.
export function generateUserAnalyticsPdf(p: UserAnalyticsPdfPayload) {
  renderUserAnalytics(p).save(userAnalyticsFilename(p));
}

// Server: return the PDF bytes (e.g. to attach to the weekly report email).
export function buildUserAnalyticsPdf(p: UserAnalyticsPdfPayload): Buffer {
  return Buffer.from(renderUserAnalytics(p).output("arraybuffer"));
}
