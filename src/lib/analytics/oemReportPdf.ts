"use client";

import jsPDF from "jspdf";

export type OemReportUser = {
  id: string;
  full_name: string | null;
  email: string;
  manufacturer: string | null;
  leadCount: number;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
    byType: Record<string, number>;
  };
};

export type OemReportPayload = {
  users: OemReportUser[];
  oemContactCounts: Record<string, number>;
};

const DORMANT_DAYS = 14;

const EVENT_TYPE_LABELS: Record<string, string> = {
  login: "Logins",
  app_open: "App opens",
  page_view: "Page views",
  click: "Clicks",
  chat_message_sent: "Chat messages",
  lead_submitted: "Leads submitted",
  commission_submitted: "Commission claims",
  notable_project_submitted: "Notable projects",
  doc_opened: "Docs opened",
};

function eventTypeLabel(t: string) {
  return EVENT_TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtRelativeShort(iso: string | null): string {
  if (!iso) return "Never";
  const days = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 1) return "today";
  if (days < 7) return `${Math.round(days)}d ago`;
  if (days < 30) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function topAction(byType: Record<string, number>): string {
  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return "—";
  const [type, count] = sorted[0];
  return `${eventTypeLabel(type)} (${count})`;
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "report";
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

// ── Shared per-OEM section renderer ─────────────────────────────────────────
//
// Returns a function that, given a jsPDF doc + cursor, renders one OEM's
// detail block and updates the cursor. Encapsulates page-break logic.

type DocState = {
  doc: jsPDF;
  pageW: number;
  pageH: number;
  margin: number;
  y: number;
};

function newDoc(): DocState {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  return {
    doc,
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    margin: 48,
    y: 48,
  };
}

function ensureSpace(state: DocState, rowHeight: number) {
  if (state.y + rowHeight > state.pageH - state.margin) {
    state.doc.addPage();
    state.y = state.margin;
  }
}

function heading(state: DocState, text: string, size = 16, color: [number, number, number] = [17, 80, 15]) {
  ensureSpace(state, size + 10);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(size);
  state.doc.setTextColor(color[0], color[1], color[2]);
  state.doc.text(text, state.margin, state.y);
  state.y += size + 6;
}

function body(state: DocState, text: string, opts: { color?: [number, number, number]; size?: number } = {}) {
  const size = opts.size ?? 10;
  ensureSpace(state, size + 4);
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(size);
  const c = opts.color ?? [40, 40, 40];
  state.doc.setTextColor(c[0], c[1], c[2]);
  const lines = state.doc.splitTextToSize(text, state.pageW - state.margin * 2);
  for (const line of lines) {
    ensureSpace(state, size + 2);
    state.doc.text(line, state.margin, state.y);
    state.y += size + 2;
  }
}

function divider(state: DocState) {
  ensureSpace(state, 10);
  state.doc.setDrawColor(220, 220, 220);
  state.doc.setLineWidth(0.5);
  state.doc.line(state.margin, state.y, state.pageW - state.margin, state.y);
  state.y += 12;
}

function row(state: DocState, left: string, right: string) {
  ensureSpace(state, 14);
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(10);
  state.doc.setTextColor(40, 40, 40);
  state.doc.text(left, state.margin, state.y);
  const rightWidth = state.doc.getTextWidth(right);
  state.doc.text(right, state.pageW - state.margin - rightWidth, state.y);
  state.y += 14;
}

type OemMetrics = {
  manufacturer: string;
  contacts: number;
  signedUp: number;
  active7: number;
  dormant: number;
  events30: number;
  leads: number;
  activation: number;
};

function computeMetrics(
  oem: string,
  users: OemReportUser[],
  contactCount: number
): OemMetrics {
  const signedUp = users.length;
  const active7 = users.filter((u) => u.events.total7 > 0).length;
  const dormant = users.filter((u) => daysSince(u.events.lastSeen) > DORMANT_DAYS).length;
  const events30 = users.reduce((s, u) => s + u.events.total30, 0);
  const leads = users.reduce((s, u) => s + u.leadCount, 0);
  const activation = signedUp > 0 ? Math.round((active7 / signedUp) * 100) : 0;
  return {
    manufacturer: oem,
    contacts: contactCount || signedUp,
    signedUp, active7, dormant, events30, leads, activation,
  };
}

// Renders OEM heading + metrics + user table. Adds a page-break before each
// OEM section (when called repeatedly) to keep one OEM per page where possible.
function renderOemSection(state: DocState, metrics: OemMetrics, users: OemReportUser[], opts: { newPageBefore?: boolean } = {}) {
  if (opts.newPageBefore && state.y > state.margin + 1) {
    state.doc.addPage();
    state.y = state.margin;
  }

  heading(state, metrics.manufacturer, 18);
  body(state, `${metrics.contacts} contact${metrics.contacts === 1 ? "" : "s"} on file · ${metrics.signedUp} signed up`, { color: [120, 120, 120] });
  state.y += 4;

  // Metrics rows
  row(state, "Active in last 7 days", `${metrics.active7} (${metrics.activation}% activation)`);
  row(state, `Dormant ${DORMANT_DAYS}+ days`, `${metrics.dormant}`);
  row(state, "Events (last 30 days)", metrics.events30.toLocaleString());
  row(state, "Leads submitted", String(metrics.leads));
  state.y += 4;
  divider(state);

  // User table
  heading(state, "Users · last 30 days", 12);

  if (users.length === 0) {
    body(state, "No signed-up users at this OEM yet.", { color: [120, 120, 120] });
    state.y += 6;
    return;
  }

  // Header row
  ensureSpace(state, 16);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(9);
  state.doc.setTextColor(120, 120, 120);
  const cols = {
    name: state.margin,
    events: state.pageW - state.margin - 250,
    lastSeen: state.pageW - state.margin - 160,
    top: state.pageW - state.margin - 70,
  };
  state.doc.text("NAME / EMAIL", cols.name, state.y);
  state.doc.text("EVENTS 30D", cols.events, state.y);
  state.doc.text("LAST SEEN", cols.lastSeen, state.y);
  state.doc.text("TOP ACTION", cols.top, state.y);
  state.y += 12;

  // Faint underline
  state.doc.setDrawColor(220, 220, 220);
  state.doc.line(state.margin, state.y, state.pageW - state.margin, state.y);
  state.y += 8;

  // Sort users by 30d events desc.
  const sorted = [...users].sort((a, b) => b.events.total30 - a.events.total30);

  for (const u of sorted) {
    ensureSpace(state, 22);
    state.doc.setFont("helvetica", "bold");
    state.doc.setFontSize(10);
    state.doc.setTextColor(17, 80, 15);
    const displayName = u.full_name || u.email;
    state.doc.text(state.doc.splitTextToSize(displayName, 220)[0], cols.name, state.y);

    state.doc.setFont("helvetica", "normal");
    state.doc.setTextColor(40, 40, 40);
    state.doc.text(u.events.total30.toLocaleString(), cols.events, state.y);
    state.doc.text(fmtRelativeShort(u.events.lastSeen), cols.lastSeen, state.y);
    const action = topAction(u.events.byType);
    state.doc.text(state.doc.splitTextToSize(action, 90)[0], cols.top, state.y);

    state.y += 11;

    // Email subline
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8);
    state.doc.setTextColor(140, 140, 140);
    state.doc.text(state.doc.splitTextToSize(u.email, 280)[0], cols.name, state.y);
    state.y += 9;
  }

  state.y += 6;
}

function addFooter(state: DocState, label: string) {
  const pageCount = state.doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    state.doc.setPage(i);
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(9);
    state.doc.setTextColor(150, 150, 150);
    state.doc.text(
      `${label} · page ${i} of ${pageCount}`,
      state.pageW / 2,
      state.pageH - 20,
      { align: "center" }
    );
  }
}

// ── Public: all OEMs report ────────────────────────────────────────────────
export function generateAllOemsReportPdf(payload: OemReportPayload) {
  const state = newDoc();

  // Group users by OEM.
  const byOem = new Map<string, OemReportUser[]>();
  for (const u of payload.users) {
    if (!u.manufacturer) continue;
    const list = byOem.get(u.manufacturer) ?? [];
    list.push(u);
    byOem.set(u.manufacturer, list);
  }

  // Include OEMs with contacts but no signups too.
  const allOemNames = new Set<string>([
    ...byOem.keys(),
    ...Object.keys(payload.oemContactCounts),
  ]);

  const rows = Array.from(allOemNames).map((oem) =>
    computeMetrics(oem, byOem.get(oem) ?? [], payload.oemContactCounts[oem] ?? 0)
  );
  rows.sort((a, b) => b.events30 - a.events30);

  // Title page
  heading(state, "OEM Activity Report", 22);
  body(state, `Generated ${fmtDateTime(new Date().toISOString())}`, { color: [120, 120, 120] });
  state.y += 6;
  divider(state);

  // Overall summary
  const totalContacts = rows.reduce((s, r) => s + r.contacts, 0);
  const totalSignedUp = rows.reduce((s, r) => s + r.signedUp, 0);
  const totalActive7 = rows.reduce((s, r) => s + r.active7, 0);
  const totalDormant = rows.reduce((s, r) => s + r.dormant, 0);
  const totalEvents = rows.reduce((s, r) => s + r.events30, 0);
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);

  heading(state, "Summary across all OEMs", 13);
  row(state, "OEMs tracked", String(rows.length));
  row(state, "Total contacts on file", String(totalContacts));
  row(state, "Signed up", String(totalSignedUp));
  row(state, "Active in last 7 days", String(totalActive7));
  row(state, `Dormant ${DORMANT_DAYS}+ days`, String(totalDormant));
  row(state, "Events (last 30 days)", totalEvents.toLocaleString());
  row(state, "Leads submitted", String(totalLeads));
  state.y += 6;
  divider(state);

  // Quick leaderboard table — OEMs sorted by events30
  heading(state, "OEM leaderboard (by events, last 30 days)", 13);
  for (const r of rows.slice(0, 20)) {
    row(state, r.manufacturer, `${r.events30.toLocaleString()} events · ${r.activation}% activation`);
  }
  if (rows.length > 20) {
    body(state, `(${rows.length - 20} more OEMs on following pages)`, { color: [140, 140, 140] });
  }

  // One section per OEM
  for (const r of rows) {
    const usersForOem = byOem.get(r.manufacturer) ?? [];
    renderOemSection(state, r, usersForOem, { newPageBefore: true });
  }

  addFooter(state, "OEM Activity Report");
  const stamp = new Date().toISOString().slice(0, 10);
  state.doc.save(`oem-activity-all-${stamp}.pdf`);
}

// ── Public: single OEM report ──────────────────────────────────────────────
export function generateSingleOemReportPdf(oemName: string, payload: OemReportPayload) {
  const state = newDoc();
  const usersForOem = payload.users.filter((u) => u.manufacturer === oemName);
  const metrics = computeMetrics(oemName, usersForOem, payload.oemContactCounts[oemName] ?? 0);

  // Title page
  heading(state, `${oemName} · Activity Report`, 22);
  body(state, `Generated ${fmtDateTime(new Date().toISOString())} · Last 30 days`, { color: [120, 120, 120] });
  state.y += 6;
  divider(state);

  renderOemSection(state, metrics, usersForOem);
  addFooter(state, `${oemName} · Activity Report`);

  const stamp = new Date().toISOString().slice(0, 10);
  state.doc.save(`oem-${safeFilename(oemName)}-${stamp}.pdf`);
}
