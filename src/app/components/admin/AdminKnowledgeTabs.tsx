// src/app/components/admin/AdminKnowledgeTabs.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Alert } from "@/app/components/ui/Alert";
import { Select } from "@/app/components/ui/Field";
import { Tabs, TabButton } from "@/app/components/ui/Tabs";
import {
  SOLUTION_CATALOG,
  SOLUTION_CATEGORIES,
  type SolutionCategoryKey,
} from "@/lib/solutions/solutionCatalog";

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
  user_message?: string | null;
  assistant_message?: string | null;
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
  user_message?: string | null;
  status: string | null;
  active?: boolean | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

type LibraryDocRow = {
  path: string;
  filename: string;
  title: string;
  product_name: string | null;
  knowledge_document_id: string | null;
  status: string | null;
  allowed: boolean | null;
  category: string | null;
  indexed: boolean;
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
  const [coStatus, setCoStatus] = useState<string>(""); // default: show all corrections

  // data
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [docs, setDocs] = useState<LibraryDocRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [collapsedSols, setCollapsedSols] = useState<Record<string, boolean>>({});
  // Per-doc "Replace file" state: which path is uploading + inline status.
  const [replacingPath, setReplacingPath] = useState<string | null>(null);
  const [replaceStatus, setReplaceStatus] = useState<Record<string, string>>({});
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);
  // Promote-to-doc checkbox state per correction id (avoids reading the DOM).
  const [promote, setPromote] = useState<Record<string, boolean>>({});

  function toggleCat(key: string) {
    setCollapsedCats((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }
  function toggleSol(key: string) {
    setCollapsedSols((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  // Two-level grouping: category → solution → docs. Each level renders as a
  // collapsible dropdown so the admin can drill in without scanning a wall
  // of cards.
  type SolutionGroup = { key: string; label: string; docs: LibraryDocRow[] };
  type CategoryGroup = { key: string; label: string; total: number; solutions: SolutionGroup[] };

  const docGroups = useMemo<CategoryGroup[]>(() => {
    const slugify = (input: string) =>
      String(input || "")
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    function catalogItemForDoc(d: LibraryDocRow) {
      const parentSlug = (() => {
        if (d.product_name) return slugify(d.product_name);
        const m = (d.path || "").match(/^solutions\/([^/]+)/i);
        return m ? m[1].toLowerCase() : "";
      })();
      if (!parentSlug) return null;
      for (const item of SOLUTION_CATALOG) {
        if (slugify(item.label) === parentSlug) return item;
        if (item.legacyName && slugify(item.legacyName) === parentSlug) return item;
        const tail = item.legacyFolder?.split("/").pop();
        if (tail && tail === parentSlug) return item;
      }
      return null;
    }

    function categoryForDoc(d: LibraryDocRow): SolutionCategoryKey | "uncategorized" {
      return catalogItemForDoc(d)?.category ?? "uncategorized";
    }

    function solutionLabelForDoc(d: LibraryDocRow): string {
      // Prefer the CEO catalog label (e.g. "Medium Electrical Box Frame - w/
      // 3000 Series U-Anchor") so the admin sees the same names that reps
      // see in the Resource Library, not the underlying legacy DB name.
      const catalogItem = catalogItemForDoc(d);
      if (catalogItem) return catalogItem.label;
      if (d.product_name) return d.product_name;
      const m = (d.path || "").match(/^solutions\/([^/]+)/i);
      return m ? m[1] : "Uncategorized";
    }

    // Map: catKey → (solLabel → docs)
    const catBuckets = new Map<string, Map<string, LibraryDocRow[]>>();
    for (const d of docs) {
      const catKey = categoryForDoc(d);
      const solLabel = solutionLabelForDoc(d);
      if (!catBuckets.has(catKey)) catBuckets.set(catKey, new Map());
      const solBuckets = catBuckets.get(catKey)!;
      if (!solBuckets.has(solLabel)) solBuckets.set(solLabel, []);
      solBuckets.get(solLabel)!.push(d);
    }

    const titles: Record<string, string> = {
      "mechanical": "Mechanical",
      "box-frames": "Box Frames",
      "pipe-conduit-supports": "Pipe & Conduit Supports",
      "snow-retention": "Snow Retention",
      "elevated-structure-securement": "Elevated Structure Securement",
      "h-frame-supports": "Pipe & Duct Frame Supports",
      "rooftop-solar": "Rooftop Solar",
      "equipment-screen": "Equipment Screen",
      "safety-access": "Safety & Access",
      "lightning-protection": "Lightning Protection",
      "security-monitoring-communication": "Security, Monitoring, & Communication",
      "uncategorized": "Uncategorized",
    };

    const order: string[] = [
      ...SOLUTION_CATEGORIES.map((c) => c.key as string),
      "uncategorized",
    ];

    return order
      .map((catKey) => {
        const solBuckets = catBuckets.get(catKey);
        if (!solBuckets || solBuckets.size === 0) return null;
        const solutions: SolutionGroup[] = Array.from(solBuckets.entries())
          .map(([solLabel, solDocs]) => ({
            key: `${catKey}::${solLabel}`,
            label: solLabel,
            docs: solDocs.sort((a, b) => a.title.localeCompare(b.title)),
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        const total = solutions.reduce((sum, s) => sum + s.docs.length, 0);
        return {
          key: catKey,
          label: titles[catKey] ?? catKey,
          total,
          solutions,
        } as CategoryGroup;
      })
      .filter((g): g is CategoryGroup => g !== null);
  }, [docs]);

  async function loadFeedback() {
    setLoading(true);
    setErr(null);
    try {
      let q = supabase
        .from("knowledge_feedback")
        .select("id,user_id,conversation_id,session_id,document_id,chunk_id,rating,note,user_message,assistant_message,status,created_at")
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
          "id,user_id,conversation_id,session_id,document_id,chunk_id,note,correction,user_message,status,active,created_at,reviewed_at,reviewed_by"
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

  // Knowledge docs admin lists the actual files in the Resource Library
  // (every storage object under solutions/), no internal/test/pricebook
  // paths. New uploads in the library show up here automatically; the
  // admin controls map onto the matching knowledge_documents row when one
  // exists.
  async function loadDocs() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/knowledge/library-docs", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setDocs((json?.items || []) as LibraryDocRow[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load docs");
    } finally {
      setLoading(false);
    }
  }

  // The permanent public link pasted into the Webflow CMS. Overwriting the file
  // at this path is exactly what updates the doc everywhere it's linked.
  const EXTERNAL_BASE =
    (process.env.NEXT_PUBLIC_EXTERNAL_APP_URL || "https://anchor-sales-copilot.vercel.app").replace(
      /\/+$/,
      "",
    );
  function publicDocUrl(path: string) {
    return `${EXTERNAL_BASE}/api/public/doc?path=${encodeURIComponent(path)}`;
  }

  async function copyPublicLink(path: string) {
    try {
      await navigator.clipboard.writeText(publicDocUrl(path));
      setCopiedPath(path);
      window.setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 1500);
    } catch {
      setErr("Couldn't copy link — copy it manually from the field.");
    }
  }

  // Kick off the file picker for a specific doc. The chosen file overwrites the
  // storage object at `path` (upsert), so the Webflow link keeps working and
  // now serves the new content.
  function pickReplacement(path: string) {
    replaceTargetRef.current = path;
    // Reset so re-selecting the same filename still fires onChange.
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    replaceInputRef.current?.click();
  }

  async function onReplacementChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const path = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !path) return;

    setErr(null);
    setMsg(null);
    setReplacingPath(path);
    setReplaceStatus((prev) => ({ ...prev, [path]: "Uploading…" }));

    try {
      // Phase 1: sign an upload URL bound to the existing path.
      const signRes = await fetch("/api/admin/knowledge/library-docs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "sign", path }),
      });
      const sign = await signRes.json().catch(() => null);
      if (!signRes.ok || !sign?.token) {
        throw new Error(sign?.error || `HTTP ${signRes.status}`);
      }

      // Phase 2: push the bytes straight to Supabase Storage (overwrite).
      const { error: upErr } = await supabase.storage
        .from("knowledge")
        .uploadToSignedUrl(sign.path, sign.token, file, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);

      // Phase 3: re-index so the copilot answers from the new file.
      setReplaceStatus((prev) => ({ ...prev, [path]: "Re-indexing…" }));
      const commitRes = await fetch("/api/admin/knowledge/library-docs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "commit", path }),
      });
      const commit = await commitRes.json().catch(() => null);
      if (!commitRes.ok) throw new Error(commit?.error || `HTTP ${commitRes.status}`);

      setReplaceStatus((prev) => ({ ...prev, [path]: "✓ Replaced" }));
      setMsg("File replaced — every link pointing at this path now serves the new version.");
      await loadDocs();
    } catch (e: any) {
      setReplaceStatus((prev) => ({ ...prev, [path]: "" }));
      setErr(e?.message || "Replace failed");
    } finally {
      setReplacingPath(null);
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

      // 1) set correction approved (and active, so the copilot uses it)
      const { error: upErr } = await supabase
        .from("knowledge_corrections")
        .update({ status: "approved", active: true, reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
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
        .update({ status: "rejected", active: false, reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
        .eq("id", id);

      if (error) throw error;

      setMsg("Correction rejected.");
      await loadCorrections();
    } catch (e: any) {
      setErr(e?.message || "Reject failed");
    }
  }

  // Per-correction on/off switch for whether the copilot applies it (gates the
  // match_knowledge_corrections RPC). Independent of approve/reject status so an
  // admin can mute a correction without formally rejecting it.
  async function setCorrectionActive(id: string, next: boolean) {
    setMsg(null);
    setErr(null);
    try {
      if (role !== "admin") throw new Error("Only admins can toggle corrections.");
      // Optimistic update so the switch feels instant.
      setCorrections((prev) => prev.map((c) => (c.id === id ? { ...c, active: next } : c)));
      const { error } = await supabase
        .from("knowledge_corrections")
        .update({ active: next })
        .eq("id", id);
      if (error) {
        setCorrections((prev) => prev.map((c) => (c.id === id ? { ...c, active: !next } : c)));
        throw error;
      }
      setMsg(next ? "Correction is now ON — the copilot will use it." : "Correction is now OFF — the copilot will ignore it.");
    } catch (e: any) {
      setErr(e?.message || "Toggle failed");
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
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/70">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          (f.rating ?? 0) >= 4
                            ? "bg-emerald-400/20 text-emerald-200"
                            : "bg-red-400/20 text-red-200"
                        }`}
                      >
                        {(f.rating ?? 0) >= 4 ? "👍 Accurate" : "👎 Needs correction"}
                      </span>
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

                  {f.user_message ? (
                    <div className="mt-2 text-[12px] text-white/70">
                      <span className="font-semibold text-white/80">Question:</span> {f.user_message}
                    </div>
                  ) : null}

                  {f.assistant_message ? (
                    <div className="mt-2 whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-2 text-[12px] text-white/90">
                      <span className="font-semibold text-white/70">Answer rated: </span>
                      {f.assistant_message}
                    </div>
                  ) : null}

                  {f.note ? (
                    <div className="mt-2 text-[12px] text-white/80">
                      <span className="font-semibold text-white/70">Note:</span> {f.note}
                    </div>
                  ) : null}

                  {!f.user_message && !f.assistant_message && !f.note ? (
                    <div className="mt-2 text-[11px] italic text-white/40">
                      No message captured (rated before message logging was added).
                    </div>
                  ) : null}

                  <div className="mt-2 text-[11px] text-white/50 break-words">
                    user: {f.user_id ?? "—"} • session: {f.session_id ?? "—"} • status: {f.status ?? "—"}
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
              {corrections.map((c) => {
                const isActive = c.active ?? true;
                return (
                <div key={c.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/70">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isActive ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/50"
                        }`}
                      >
                        <span className={`inline-block h-2 w-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-white/40"}`} />
                        {isActive ? "Used by Copilot" : "Off"}
                      </span>
                      <span className="font-semibold text-white/90">Status:</span> {c.status ?? "—"}{" "}
                      <span className="opacity-60">•</span> {fmt(c.created_at)}
                    </div>

                    {role === "admin" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Primary on/off control: whether the copilot uses this correction. */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          onClick={() => setCorrectionActive(c.id, !isActive)}
                          title={isActive ? "Copilot is using this correction — click to turn off" : "Copilot is ignoring this correction — click to turn on"}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                            isActive ? "bg-emerald-400" : "bg-white/20"
                          }`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>

                        <label className="flex items-center gap-2 text-[12px] text-white/70">
                          <input
                            type="checkbox"
                            className="accent-emerald-400"
                            checked={!!promote[c.id]}
                            onChange={(e) => setPromote((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                          />
                          Promote to doc draft
                        </label>

                        <Button
                          className="px-3 py-1 text-[12px]"
                          onClick={() => approveCorrection(c.id, !!promote[c.id])}
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

                  {c.user_message ? (
                    <div className="mt-2 text-[12px] text-white/60">
                      <span className="font-semibold text-white/80">Question:</span> {c.user_message}
                    </div>
                  ) : null}

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
                );
              })}
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
            <div className="mb-2 text-[12px] text-white/60">
              {loading ? "Loading…" : `${docs.length} library docs across ${docGroups.length} categories`}
            </div>
            <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-white/60">
              Use <span className="font-semibold text-white/80">Replace file</span> to swap a doc in place —
              its permanent link stays the same, so every spot it's linked (Webflow, chat) serves the new
              version. <span className="font-semibold text-white/80">Copy link</span> gives you the exact URL to
              paste into the CMS.
            </div>

            {/* One shared picker for all rows; the target path is set on click. */}
            <input
              ref={replaceInputRef}
              type="file"
              className="hidden"
              onChange={onReplacementChosen}
            />

            <div className="space-y-2">
              {docGroups.map((catGroup) => {
                const isCatCollapsed = collapsedCats[catGroup.key] ?? true;
                return (
                  <section key={catGroup.key} className="rounded-xl border border-white/10 bg-black/20">
                    <button
                      type="button"
                      onClick={() => toggleCat(catGroup.key)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                      aria-expanded={!isCatCollapsed}
                    >
                      <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/90">
                        {catGroup.label}
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">
                          {catGroup.total}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-white/50">{isCatCollapsed ? "▾" : "▴"}</span>
                    </button>

                    {!isCatCollapsed && (
                      <div className="border-t border-white/10 px-2 py-2 space-y-1.5">
                        {catGroup.solutions.map((solGroup) => {
                          const isSolCollapsed = collapsedSols[solGroup.key] ?? true;
                          return (
                            <div key={solGroup.key} className="rounded-lg border border-white/10 bg-black/30">
                              <button
                                type="button"
                                onClick={() => toggleSol(solGroup.key)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                                aria-expanded={!isSolCollapsed}
                              >
                                <span className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-white/90 break-words">
                                  {solGroup.label}
                                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                                    {solGroup.docs.length}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[11px] text-white/50">{isSolCollapsed ? "▾" : "▴"}</span>
                              </button>

                              {!isSolCollapsed && (
                                <div className="border-t border-white/10 px-2 py-2 space-y-1.5">
                                  {solGroup.docs.map((d) => {
                                    const status = replaceStatus[d.path];
                                    const isReplacing = replacingPath === d.path;
                                    return (
                                    <div key={d.path} className="rounded-md border border-white/10 bg-black/40 p-3">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="break-words text-sm font-semibold text-white/90">
                                            {d.title}
                                          </div>
                                          {d.updated_at && (
                                            <div className="text-[11px] text-white/55">updated {fmt(d.updated_at)}</div>
                                          )}
                                          <div className="mt-0.5 truncate text-[10px] text-white/40">
                                            {d.path}
                                          </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                          {status ? (
                                            <span className="text-[11px] text-white/70">{status}</span>
                                          ) : null}
                                          <button
                                            type="button"
                                            onClick={() => copyPublicLink(d.path)}
                                            className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                                            title="Copy the permanent link to paste into Webflow"
                                          >
                                            {copiedPath === d.path ? "Copied" : "Copy link"}
                                          </button>
                                          <Button
                                            className="px-3 py-1 text-[12px]"
                                            variant="secondary"
                                            disabled={isReplacing}
                                            onClick={() => pickReplacement(d.path)}
                                          >
                                            {isReplacing ? "Replacing…" : "Replace file"}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}

              {docGroups.length === 0 && !loading ? (
                <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-[12px] text-white/70">
                  No library docs yet. Upload files to a solution's tackle box in the Resource Library and they'll show up here.
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
