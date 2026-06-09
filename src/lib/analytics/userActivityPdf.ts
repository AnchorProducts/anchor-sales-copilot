"use client";

import jsPDF from "jspdf";
import { prettyPagePath } from "./pagePath";

export type UserPdfPayload = {
  full_name: string | null;
  email: string;
  company: string | null;
  phone: string | null;
  created_at: string | null;
  conversationCount: number;
  leadCount: number;
  reportCount: number;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
    byType: Record<string, number>;
    topPages: Array<{ path: string; count: number }>;
    topClicks: Array<{ label: string; path: string; count: number }>;
    recent: Array<{
      created_at: string;
      event_type: string;
      page_path: string | null;
      label: string | null;
    }>;
  };
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
  marketing_order_submitted: "Marketing orders",
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

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "user";
}

export function generateUserActivityPdf(u: UserPdfPayload) {
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
    doc.setTextColor(17, 80, 15); // anchor-deep
    doc.text(text, MARGIN, y);
    y += size + 6;
  }

  function subheading(text: string) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(text, MARGIN, y);
    y += 16;
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
    doc.text(left, MARGIN, y);
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
  heading("User Activity Report", 20);
  body(`Generated ${fmtDateTime(new Date().toISOString())}`, { color: [120, 120, 120] });
  y += 6;
  divider();

  // ── User info ──────────────────────────────────────────────────────────
  subheading(u.full_name || u.email);
  body(u.email, { color: [80, 80, 80] });
  if (u.company) body(u.company, { color: [80, 80, 80] });
  if (u.phone) body(u.phone, { color: [80, 80, 80] });
  if (u.created_at) body(`Joined ${fmtDateTime(u.created_at)}`, { color: [120, 120, 120] });
  y += 6;
  divider();

  // ── Summary stats ──────────────────────────────────────────────────────
  heading("Summary", 13);
  row("Events (last 7 days)", String(u.events.total7));
  row("Events (last 30 days)", String(u.events.total30));
  row("Last seen", fmtDateTime(u.events.lastSeen));
  row("Chat sessions", String(u.conversationCount));
  row("Projects submitted", String(u.leadCount));
  row("Assessment reports", String(u.reportCount));
  y += 6;
  divider();

  // ── Event breakdown ────────────────────────────────────────────────────
  heading("Event breakdown · last 30 days", 13);
  const byType = Object.entries(u.events.byType).sort((a, b) => b[1] - a[1]);
  if (byType.length === 0) {
    body("No events recorded in the last 30 days.", { color: [120, 120, 120] });
  } else {
    for (const [type, count] of byType) {
      row(eventTypeLabel(type), String(count));
    }
  }
  y += 6;
  divider();

  // ── Top pages ──────────────────────────────────────────────────────────
  heading("Top pages", 13);
  if (u.events.topPages.length === 0) {
    body("—", { color: [120, 120, 120] });
  } else {
    for (const p of u.events.topPages) {
      row(prettyPagePath(p.path), `${p.count}`);
    }
  }
  y += 6;
  divider();

  // ── Top clicks (new granular data) ─────────────────────────────────────
  heading("Top clicked actions", 13);
  if (u.events.topClicks.length === 0) {
    body("No click activity recorded yet.", { color: [120, 120, 120] });
  } else {
    for (const c of u.events.topClicks) {
      const right = `${c.count}`;
      const left = c.path ? `${c.label}  ·  ${prettyPagePath(c.path)}` : c.label;
      row(left, right);
    }
  }
  y += 6;
  divider();

  // ── Recent activity ────────────────────────────────────────────────────
  heading("Recent activity", 13);
  if (u.events.recent.length === 0) {
    body("—", { color: [120, 120, 120] });
  } else {
    for (const r of u.events.recent) {
      const when = fmtDateTime(r.created_at);
      const what = r.label
        ? `${eventTypeLabel(r.event_type)} · ${r.label}`
        : eventTypeLabel(r.event_type);
      const where = r.page_path ? ` · ${prettyPagePath(r.page_path)}` : "";
      row(when, `${what}${where}`);
    }
  }

  // ── Footer page numbers ────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${u.full_name || u.email} · page ${i} of ${pageCount}`,
      PAGE_W / 2,
      PAGE_H - 20,
      { align: "center" }
    );
  }

  const base = safeFilename(u.full_name || u.email);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${base}-activity-${stamp}.pdf`);
}
