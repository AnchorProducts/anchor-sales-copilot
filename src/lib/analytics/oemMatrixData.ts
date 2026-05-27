import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Server-side computation of the per-manufacturer matrix (Sales/Tech/Consultant)
// plus detailed event + project logs over a time window. Shared by the
// /api/admin/oem-matrix route and the weekly report email.

type Group = "sales" | "tech" | "consultant";

type PersonAgg = {
  name: string;
  email: string | null;
  signedUp: boolean;
  uses: number;
  leads: number;
  reports: number;
};

type Cell = {
  downloaded: number;
  notDownloaded: number;
  uses: number;
  notReporting: number;
  leads: number;
  reports: number;
  people: PersonAgg[];
};

function emptyCell(): Cell {
  return { downloaded: 0, notDownloaded: 0, uses: 0, notReporting: 0, leads: 0, reports: 0, people: [] };
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

function humanizeType(t: string): string {
  if (t === "consultant") return "Consultant";
  if (t === "contractor") return "Contractor";
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ");
}

export type EventDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; type: string; at: string; label: string };
export type ProjectDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; kind: "Lead" | "Report"; at: string; company: string };

const EVENT_DETAIL_CAP = 1500;
const PROJECT_DETAIL_CAP = 1000;

export type OemMatrixResult = {
  rows: Array<{ manufacturer: string; groups: Record<Group, Cell> }>;
  totals: Record<Group, Cell>;
  manufacturers: string[];
  days: number;
  events: EventDetail[];
  projects: ProjectDetail[];
};

export async function computeOemMatrix(days: number): Promise<OemMatrixResult> {
  const now = Date.now();
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. Contacts + consultant→OEM links.
  const { data: contactsData, error: cErr } = await supabaseAdmin
    .from("manufacturer_contacts")
    .select("id, contact_type, rep_kind, manufacturer, company, first_name, last_name, full_name, email");
  if (cErr) throw new Error(cErr.message);
  const contacts = (contactsData ?? []) as ContactRow[];

  const { data: linkData, error: lErr } = await supabaseAdmin
    .from("manufacturer_contact_manufacturers")
    .select("contact_id, manufacturer");
  if (lErr) throw new Error(lErr.message);
  const linksByContact = new Map<string, string[]>();
  for (const l of (linkData ?? []) as Array<{ contact_id: string; manufacturer: string }>) {
    const arr = linksByContact.get(l.contact_id) ?? [];
    arr.push(l.manufacturer);
    linksByContact.set(l.contact_id, arr);
  }

  type Info = { group: string; label: string; manufacturers: string[] };
  const infoByEmail = new Map<string, Info>();
  for (const c of contacts) {
    const email = (c.email || "").toLowerCase();
    if (!email) continue;
    const type = c.contact_type || "manufacturer_rep";
    if (type === "manufacturer_rep") {
      const tech = c.rep_kind === "tech";
      const repOems = linksByContact.get(c.id) ?? [];
      const oems = repOems.length ? repOems : (c.manufacturer ? [c.manufacturer] : []);
      infoByEmail.set(email, { group: tech ? "tech" : "sales", label: tech ? "Tech rep" : "Sales rep", manufacturers: oems });
    } else {
      infoByEmail.set(email, { group: "consultant", label: humanizeType(type), manufacturers: linksByContact.get(c.id) ?? [] });
    }
  }

  // 2. All profiles — for signup matching AND system-wide detail names.
  const { data: profData, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role");
  if (pErr) throw new Error(pErr.message);
  const profiles = (profData ?? []) as Array<{ id: string; email: string | null; full_name: string | null; role: string | null }>;

  const pidByEmail = new Map<string, string>();
  type PidInfo = { name: string; group: string; label: string; manufacturers: string[] };
  const pidInfo = new Map<string, PidInfo>();
  for (const p of profiles) {
    const email = (p.email || "").toLowerCase();
    if (email) pidByEmail.set(email, p.id);
    const ci = email ? infoByEmail.get(email) : undefined;
    if (!ci) continue;
    pidInfo.set(p.id, {
      name: p.full_name?.trim() || p.email || "—",
      group: ci.group,
      label: ci.label,
      manufacturers: ci.manufacturers,
    });
  }

  // 3. Activity + projects within the window.
  const usesByPid = new Map<string, number>();
  const leadsByPid = new Map<string, number>();
  const reportsByPid = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string | null, n = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + n); };

  const eventsDetail: EventDetail[] = [];
  const projectsDetail: ProjectDetail[] = [];

  const [evRes, leadRes, reportRes] = await Promise.all([
    supabaseAdmin.from("user_events").select("user_id, event_type, page_path, metadata, created_at").gte("created_at", cutoff).order("created_at", { ascending: false }),
    supabaseAdmin.from("leads").select("created_by, customer_company, created_at").gte("created_at", cutoff).order("created_at", { ascending: false }),
    supabaseAdmin.from("assessment_reports").select("user_id, company_name, created_at").gte("created_at", cutoff).order("created_at", { ascending: false }),
  ]);
  if (evRes.error) throw new Error(evRes.error.message);
  if (leadRes.error) throw new Error(leadRes.error.message);
  if (reportRes.error) throw new Error(reportRes.error.message);

  for (const e of (evRes.data ?? []) as Array<{ user_id: string | null; event_type: string; page_path: string | null; metadata: Record<string, unknown> | null; created_at: string }>) {
    if (!e.user_id) continue;
    bump(usesByPid, e.user_id);
    const info = pidInfo.get(e.user_id);
    if (info && eventsDetail.length < EVENT_DETAIL_CAP) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const label = e.event_type === "click" ? String(m.trackId || m.label || m.href || m.el || "click") : e.page_path || "";
      eventsDetail.push({ person: info.name, group: info.group, groupLabel: info.label, manufacturers: info.manufacturers, type: e.event_type, at: e.created_at, label });
    }
  }

  for (const r of (leadRes.data ?? []) as Array<{ created_by: string | null; customer_company: string | null; created_at: string }>) {
    if (!r.created_by) continue;
    bump(leadsByPid, r.created_by);
    const info = pidInfo.get(r.created_by);
    if (info && projectsDetail.length < PROJECT_DETAIL_CAP) {
      projectsDetail.push({ person: info.name, group: info.group, groupLabel: info.label, manufacturers: info.manufacturers, kind: "Lead", at: r.created_at, company: r.customer_company || "—" });
    }
  }

  for (const r of (reportRes.data ?? []) as Array<{ user_id: string | null; company_name: string | null; created_at: string }>) {
    if (!r.user_id) continue;
    bump(reportsByPid, r.user_id);
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
    const uses = pid ? usesByPid.get(pid) ?? 0 : 0;
    const leads = pid ? leadsByPid.get(pid) ?? 0 : 0;
    const reports = pid ? reportsByPid.get(pid) ?? 0 : 0;

    if (signedUp) {
      cell.downloaded += 1;
      cell.uses += uses;
      cell.leads += leads;
      cell.reports += reports;
      if (leads + reports === 0) cell.notReporting += 1;
    } else {
      cell.notDownloaded += 1;
    }
    cell.people.push({ name: contactName(c), email: c.email, signedUp, uses, leads, reports });
    cells.set(key, cell);
  }

  for (const c of contacts) {
    const type = c.contact_type || "manufacturer_rep";
    if (type === "manufacturer_rep") {
      const linked = linksByContact.get(c.id) ?? [];
      const oems = linked.length ? linked : (c.manufacturer ? [c.manufacturer] : []);
      const group: Group = c.rep_kind === "tech" ? "tech" : "sales";
      for (const oem of oems) place(oem, group, c);
    } else {
      for (const oem of linksByContact.get(c.id) ?? []) place(oem, "consultant", c);
    }
  }

  const groups: Group[] = ["sales", "tech", "consultant"];
  const manufacturers = Array.from(oemSet).sort();

  for (const cell of cells.values()) {
    cell.people.sort((a, b) =>
      Number(b.signedUp) - Number(a.signedUp) ||
      (b.leads + b.reports) - (a.leads + a.reports) ||
      b.uses - a.uses
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
      t.uses += c.uses;
      t.notReporting += c.notReporting;
      t.leads += c.leads;
      t.reports += c.reports;
    }
  }

  return { rows, totals, manufacturers, days, events: eventsDetail, projects: projectsDetail };
}
