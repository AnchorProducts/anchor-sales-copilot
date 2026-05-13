"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import { Input, Select } from "@/app/components/ui/Field";
import { Alert } from "@/app/components/ui/Alert";
import { Table, TableWrapper } from "@/app/components/ui/Table";

const STATUSES = ["new", "assigned", "contacted", "qualified", "closed_won", "closed_lost"];

type LeadRow = {
  id: string;
  customer_company: string;
  region_code: string;
  status: string;
  created_at: string;
  assigned_rep_user_id: string | null;
};

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LeadsTable() {
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
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
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      // Region filter only applies to admins (the only ones who see the
      // input). For scoped reps the server enforces region itself.
      if (region && !isScoped) params.set("region", region);

      const res = await fetch(`/api/leads?${params.toString()}`, { cache: "no-store" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to load opportunities.");
        setLeads([]);
        setLoading(false);
        return;
      }

      setLeads((json?.leads || []) as LeadRow[]);
      setScopedStates(
        Array.isArray(json?.scopedStates) ? (json.scopedStates as string[]) : null
      );
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Failed to load opportunities.");
      setLeads([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, region]);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-black">Consults</div>
          <div className="mt-1 text-sm text-[var(--anchor-gray)]">
            {isUnassigned
              ? "No states assigned to you yet"
              : isScoped
                ? `Triage for your region: ${scopedStates!.join(", ")}`
                : "Internal consult management"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
        ) : leads.length === 0 ? (
          <Alert tone={isUnassigned ? "error" : "neutral"}>
            {isUnassigned ? (
              <>
                Your account isn&apos;t assigned to any states yet, so no
                consults are showing. An admin needs to add you on the{" "}
                <Link
                  href="/admin/sales-reps"
                  className="font-semibold underline"
                >
                  Sales Reps
                </Link>{" "}
                page with your email and the states you cover.
              </>
            ) : isScoped ? (
              `No consults in ${scopedStates!.join(", ")} yet.`
            ) : (
              "No leads found."
            )}
          </Alert>
        ) : (
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Assignment</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link
                        href={`/dashboard/opportunities/${encodeURIComponent(lead.id)}`}
                        className="font-semibold text-[var(--anchor-deep)] hover:text-[var(--anchor-green)]"
                      >
                        {lead.customer_company}
                      </Link>
                    </td>
                    <td className="text-[var(--anchor-gray)]">{lead.region_code}</td>
                    <td className="text-[var(--anchor-gray)]">{lead.status}</td>
                    <td className="text-[var(--anchor-gray)]">{formatWhen(lead.created_at)}</td>
                    <td className="text-[var(--anchor-gray)]">
                      {lead.assigned_rep_user_id ? "Assigned" : "Unassigned"}
                    </td>
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
