"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { getViewAs } from "@/lib/role/viewAs";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  subject: string;
  status: string;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_role: string | null;
  created_at: string;
  last_message_at: string;
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminSupportQueue() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "closed" | "all">("open");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      // If admin is previewing the external/internal experience via View-As,
      // send them to the user-facing support page so they see what those
      // users see (the form + their own thread list), not the admin queue.
      if (getViewAs()) { router.replace("/dashboard/support"); return; }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") { setDenied(true); setReady(true); return; }
      setReady(true);
      await load();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/support", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load.");
      setItems(json.items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = items.filter((r) => (tab === "all" ? true : r.status === tab));
  const openCount = items.filter((r) => r.status === "open").length;
  const closedCount = items.filter((r) => r.status === "closed").length;

  return (
    <main className="ds-page">
      <AppNavbar
        title="Support Queue"
        subtitle="User-submitted requests"
        menuItems={[{ label: "Admin Console", href: "/admin" }]}
      />

      <div className="mx-auto max-w-4xl px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">Loading…</Card>
        ) : denied ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            Admin access only.
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {([
                ["open", `Open (${openCount})`],
                ["closed", `Closed (${closedCount})`],
                ["all", `All (${items.length})`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={
                    "rounded-full px-3.5 py-1.5 text-xs font-semibold transition " +
                    (tab === key
                      ? "bg-[var(--anchor-deep)] text-white"
                      : "bg-white text-[var(--anchor-deep)] hover:bg-[var(--anchor-mint)]/30")
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <Card className="mt-4 p-5 text-sm text-black/60">Loading…</Card>
            ) : error ? (
              <Card className="mt-4 p-5 text-sm text-[#991b1b]">{error}</Card>
            ) : filtered.length === 0 ? (
              <Card className="mt-4 p-5 text-sm text-[var(--anchor-gray)]">
                No requests in this view.
              </Card>
            ) : (
              <ul className="mt-4 space-y-2">
                {filtered.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/support/${r.id}`}
                      className="block rounded-2xl border border-[var(--border-default)] bg-white p-4 transition hover:border-[var(--anchor-green)] hover:bg-[var(--anchor-mint)]/30"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{r.subject}</div>
                          <div className="text-xs text-[var(--anchor-gray)]">
                            {r.submitter_name || r.submitter_email || "user"}
                            {r.submitter_role ? ` · ${r.submitter_role}` : ""}
                            {" · "}
                            {timeAgo(r.last_message_at)}
                          </div>
                        </div>
                        <span className={
                          "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
                          (r.status === "open"
                            ? "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]"
                            : "bg-black/[0.06] text-black/55")
                        }>
                          {r.status}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
