import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-manufacturer matrix (Sales reps / Tech reps / Consultants) plus detailed
// last-30-day logs of every event and project (leads + reports), with who did
// each. Notable projects are intentionally excluded. Projects = leads + reports.

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (String((prof as { role?: string } | null)?.role || "") !== "admin") {
    return { error: "Forbidden", status: 403 as const };
  }
  return { user: auth.user };
}

type Group = "sales" | "tech" | "consultant";

type PersonAgg = {
  name: string;
  email: string | null;
  signedUp: boolean;
  uses7: number;
  uses30: number;
  leads30: number;
  reports30: number;
};

type Cell = {
  downloaded: number;
  notDownloaded: number;
  usesPerWeek: number; // events last 7d
  uses30: number; // events last 30d
  notReporting: number; // signed up but no lead/report in last 7d
  leads30: number;
  reports30: number;
  people: PersonAgg[];
};

function emptyCell(): Cell {
  return { downloaded: 0, notDownloaded: 0, usesPerWeek: 0, uses30: 0, notReporting: 0, leads30: 0, reports30: 0, people: [] };
}

type ContactRow = {
  id: string;
  contact_type: string | null;
  rep_kind: string | null;
  manufacturer: string | null;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
};

function contactName(c: ContactRow): string {
  return (
    c.full_name?.trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    c.email ||
    "—"
  );
}

// Display label for a contact type (consultant / contractor / custom).
function humanizeType(t: string): string {
  if (t === "consultant") return "Consultant";
  if (t === "contractor") return "Contractor";
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ");
}

// Detail rows shown in the PDF. `group` is the matrix group for contacts, or
// "Internal" / "External" for app users who aren't in the contact roster.
// `group` is the matrix group key (sales/tech/consultant) used for filtering;
// `groupLabel` is the human label shown in the report (Sales rep / Tech rep /
// Consultant / Contractor / …).
type EventDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; type: string; at: string; label: string };
type ProjectDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; kind: "Lead" | "Report"; at: string; company: string };

const EVENT_DETAIL_CAP = 1500;
const PROJECT_DETAIL_CAP = 1000;

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Contacts + consultant→OEM links.
  const { data: contactsData, error: cErr } = await supabaseAdmin
    .from("manufacturer_contacts")
    .select("id, contact_type, rep_kind, manufacturer, company, first_name, last_name, full_name, email");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const contacts = (contactsData ?? []) as ContactRow[];

  const { data: linkData, error: lErr } = await supabaseAdmin
    .from("manufacturer_contact_manufacturers")
    .select("contact_id, manufacturer");
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  const linksByContact = new Map<string, string[]>();
  for (const l of (linkData ?? []) as Array<{ contact_id: string; manufacturer: string }>) {
    const arr = linksByContact.get(l.contact_id) ?? [];
    arr.push(l.manufacturer);
    linksByContact.set(l.contact_id, arr);
  }

  // Contact info keyed by lower(email): group + manufacturers, for tagging
  // signed-up people in the detail logs.
  type Info = { group: string; label: string; manufacturers: string[] };
  const infoByEmail = new Map<string, Info>();
  for (const c of contacts) {
    const email = (c.email || "").toLowerCase();
    if (!email) continue;
    const type = c.contact_type || "manufacturer_rep";
    if (type === "manufacturer_rep") {
      const tech = c.rep_kind === "tech";
      infoByEmail.set(email, { group: tech ? "tech" : "sales", label: tech ? "Tech rep" : "Sales rep", manufacturers: c.manufacturer ? [c.manufacturer] : [] });
    } else {
      infoByEmail.set(email, { group: "consultant", label: humanizeType(type), manufacturers: linksByContact.get(c.id) ?? [] });
    }
  }

  // 2. All profiles — for signup matching AND system-wide detail names.
  const { data: profData, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const profiles = (profData ?? []) as Array<{ id: string; email: string | null; full_name: string | null; role: string | null }>;

  const pidByEmail = new Map<string, string>();
  type PidInfo = { name: string; group: string; label: string; manufacturers: string[] };
  const pidInfo = new Map<string, PidInfo>();
  for (const p of profiles) {
    const email = (p.email || "").toLowerCase();
    if (email) pidByEmail.set(email, p.id);
    const ci = email ? infoByEmail.get(email) : undefined;
    // Report covers the external contact roster only — OEM reps (sales/tech),
    // consultants, and contractors. Skip anyone not on the roster (internal
    // Anchor staff and uncategorised sign-ups).
    if (!ci) continue;
    pidInfo.set(p.id, {
      name: p.full_name?.trim() || p.email || "—",
      group: ci.group,
      label: ci.label,
      manufacturers: ci.manufacturers,
    });
  }

  // 3. Activity + projects (last 30d, system-wide). Aggregates per pid for the
  //    matrix; full rows for the detail logs.
  const uses7ByPid = new Map<string, number>();
  const uses30ByPid = new Map<string, number>();
  const leads7ByPid = new Map<string, number>();
  const leads30ByPid = new Map<string, number>();
  const reports7ByPid = new Map<string, number>();
  const reports30ByPid = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string | null, n = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + n); };

  const eventsDetail: EventDetail[] = [];
  const projectsDetail: ProjectDetail[] = [];

  const [evRes, leadRes, reportRes] = await Promise.all([
    supabaseAdmin.from("user_events").select("user_id, event_type, page_path, metadata, created_at").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
    supabaseAdmin.from("leads").select("created_by, customer_company, created_at").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
    supabaseAdmin.from("assessment_reports").select("user_id, company_name, created_at").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
  ]);
  if (evRes.error) return NextResponse.json({ error: evRes.error.message }, { status: 500 });
  if (leadRes.error) return NextResponse.json({ error: leadRes.error.message }, { status: 500 });
  if (reportRes.error) return NextResponse.json({ error: reportRes.error.message }, { status: 500 });

  for (const e of (evRes.data ?? []) as Array<{ user_id: string | null; event_type: string; page_path: string | null; metadata: Record<string, unknown> | null; created_at: string }>) {
    if (!e.user_id) continue;
    bump(uses30ByPid, e.user_id);
    if (e.created_at >= sevenDaysAgo) bump(uses7ByPid, e.user_id);
    const info = pidInfo.get(e.user_id);
    if (info && eventsDetail.length < EVENT_DETAIL_CAP) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const label =
        e.event_type === "click"
          ? String(m.trackId || m.label || m.href || m.el || "click")
          : e.page_path || "";
      eventsDetail.push({ person: info.name, group: info.group, groupLabel: info.label, manufacturers: info.manufacturers, type: e.event_type, at: e.created_at, label });
    }
  }

  for (const r of (leadRes.data ?? []) as Array<{ created_by: string | null; customer_company: string | null; created_at: string }>) {
    if (!r.created_by) continue;
    bump(leads30ByPid, r.created_by);
    if (r.created_at >= sevenDaysAgo) bump(leads7ByPid, r.created_by);
    const info = pidInfo.get(r.created_by);
    if (info && projectsDetail.length < PROJECT_DETAIL_CAP) {
      projectsDetail.push({ person: info.name, group: info.group, groupLabel: info.label, manufacturers: info.manufacturers, kind: "Lead", at: r.created_at, company: r.customer_company || "—" });
    }
  }

  for (const r of (reportRes.data ?? []) as Array<{ user_id: string | null; company_name: string | null; created_at: string }>) {
    if (!r.user_id) continue;
    bump(reports30ByPid, r.user_id);
    if (r.created_at >= sevenDaysAgo) bump(reports7ByPid, r.user_id);
    const info = pidInfo.get(r.user_id);
    if (info && projectsDetail.length < PROJECT_DETAIL_CAP) {
      projectsDetail.push({ person: info.name, group: info.group, groupLabel: info.label, manufacturers: info.manufacturers, kind: "Report", at: r.created_at, company: r.company_name || "—" });
    }
  }

  // 4. Build matrix cells from contacts.
  const cells = new Map<string, Cell>();
  const oemSet = new Set<string>();
  const cellKey = (oem: string, g: Group) => `${oem} ${g}`;

  function place(oem: string, group: Group, c: ContactRow) {
    oemSet.add(oem);
    const key = cellKey(oem, group);
    const cell = cells.get(key) ?? emptyCell();
    const email = (c.email || "").toLowerCase();
    const pid = email ? pidByEmail.get(email) ?? null : null;
    const signedUp = !!pid;
    const uses7 = pid ? uses7ByPid.get(pid) ?? 0 : 0;
    const uses30 = pid ? uses30ByPid.get(pid) ?? 0 : 0;
    const leads30 = pid ? leads30ByPid.get(pid) ?? 0 : 0;
    const reports30 = pid ? reports30ByPid.get(pid) ?? 0 : 0;
    const reportsThisWeek = (pid ? leads7ByPid.get(pid) ?? 0 : 0) + (pid ? reports7ByPid.get(pid) ?? 0 : 0);

    if (signedUp) {
      cell.downloaded += 1;
      cell.usesPerWeek += uses7;
      cell.uses30 += uses30;
      cell.leads30 += leads30;
      cell.reports30 += reports30;
      if (reportsThisWeek === 0) cell.notReporting += 1;
    } else {
      cell.notDownloaded += 1;
    }
    cell.people.push({ name: contactName(c), email: c.email, signedUp, uses7, uses30, leads30, reports30 });
    cells.set(key, cell);
  }

  for (const c of contacts) {
    const type = c.contact_type || "manufacturer_rep";
    if (type === "manufacturer_rep") {
      if (!c.manufacturer) continue;
      place(c.manufacturer, c.rep_kind === "tech" ? "tech" : "sales", c);
    } else {
      for (const oem of linksByContact.get(c.id) ?? []) place(oem, "consultant", c);
    }
  }

  const groups: Group[] = ["sales", "tech", "consultant"];
  const manufacturers = Array.from(oemSet).sort();

  for (const cell of cells.values()) {
    cell.people.sort((a, b) =>
      Number(b.signedUp) - Number(a.signedUp) ||
      (b.leads30 + b.reports30) - (a.leads30 + a.reports30) ||
      b.uses30 - a.uses30
    );
  }

  const rows = manufacturers.map((oem) => ({
    manufacturer: oem,
    groups: {
      sales: cells.get(cellKey(oem, "sales")) ?? emptyCell(),
      tech: cells.get(cellKey(oem, "tech")) ?? emptyCell(),
      consultant: cells.get(cellKey(oem, "consultant")) ?? emptyCell(),
    } as Record<Group, Cell>,
  }));

  const totals: Record<Group, Cell> = { sales: emptyCell(), tech: emptyCell(), consultant: emptyCell() };
  for (const row of rows) {
    for (const g of groups) {
      const t = totals[g];
      const c = row.groups[g];
      t.downloaded += c.downloaded;
      t.notDownloaded += c.notDownloaded;
      t.usesPerWeek += c.usesPerWeek;
      t.uses30 += c.uses30;
      t.notReporting += c.notReporting;
      t.leads30 += c.leads30;
      t.reports30 += c.reports30;
    }
  }

  return NextResponse.json({ rows, totals, manufacturers, events: eventsDetail, projects: projectsDetail });
}
