"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const STATUSES = ["new", "assigned", "contacted", "qualified", "closed_won", "closed_lost"] as const;

type Attachment = {
  path: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

type LeadRow = {
  id: string;
  customer_company: string;
  details: string;
  location_text: string;
  region_code: string;
  created_by_email: string | null;
  attachments: Attachment[] | null;
  status: string;
  assigned_rep_user_id: string | null;
  wants_video_call: boolean;
  preferred_times: any;
  video_call_phone: string | null;
  meeting_link: string | null;
  hubspot_company_id: string | null;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string | null;
  hubspot_sync_status?: string | null;
  hubspot_sync_error?: string | null;
  created_at: string;
};

type RepRow = { id: string; email: string | null; role: string | null };

type SignedAttachment = Attachment & { url: string | null };

function clean(v: any) {
  return String(v || "").trim();
}

export default function LeadDetail({ id }: { id: string }) {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [lead, setLead] = useState<LeadRow | null>(null);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [assignedRep, setAssignedRep] = useState<string>("");
  const [meetingLink, setMeetingLink] = useState<string>("");
  const [attachments, setAttachments] = useState<SignedAttachment[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, { cache: "no-store" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to load lead.");
        setLead(null);
        setLoading(false);
        return;
      }

      const row = json?.lead as LeadRow;
      setLead(row);
      setStatus(row.status || "new");
      setAssignedRep(row.assigned_rep_user_id || "");
      setMeetingLink(row.meeting_link || "");

      // load reps
      const { data: repRows } = await supabase
        .from("profiles")
        .select("id,email,role")
        .in("role", ["admin", "anchor_rep"]);

      setReps((repRows || []) as RepRow[]);

      // sign attachment urls
      const atts = Array.isArray(row.attachments) ? row.attachments : [];
      const signed: SignedAttachment[] = [];

      for (const att of atts) {
        const { data } = await supabase.storage.from("lead-uploads").createSignedUrl(att.path, 60 * 30);
        signed.push({ ...att, url: data?.signedUrl || null });
      }

      setAttachments(signed);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Failed to load lead.");
      setLead(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          assigned_rep_user_id: assignedRep || null,
          meeting_link: meetingLink || null,
        }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to update lead.");
        setSaving(false);
        return;
      }

      setLead(json?.lead || lead);
      setSaving(false);
    } catch (e: any) {
      setError(e?.message || "Failed to update lead.");
      setSaving(false);
    }
  }

  async function syncHubSpot() {
    setSyncing(true);
    setSyncMsg(null);

    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}/hubspot-sync`, {
        method: "POST",
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setSyncMsg(json?.error || "HubSpot sync failed.");
        setSyncing(false);
        return;
      }

      setSyncMsg("HubSpot sync complete.");
      await load();
      setSyncing(false);
    } catch (e: any) {
      setSyncMsg(e?.message || "HubSpot sync failed.");
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="rounded-3xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">
        Lead not found.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-black">Lead details</div>
        <div className="mt-2 text-sm text-[#76777B]">{lead.customer_company}</div>

        <div className="mt-4 grid gap-3 text-sm">
          <div>
            <div className="text-[12px] font-semibold text-black/70">Location</div>
            <div>{lead.location_text}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-black/70">Details</div>
            <div className="whitespace-pre-wrap">{lead.details}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-black/70">Requested video call</div>
            <div>{lead.wants_video_call ? "Yes" : "No"}</div>
          </div>
          {lead.wants_video_call && lead.preferred_times && (
            <div>
              <div className="text-[12px] font-semibold text-black/70">Preferred times</div>
              <div className="whitespace-pre-wrap">
                {Array.isArray(lead.preferred_times) ? lead.preferred_times.join("\n") : String(lead.preferred_times)}
              </div>
            </div>
          )}
          {lead.wants_video_call && (
            <div>
              <div className="text-[12px] font-semibold text-black/70">Phone number</div>
              <div>{lead.video_call_phone || "—"}</div>
            </div>
          )}
          <div>
            <div className="text-[12px] font-semibold text-black/70">Created by</div>
            <div>{lead.created_by_email || "Unknown"}</div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-black">Attachments</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {attachments.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-[#F6F7F8] p-4 text-sm text-black/60">
              No attachments.
            </div>
          ) : (
            attachments.map((att) => (
              <a
                key={att.path}
                href={att.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-black/10 bg-white p-3 hover:bg-black/[0.03]"
              >
                <div className="text-sm font-semibold text-black truncate">{att.filename}</div>
                <div className="mt-1 text-[12px] text-[#76777B] truncate">{att.path}</div>
              </a>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-black">Lead actions</div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Assign rep</span>
            <select
              value={assignedRep}
              onChange={(e) => setAssignedRep(e.target.value)}
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {clean(r.email) || r.id}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Meeting link</span>
            <input
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
              placeholder="https://…"
            />
          </label>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl bg-[#047835] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button
            type="button"
            onClick={syncHubSpot}
            disabled={syncing}
            className="inline-flex items-center justify-center rounded-xl border border-black/10 px-4 py-2 text-[12px] font-semibold text-black/70 hover:bg-black/[0.03] disabled:opacity-60"
          >
            {syncing ? "Syncing…" : "Sync to HubSpot"}
          </button>

          {syncMsg && <span className="text-[12px] text-black/60 self-center">{syncMsg}</span>}
        </div>
      </section>

      <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-black">HubSpot</div>
        <div className="mt-2 text-[12px] text-[#76777B]">
          Sync status: {lead.hubspot_sync_status || "pending"}
        </div>
        {lead.hubspot_sync_status === "failed" && lead.hubspot_sync_error && (
          <div className="mt-1 text-[12px] text-red-600">{lead.hubspot_sync_error}</div>
        )}
        <div className="mt-3 text-[12px] text-[#76777B]">Company: {lead.hubspot_company_id || "—"}</div>
        <div className="text-[12px] text-[#76777B]">Contact: {lead.hubspot_contact_id || "—"}</div>
        <div className="text-[12px] text-[#76777B]">Deal: {lead.hubspot_deal_id || "—"}</div>
      </section>
    </div>
  );
}
