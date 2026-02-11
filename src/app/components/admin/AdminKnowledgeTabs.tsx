// src/app/components/admin/AdminKnowledgeTabs.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Alert } from "@/app/components/ui/Alert";
import { Select } from "@/app/components/ui/Field";
import { Tabs, TabButton } from "@/app/components/ui/Tabs";

type Role = "admin" | "anchor_rep" | "external_rep";

type FeedbackRow = {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  session_id: string | null;
  document_id: string | null;
  chunk_id: string | null;
  rating: number | null;
  note: string | null;
  status: string | null;
  created_at: string;
};

type CorrectionRow = {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  session_id: string | null;
  document_id: string | null;
  chunk_id: string | null;
  note: string | null;
  correction: string | null;
  status: string | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

type KnowledgeDocRow = {
  id: string;
  title: string | null;
  status: string | null;
  allowed: boolean | null;
  audience: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type TabKey = "feedback" | "corrections" | "docs";

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminKnowledgeTabs({ role }: { role: Role }) {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [tab, setTab] = useState<TabKey>("feedback");

  // filters
  const [fbStatus, setFbStatus] = useState<string>("new");
  const [fbRating, setFbRating] = useState<string>(""); // "", "1", "5"
  const [coStatus, setCoStatus] = useState<string>("pending");

  // data
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [docs, setDocs] = useState<KnowledgeDocRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadFeedback() {
    setLoading(true);
    setErr(null);
    try {
      let q = supabase
        .from("knowledge_feedback")
        .select("id,user_id,conversation_id,session_id,document_id,chunk_id,rating,note,status,created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (fbStatus) q = q.eq("status", fbStatus);
      if (fbRating) q = q.eq("rating", Number(fbRating));

      const { data, error } = await q;
      if (error) throw error;
      setFeedback((data || []) as FeedbackRow[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }

  async function loadCorrections() {
    setLoading(true);
    setErr(null);
    try {
      let q = supabase
        .from("knowledge_corrections")
        .select(
          "id,user_id,conversation_id,session_id,document_id,chunk_id,note,correction,status,created_at,reviewed_at,reviewed_by"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (coStatus) q = q.eq("status", coStatus);

      const { data, error } = await q;
      if (error) throw error;
      setCorrections((data || []) as CorrectionRow[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load corrections");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocs() {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id,title,status,allowed,audience,updated_at,created_at")
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setDocs((data || []) as KnowledgeDocRow[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load docs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMsg(null);
    setErr(null);
    if (tab === "feedback") loadFeedback();
    if (tab === "corrections") loadCorrections();
    if (tab === "docs") loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // reload on filter change
  useEffect(() => {
    if (tab === "feedback") loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbStatus, fbRating]);

  useEffect(() => {
    if (tab === "corrections") loadCorrections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coStatus]);

  async function markFeedbackReviewed(id: string) {
    setMsg(null);
    setErr(null);
    try {
      if (role !== "admin") throw new Error("Only admins can mark reviewed in v1.");

      const { data: u } = await supabase.auth.getUser();
      const reviewer = u.user?.id ?? null;

      const { error } = await supabase
        .from("knowledge_feedback")
        .update({ status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
        .eq("id", id);

      if (error) throw error;

      setMsg("Feedback marked reviewed.");
      await loadFeedback();
    } catch (e: any) {
      setErr(e?.message || "Update failed");
    }
  }

  async function approveCorrection(id: string, promoteToDoc: boolean) {
    setMsg(null);
    setErr(null);

    try {
      if (role !== "admin") throw new Error("Only admins can approve/reject corrections.");

      const { data: u } = await supabase.auth.getUser();
      const reviewer = u.user?.id ?? null;

      const row = corrections.find((c) => c.id === id);
      if (!row) throw new Error("Correction not found in state.");

      // 1) set correction approved
      const { error: upErr } = await supabase
        .from("knowledge_corrections")
        .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
        .eq("id", id);

      if (upErr) throw upErr;

      // 2) optionally promote into knowledge_documents as a DRAFT (safe)
      if (promoteToDoc) {
        const title = row.document_id
          ? `Correction for doc ${row.document_id}`
          : `Correction ${id.slice(0, 8)}`;

        const { error: insErr } = await supabase.from("knowledge_documents").insert({
          title,
          // v1 safe behavior: keep draft + not allowed until you ingest/reindex
          status: "draft",
          allowed: false,
          audience: "internal",
          content: row.correction ?? "",
          metadata: {
            source: "correction",
            correction_id: row.id,
            conversation_id: row.conversation_id,
            session_id: row.session_id,
            document_id: row.document_id,
            chunk_id: row.chunk_id,
            note: row.note,
          },
        });

        // If your knowledge_documents table doesn't have content/metadata, this will error—
        // then we’ll switch to a separate "correction_docs" table.
        if (insErr) throw insErr;
      }

      setMsg(promoteToDoc ? "Correction approved + promoted to doc draft." : "Correction approved.");
      await loadCorrections();
    } catch (e: any) {
      setErr(e?.message || "Approve failed");
    }
  }

  async function rejectCorrection(id: string) {
    setMsg(null);
    setErr(null);

    try {
      if (role !== "admin") throw new Error("Only admins can approve/reject corrections.");

      const { data: u } = await supabase.auth.getUser();
      const reviewer = u.user?.id ?? null;

      const { error } = await supabase
        .from("knowledge_corrections")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
        .eq("id", id);

      if (error) throw error;

      setMsg("Correction rejected.");
      await loadCorrections();
    } catch (e: any) {
      setErr(e?.message || "Reject failed");
    }
  }

  async function toggleDocAllowed(docId: string, allowed: boolean) {
    setMsg(null);
    setErr(null);

    try {
      if (role !== "admin") throw new Error("Only admins can change doc availability.");

      const { error } = await supabase
        .from("knowledge_documents")
        .update({ allowed, updated_at: new Date().toISOString() })
        .eq("id", docId);

      if (error) throw error;

      setMsg("Doc updated.");
      await loadDocs();
    } catch (e: any) {
      setErr(e?.message || "Doc update failed");
    }
  }

  async function setDocStatus(docId: string, status: string) {
    setMsg(null);
    setErr(null);

    try {
      if (role !== "admin") throw new Error("Only admins can change doc status.");

      const { error } = await supabase
        .from("knowledge_documents")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", docId);

      if (error) throw error;

      setMsg("Doc status updated.");
      await loadDocs();
    } catch (e: any) {
      setErr(e?.message || "Doc update failed");
    }
  }

  return (
    <div className="ds-card border-white/15 bg-white/10 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 p-3">
        <Tabs className="border-white/20 bg-white/10">
          <TabButton active={tab === "feedback"} onClick={() => setTab("feedback")}>
            Feedback
          </TabButton>
          <TabButton active={tab === "corrections"} onClick={() => setTab("corrections")}>
            Corrections
          </TabButton>
          <TabButton active={tab === "docs"} onClick={() => setTab("docs")}>
            Knowledge docs
          </TabButton>
        </Tabs>

        <Button
          className="px-3 py-2"
          variant="ghost"
          onClick={() => {
            if (tab === "feedback") loadFeedback();
            if (tab === "corrections") loadCorrections();
            if (tab === "docs") loadDocs();
          }}
        >
          Refresh
        </Button>
      </div>

      {msg ? (
        <Alert className="mx-3 mt-3 border-white/20 bg-[var(--anchor-mint)] text-[var(--anchor-deep)]" tone="success">
          {msg}
        </Alert>
      ) : null}

      {err ? (
        <Alert className="mx-3 mt-3 border-white/20 bg-white/10 text-white" tone="error">
          {err}
        </Alert>
      ) : null}

      <div className="p-3">
        {tab === "feedback" ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-[12px] text-white/70">Status</label>
              <Select
                className="w-auto border-white/15 bg-black/20 px-2 py-2 text-[12px] text-white"
                value={fbStatus}
                onChange={(e) => setFbStatus(e.target.value)}
              >
                <option value="new">new</option>
                <option value="reviewed">reviewed</option>
                <option value="">(all)</option>
              </Select>

              <label className="ml-2 text-[12px] text-white/70">Rating</label>
              <Select
                className="w-auto border-white/15 bg-black/20 px-2 py-2 text-[12px] text-white"
                value={fbRating}
                onChange={(e) => setFbRating(e.target.value)}
              >
                <option value="">(all)</option>
                <option value="1">1 (bad)</option>
                <option value="5">5 (good)</option>
              </Select>

              <div className="ml-auto text-[12px] text-white/60">
                {loading ? "Loading…" : `${feedback.length} rows`}
              </div>
            </div>

            <div className="space-y-2">
              {feedback.map((f) => (
                <div key={f.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[12px] text-white/70">
                      <span className="font-semibold text-white/90">Rating:</span> {f.rating ?? "—"}{" "}
                      <span className="opacity-60">•</span> {fmt(f.created_at)}
                    </div>

                    {role === "admin" ? (
                      <Button
                        className="px-3 py-1 text-[12px]"
                        onClick={() => markFeedbackReviewed(f.id)}
                        variant="ghost"
                      >
                        Mark reviewed
                      </Button>
                    ) : null}
                  </div>

                  {f.note ? <div className="mt-2 text-[12px] text-white/80">{f.note}</div> : null}

                  <div className="mt-2 text-[11px] text-white/50 break-words">
                    user: {f.user_id ?? "—"} • session: {f.session_id ?? "—"} • doc:{" "}
                    {f.document_id ?? "—"} • chunk: {f.chunk_id ?? "—"} • status: {f.status ?? "—"}
                  </div>
                </div>
              ))}
              {feedback.length === 0 && !loading ? (
                <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-[12px] text-white/70">
                  No feedback for current filters.
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {tab === "corrections" ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-[12px] text-white/70">Status</label>
              <Select
                className="w-auto border-white/15 bg-black/20 px-2 py-2 text-[12px] text-white"
                value={coStatus}
                onChange={(e) => setCoStatus(e.target.value)}
              >
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="">(all)</option>
              </Select>

              <div className="ml-auto text-[12px] text-white/60">
                {loading ? "Loading…" : `${corrections.length} rows`}
              </div>
            </div>

            <div className="space-y-2">
              {corrections.map((c) => (
                <div key={c.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[12px] text-white/70">
                      <span className="font-semibold text-white/90">Status:</span> {c.status ?? "—"}{" "}
                      <span className="opacity-60">•</span> {fmt(c.created_at)}
                    </div>

                    {role === "admin" ? (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-[12px] text-white/70">
                          <input id={`promote-${c.id}`} type="checkbox" className="accent-emerald-400" />
                          Promote to doc draft
                        </label>

                        <Button
                          className="px-3 py-1 text-[12px]"
                          onClick={() => {
                            const cb = document.getElementById(`promote-${c.id}`) as HTMLInputElement | null;
                            approveCorrection(c.id, !!cb?.checked);
                          }}
                          variant="secondary"
                        >
                          Approve
                        </Button>

                        <Button
                          className="px-3 py-1 text-[12px] text-white"
                          onClick={() => rejectCorrection(c.id)}
                          variant="destructive"
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {c.note ? <div className="mt-2 text-[12px] text-white/80">Note: {c.note}</div> : null}

                  {c.correction ? (
                    <div className="mt-2 whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-2 text-[12px] text-white/90">
                      {c.correction}
                    </div>
                  ) : null}

                  <div className="mt-2 text-[11px] text-white/50 break-words">
                    user: {c.user_id ?? "—"} • session: {c.session_id ?? "—"} • doc:{" "}
                    {c.document_id ?? "—"} • chunk: {c.chunk_id ?? "—"}
                    {c.reviewed_at ? ` • reviewed: ${fmt(c.reviewed_at)}` : ""}
                  </div>
                </div>
              ))}
              {corrections.length === 0 && !loading ? (
                <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-[12px] text-white/70">
                  No corrections for current filters.
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {tab === "docs" ? (
          <>
            <div className="mb-3 text-[12px] text-white/60">
              {loading ? "Loading…" : `${docs.length} docs`}
            </div>

            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white/90">
                        {d.title ?? "(untitled)"}
                      </div>
                      <div className="text-[11px] text-white/55">
                        id: {d.id} • updated: {fmt(d.updated_at || d.created_at)}
                      </div>
                    </div>

                    {role === "admin" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          className="w-auto border-white/15 bg-black/20 px-2 py-2 text-[12px] text-white"
                          value={d.status ?? "draft"}
                          onChange={(e) => setDocStatus(d.id, e.target.value)}
                        >
                          <option value="draft">draft</option>
                          <option value="approved">approved</option>
                          <option value="archived">archived</option>
                        </Select>

                        <Button
                          className="px-3 py-2 text-[12px]"
                          onClick={() => toggleDocAllowed(d.id, !(d.allowed ?? false))}
                          variant="ghost"
                        >
                          {d.allowed ? "Allowed ✅" : "Blocked 🚫"}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-2 text-[11px] text-white/60">
                    audience: {d.audience ?? "—"} • status: {d.status ?? "—"} • allowed:{" "}
                    {String(!!d.allowed)}
                  </div>
                </div>
              ))}

              {docs.length === 0 && !loading ? (
                <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-[12px] text-white/70">
                  No docs found.
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
