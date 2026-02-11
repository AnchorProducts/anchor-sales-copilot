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

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (region) params.set("region", region);

      const res = await fetch(`/api/leads?${params.toString()}`, { cache: "no-store" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to load leads.");
        setLeads([]);
        setLoading(false);
        return;
      }

      setLeads((json?.leads || []) as LeadRow[]);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Failed to load leads.");
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
          <div className="text-sm font-semibold text-black">Leads</div>
          <div className="mt-1 text-sm text-[var(--anchor-gray)]">Internal lead management</div>
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
          <Input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Region (e.g. TX)"
            className="h-9 px-3 text-[12px]"
          />
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : loading ? (
          <Alert tone="neutral">Loading…</Alert>
        ) : leads.length === 0 ? (
          <Alert tone="neutral">
            No leads found.
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
                        href={`/dashboard/leads/${encodeURIComponent(lead.id)}`}
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
