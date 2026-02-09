"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-black">Leads</div>
          <div className="mt-1 text-sm text-[#76777B]">Internal lead management</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-xl border border-black/10 bg-white px-3 text-[12px] font-semibold"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Region (e.g. TX)"
            className="h-9 rounded-xl border border-black/10 bg-white px-3 text-[12px]"
          />
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : loading ? (
          <div className="rounded-2xl border border-black/10 bg-[#F6F7F8] p-4 text-sm text-black/60">Loading…</div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-[#F6F7F8] p-4 text-sm text-black/60">
            No leads found.
          </div>
        ) : (
          <div className="grid gap-2">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/dashboard/leads/${encodeURIComponent(lead.id)}`}
                className="block rounded-2xl border border-black/10 bg-white p-4 hover:bg-black/[0.03]"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-black truncate">{lead.customer_company}</div>
                    <div className="mt-1 text-[12px] text-[#76777B] truncate">
                      {lead.region_code} • {lead.status} • {formatWhen(lead.created_at)}
                    </div>
                  </div>
                  <div className="text-[12px] text-black/50">
                    {lead.assigned_rep_user_id ? "Assigned" : "Unassigned"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
