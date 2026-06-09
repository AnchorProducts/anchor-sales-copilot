// Pure (server-safe) helpers for the User Analytics summary, shared by the
// on-screen charts and the weekly report PDF.

export type ChartUser = {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
    byType: Record<string, number>;
  };
  dailyEvents: Array<{ date: string; count: number }>;
};

export type LabeledValue = { label: string; count: number };

export type UserAnalyticsSummary = {
  days: number;
  stats: { users: number; active: number; events: number; inactive: number };
  series: LabeledValue[]; // one point per day in the window
  byType: LabeledValue[]; // top event types
  topUsers: LabeledValue[]; // most active users
};

const EVENT_LABELS: Record<string, string> = {
  login: "Logins",
  app_open: "App opens",
  page_view: "Page views",
  click: "Clicks",
  chat_message_sent: "Chat messages",
  lead_submitted: "Leads",
  commission_submitted: "Commission claims",
  notable_project_submitted: "Notable projects",
  marketing_order_submitted: "Marketing orders",
  doc_opened: "Docs opened",
};

export function eventLabel(t: string): string {
  return EVENT_LABELS[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Compact labels for narrow table columns (e.g., the PDF breakdown matrix).
const SHORT_EVENT_LABELS: Record<string, string> = {
  login: "Logins",
  app_open: "Opens",
  page_view: "Pages",
  click: "Clicks",
  chat_message_sent: "Chat",
  lead_submitted: "Leads",
  commission_submitted: "Claims",
  notable_project_submitted: "Projects",
  marketing_order_submitted: "Orders",
  doc_opened: "Docs",
};

export function shortEventLabel(t: string): string {
  return SHORT_EVENT_LABELS[t] ?? eventLabel(t).split(" ")[0];
}

function userTotal(u: ChartUser): number {
  return Object.values(u.events.byType).reduce((s, n) => s + n, 0);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Roll the windowed per-user data into the shape both the charts and PDF use.
export function buildUserAnalyticsSummary(users: ChartUser[], days: number): UserAnalyticsSummary {
  const counts: Record<string, number> = {};
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  for (const u of users) {
    for (const pt of u.dailyEvents) {
      if (pt.date in counts) counts[pt.date] += pt.count;
    }
  }
  const series = Object.entries(counts).map(([date, count]) => ({ label: fmtDate(date), count }));

  const active = users.filter((u) => userTotal(u) > 0).length;
  const events = users.reduce((s, u) => s + userTotal(u), 0);
  const stats = { users: users.length, active, events, inactive: users.length - active };

  const bt: Record<string, number> = {};
  for (const u of users) for (const [type, n] of Object.entries(u.events.byType)) bt[type] = (bt[type] ?? 0) + n;
  const byType = Object.entries(bt)
    .map(([type, count]) => ({ label: eventLabel(type), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topUsers = users
    .map((u) => ({ label: u.full_name || u.email, count: userTotal(u) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { days, stats, series, byType, topUsers };
}
