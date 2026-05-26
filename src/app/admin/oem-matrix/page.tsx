"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type Group = "sales" | "tech" | "consultant";

type Person = {
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
  usesPerWeek: number;
  uses30: number;
  notReporting: number;
  leads30: number;
  reports30: number;
  people: Person[];
};

type Row = { manufacturer: string; groups: Record<Group, Cell> };

type MatrixData = { rows: Row[]; totals: Record<Group, Cell>; manufacturers: string[] };

const GROUPS: Array<{ key: Group; label: string; tint: string }> = [
  { key: "sales", label: "OEM Sales Reps", tint: "bg-[#dbeafe]" },
  { key: "tech", label: "OEM Tech Reps", tint: "bg-[var(--anchor-mint)]/50" },
  { key: "consultant", label: "Consultants", tint: "bg-[#ede9fe]" },
];

// Sub-columns within each group. `title` is the CEO's full column wording.
const METRICS: Array<{ key: keyof Cell; short: string; title: string }> = [
  { key: "downloaded", short: "Down", title: "Signed up (downloaded)" },
  { key: "notDownloaded", short: "Not", title: "Have not signed up" },
  { key: "usesPerWeek", short: "Uses/wk", title: "Uses per week (events, last 7 days)" },
  { key: "notReporting", short: "No proj", title: "Signed up but no lead/report this week" },
  { key: "leads30", short: "Leads", title: "Leads submitted (last 30 days)" },
  { key: "reports30", short: "Reps", title: "Reports submitted (last 30 days)" },
];

export default function AdminOemMatrixPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [data, setData] = useState<MatrixData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!alive) return;
      if (!auth.user) { router.replace("/"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!alive) return;
      if (String((prof as { role?: string } | null)?.role || "") !== "admin") {
        setAccessError("Admin access only.");
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  useEffect(() => {
    if (!ready || accessError) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      const res = await fetch("/api/admin/oem-matrix", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) { setLoadErr(json?.error || "Failed to load matrix."); setLoading(false); return; }
      setData(json as MatrixData);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, accessError]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="OEM Matrix"
        subtitle="Per-manufacturer engagement, by rep type"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Analytics", href: "/admin/analytics" },
          { label: "Contacts", href: "/admin/manufacturer-contacts" },
        ]}
      />
      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {accessError}
          </Card>
        ) : (
          <>
            <header className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Manufacturer matrix</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)]">
                Each OEM split into sales reps, tech reps, and consultants. Down = signed up · Uses/wk =
                events last 7d · No proj = signed up but no lead/report this week · Leads / Reps = leads /
                reports submitted (last 30d). Click a row for the per-rep breakdown. Export PDFs from the
                Analytics page.
              </p>
            </header>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {loading ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">Loading matrix…</Card>
            ) : !data || data.rows.length === 0 ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">
                No manufacturer data yet. Add contacts and tag their type to populate this.
              </Card>
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[1320px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)]">
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]"
                      >
                        Manufacturer
                      </th>
                      {GROUPS.map((g) => (
                        <th
                          key={g.key}
                          colSpan={METRICS.length}
                          className={`border-l border-[var(--border-default)] px-3 py-2 text-center text-xs font-bold text-[var(--anchor-deep)] ${g.tint}`}
                        >
                          {g.label}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--border-default)] bg-[var(--surface-soft)]">
                      {GROUPS.map((g) =>
                        METRICS.map((m, i) => (
                          <th
                            key={`${g.key}-${m.key}`}
                            title={m.title}
                            className={
                              "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)] " +
                              (i === 0 ? "border-l border-[var(--border-default)]" : "")
                            }
                          >
                            {m.short}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const open = expanded === row.manufacturer;
                      return (
                        <Fragment key={row.manufacturer}>
                          <tr
                            onClick={() => setExpanded(open ? null : row.manufacturer)}
                            className={"cursor-pointer border-b border-[var(--border-default)] transition-colors " + (open ? "bg-[var(--surface-soft)]" : "hover:bg-[var(--surface-soft)]")}
                          >
                            <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-3 py-2 font-semibold text-[var(--anchor-deep)]">
                              <span className="inline-flex items-center gap-1.5">
                                <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-[var(--anchor-gray)] transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <polyline points="9 6 15 12 9 18" />
                                </svg>
                                {row.manufacturer}
                              </span>
                            </td>
                            {GROUPS.map((g) =>
                              METRICS.map((m, i) => (
                                <td
                                  key={`${g.key}-${m.key}`}
                                  className={
                                    "px-2 py-2 text-right tabular-nums " +
                                    (i === 0 ? "border-l border-[var(--border-default)] " : "") +
                                    (m.key === "notReporting" && (row.groups[g.key][m.key] as number) > 0 ? "text-amber-700" : "")
                                  }
                                >
                                  {(row.groups[g.key][m.key] as number).toLocaleString()}
                                </td>
                              ))
                            )}
                          </tr>
                          {open && (
                            <tr className="border-b border-[var(--border-default)] bg-[var(--surface-soft)]">
                              <td colSpan={1 + GROUPS.length * METRICS.length} className="px-3 py-3">
                                <div className="grid gap-3 lg:grid-cols-3">
                                  {GROUPS.map((g) => (
                                    <PeopleList key={g.key} title={g.label} cell={row.groups[g.key]} />
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-soft)] font-semibold">
                      <td className="sticky left-0 z-10 bg-[var(--surface-soft)] px-3 py-2 text-[var(--anchor-deep)]">Total</td>
                      {GROUPS.map((g) =>
                        METRICS.map((m, i) => (
                          <td
                            key={`t-${g.key}-${m.key}`}
                            className={"px-2 py-2 text-right tabular-nums " + (i === 0 ? "border-l border-[var(--border-default)]" : "")}
                          >
                            {(data.totals[g.key][m.key] as number).toLocaleString()}
                          </td>
                        ))
                      )}
                    </tr>
                  </tfoot>
                </table>
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function PeopleList({ title, cell }: { title: string; cell: Cell }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--anchor-deep)]">{title}</span>
        <span className="text-[10px] text-[var(--anchor-gray)]">
          {cell.downloaded}/{cell.downloaded + cell.notDownloaded} signed up
        </span>
      </div>
      {cell.people.length === 0 ? (
        <p className="text-xs text-[var(--anchor-gray)]">No one here.</p>
      ) : (
        <ul className="space-y-1">
          {cell.people.map((p, i) => (
            <li key={`${p.email || p.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-[var(--surface-soft)] px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate" title={p.email || undefined}>
                {p.name}
                {!p.signedUp && <span className="ml-1 text-[10px] text-[var(--anchor-gray)]">· not signed up</span>}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--anchor-gray)]">{p.uses7}/wk</span>
              <span className="shrink-0 tabular-nums font-semibold text-[var(--anchor-deep)]">{p.leads30}L · {p.reports30}R</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
