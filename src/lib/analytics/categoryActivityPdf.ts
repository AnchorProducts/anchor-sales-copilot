"use client";

import jsPDF from "jspdf";
import { prettyPagePath } from "./pagePath";

export type CategoryUserRow = {
  full_name: string | null;
  email: string;
  company: string | null;
  manufacturer?: string | null;
  conversationCount: number;
  leadCount: number;
  reports: Array<unknown>;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
    byType: Record<string, number>;
    topPages: Array<{ path: string; count: number }>;
  };
};

export type CategoryPdfPayload = {
  category: "internal" | "external" | "manufacturer";
  users: CategoryUserRow[];
  charts: {
    dailyEvents: Array<{ date: string; count: number }>;
    eventsByType: Record<string, number>;
  };
};

const CATEGORY_TITLE: Record<CategoryPdfPayload["category"], string> = {
  internal: "Internal Users · Activity Summary",
  external: "External Reps · Activity Summary",
  manufacturer: "Manufacturer Users · Activity Summary",
};

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
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtShortDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function generateCategorySummaryPdf(p: CategoryPdfPayload) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 48;
  let y = MARGIN;

  function ensureSpace(rowHeight: number) {
    if (y + rowHeight > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function heading(text: string, size = 16) {
    ensureSpace(size + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(17, 80, 15);
    doc.text(text, MARGIN, y);
    y += size + 6;
  }

  function body(text: string, opts: { color?: [number, number, number]; size?: number } = {}) {
    const size = opts.size ?? 10;
    ensureSpace(size + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const c = opts.color ?? [40, 40, 40];
    doc.setTextColor(c[0], c[1], c[2]);
    const lines = doc.splitTextToSize(text, PAGE_W - MARGIN * 2);
    for (const line of lines) {
      ensureSpace(size + 2);
      doc.text(line, MARGIN, y);
      y += size + 2;
    }
  }

  function row(left: string, right: string) {
    ensureSpace(14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const leftClipped = doc.splitTextToSize(left, PAGE_W - MARGIN * 2 - 80)[0] ?? left;
    doc.text(leftClipped, MARGIN, y);
    const rightWidth = doc.getTextWidth(right);
    doc.text(right, PAGE_W - MARGIN - rightWidth, y);
    y += 14;
  }

  function divider() {
    ensureSpace(10);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 12;
  }

  // ── Title block ────────────────────────────────────────────────────────
  heading(CATEGORY_TITLE[p.category], 20);
  body(`Generated ${fmtDateTime(new Date().toISOString())}`, { color: [120, 120, 120] });
  y += 6;
  divider();

  // ── Headline totals ────────────────────────────────────────────────────
  const total7 = p.users.reduce((s, u) => s + u.events.total7, 0);
  const total30 = p.users.reduce((s, u) => s + u.events.total30, 0);
  const totalLeads = p.users.reduce((s, u) => s + u.leadCount, 0);
  const totalSessions = p.users.reduce((s, u) => s + u.conversationCount, 0);
  const totalReports = p.users.reduce((s, u) => s + u.reports.length, 0);
  const activeUsers = p.users.filter((u) => u.events.total7 > 0).length;

  heading("Headline", 13);
  row("Users in this category", String(p.users.length));
  row("Active (last 7 days)", `${activeUsers} of ${p.users.length}`);
  row("Events (last 7 days)", String(total7));
  row("Events (last 30 days)", String(total30));
  row("Chat sessions (all time)", String(totalSessions));
  row("Projects submitted", String(totalLeads));
  row("Assessment reports", String(totalReports));
  y += 6;
  divider();

  // ── Daily activity peak ────────────────────────────────────────────────
  const peakDay = p.charts.dailyEvents.reduce(
    (acc, d) => (d.count > acc.count ? d : acc),
    { date: "", count: 0 }
  );
  heading("Activity · last 30 days", 13);
  row("Peak day", peakDay.date ? `${fmtShortDate(peakDay.date)} (${peakDay.count})` : "—");
  row("Total events", String(p.charts.dailyEvents.reduce((s, d) => s + d.count, 0)));
  y += 6;
  divider();

  // ── Event mix ──────────────────────────────────────────────────────────
  heading("Event mix · last 30 days", 13);
  const mix = Object.entries(p.charts.eventsByType).sort((a, b) => b[1] - a[1]);
  if (mix.length === 0) {
    body("No events recorded in the last 30 days.", { color: [120, 120, 120] });
  } else {
    for (const [type, count] of mix) row(eventTypeLabel(type), String(count));
  }
  y += 6;
  divider();

  // ── Manufacturer breakdown (manufacturer category only) ────────────────
  if (p.category === "manufacturer") {
    const byMfr = new Map<string, { users: number; active7: number; events30: number }>();
    for (const u of p.users) {
      const key = u.manufacturer || "—";
      const entry = byMfr.get(key) ?? { users: 0, active7: 0, events30: 0 };
      entry.users += 1;
      if (u.events.total7 > 0) entry.active7 += 1;
      entry.events30 += u.events.total30;
      byMfr.set(key, entry);
    }
    heading("By manufacturer", 13);
    if (byMfr.size === 0) {
      body("—", { color: [120, 120, 120] });
    } else {
      const sorted = Array.from(byMfr.entries()).sort(
        (a, b) => b[1].events30 - a[1].events30 || a[0].localeCompare(b[0])
      );
      for (const [mfr, stat] of sorted) {
        row(mfr, `${stat.users} users · ${stat.active7} active · ${stat.events30} events`);
      }
    }
    y += 6;
    divider();
  }

  // ── Top users (by 7-day events) ────────────────────────────────────────
  heading("Most active users · last 7 days", 13);
  const ranked = [...p.users]
    .filter((u) => u.events.total7 > 0)
    .sort((a, b) => b.events.total7 - a.events.total7)
    .slice(0, 15);
  if (ranked.length === 0) {
    body("No active users in the last 7 days.", { color: [120, 120, 120] });
  } else {
    for (const u of ranked) {
      const name = u.full_name || u.email;
      const subtitle = u.manufacturer || u.company || u.email;
      const left = subtitle && subtitle !== name ? `${name}  ·  ${subtitle}` : name;
      row(left, `${u.events.total7} events`);
    }
  }
  y += 6;
  divider();

  // ── Top pages aggregated across all users in the category ──────────────
  heading("Top pages", 13);
  const pageCounts = new Map<string, number>();
  for (const u of p.users) {
    for (const pg of u.events.topPages) {
      pageCounts.set(pg.path, (pageCounts.get(pg.path) ?? 0) + pg.count);
    }
  }
  const topPages = Array.from(pageCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (topPages.length === 0) {
    body("—", { color: [120, 120, 120] });
  } else {
    for (const [path, count] of topPages) row(prettyPagePath(path), String(count));
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  const footerLabel = CATEGORY_TITLE[p.category].replace(/ · .*$/, "");
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${footerLabel} · page ${i} of ${pageCount}`,
      PAGE_W / 2,
      PAGE_H - 20,
      { align: "center" }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${p.category}-users-activity-${stamp}.pdf`);
}
