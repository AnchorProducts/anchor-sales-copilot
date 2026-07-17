"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import { Input, Select } from "@/app/components/ui/Field";
import { Alert } from "@/app/components/ui/Alert";
import { Table, TableWrapper } from "@/app/components/ui/Table";
import { fmIntakeStatusLabel } from "@/lib/fmIntake";

const STATUSES = ["new", "assigned", "contacted", "qualified", "closed_won", "closed_lost"];

type LeadRow = {
  id: string;
  customer_company: string;
  region_code: string;
  status: string;
  created_at: string;
  assigned_rep_user_id: string | null;
};

type IntakeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  project_name: string | null;
  region_code: string | null;
  status: string;
  created_at: string;
  reviewed_by_name: string | null;
};

// One row in the merged queue — a REC consult or a Project Intake.
type UnifiedRow = {
  id: string;
  kind: "rec" | "intake";
  title: string;
  region: string;
  status: string;
  created_at: string;
  assignment: string;
  href: string;
};

type TypeFilter = "all" | "rec" | "intake";

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LeadsTable() {
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  // null  = admin (sees everything)
  // []    = anchor_rep with no states assigned yet
  // ["…"] = anchor_rep scoped to those states
  const [scopedStates, setScopedStates] = useState<string[] | null>(null);
  const isScoped = scopedStates !== null;
  const isUnassigned = isScoped && scopedStates!.length === 0;

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const leadParams = new URLSearchParams();
      if (status) leadParams.set("status", status);
      // Region filter only applies to admins (the only ones who see the input).
      // For scoped reps the server enforces region itself.
      if (region && !isScoped) leadParams.set("region", region);

      const intakeParams = new URLSearchParams();
      if (region && !isScoped) intakeParams.set("region", region);

      const [leadRes, intakeRes] = await Promise.all([
        fetch(`/api/leads?${leadParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/fm-intake?${intakeParams.toString()}`, { cache: "no-store" }),
      ]);

      const leadJson = await leadRes.json().catch(() => ({}));
      const intakeJson = await intakeRes.json().catch(() => ({}));

      if (!leadRes.ok) {
        setError(leadJson?.error || "Failed to load opportunities.");
        setRows([]);
        setLoading(false);
        return;
      }

      const leads = (leadJson?.leads || []) as LeadRow[];
      // Intake list is best-effort — never block the consult queue if it fails.
      const intakes = intakeRes.ok ? ((intakeJson?.items || []) as IntakeRow[]) : [];

      const leadRows: UnifiedRow[] = leads.map((l) => ({
        id: l.id,
        kind: "rec",
        title: l.customer_company || "—",
        region: l.region_code || "—",
        status: l.status,
        created_at: l.created_at,
        assignment: l.assigned_rep_user_id ? "Assigned" : "Unassigned",
        href: `/dashboard/opportunities/${encodeURIComponent(l.id)}`,
      }));

      const intakeRows: UnifiedRow[] = intakes.map((r) => ({
        id: r.id,
        kind: "intake",
        title:
          r.company_name ||
          [r.first_name, r.last_name].filter(Boolean).join(" ") ||
          r.project_name ||
          "—",
        region: r.region_code || "—",
        status: fmIntakeStatusLabel(r.status),
        created_at: r.created_at,
        assignment: r.reviewed_by_name ? `Reviewed by ${r.reviewed_by_name}` : "—",
        href: `/dashboard/project-intake/${encodeURIComponent(r.id)}`,
      }));

      const merged = [...leadRows, ...intakeRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setRows(merged);
      setScopedStates(Array.isArray(leadJson?.scopedStates) ? (leadJson.scopedStates as string[]) : null);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Failed to load opportunities.");
      setRows([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, region]);

  // A selected status is a REC-only concept; hide intakes so the filter reads
  // consistently. The Type filter otherwise controls what's shown.
  const visibleRows = rows.filter((r) => {
    if (typeFilter !== "all" && r.kind !== typeFilter) return false;
    if (status && r.kind === "intake") return false;
    return true;
  });

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-black">Consults &amp; Project Intakes</div>
          <div className="mt-1 text-sm text-[var(--anchor-gray)]">
            {isUnassigned
              ? "No states assigned to you yet"
              : isScoped
                ? `Triage for your region: ${scopedStates!.join(", ")}`
                : "Internal consult & intake management"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="h-9 px-3 text-[12px] font-semibold"
          >
            <option value="all">All types</option>
            <option value="rec">REC only</option>
            <option value="intake">Project Intake only</option>
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 px-3 text-[12px] font-semibold"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          {/* Region filter is only useful for admins — scoped reps
              already only see their states. */}
          {!isScoped && (
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Region (e.g. TX)"
              className="h-9 px-3 text-[12px]"
            />
          )}
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : loading ? (
          <Alert tone="neutral">Loading…</Alert>
        ) : visibleRows.length === 0 ? (
          <Alert tone={isUnassigned ? "error" : "neutral"}>
            {isUnassigned ? (
              <>
                Your account isn&apos;t assigned to any states yet, so nothing is
                showing. An admin needs to add you on the{" "}
                <Link href="/admin/sales-reps" className="font-semibold underline">
                  Sales Reps
                </Link>{" "}
                page with your email and the states you cover.
              </>
            ) : isScoped ? (
              `Nothing in ${scopedStates!.join(", ")} yet.`
            ) : (
              "No consults or intakes found."
            )}
          </Alert>
        ) : (
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Company</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Assignment</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          r.kind === "rec"
                            ? "bg-[var(--anchor-deep)] text-white"
                            : "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]"
                        }`}
                      >
                        {r.kind === "rec" ? "REC" : "Project Intake"}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={r.href}
                        className="font-semibold text-[var(--anchor-deep)] hover:text-[var(--anchor-green)]"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="text-[var(--anchor-gray)]">{r.region}</td>
                    <td className="text-[var(--anchor-gray)]">{r.status}</td>
                    <td className="text-[var(--anchor-gray)]">{formatWhen(r.created_at)}</td>
                    <td className="text-[var(--anchor-gray)]">{r.assignment}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        )}
      </div>
    </Card>
  );
}
