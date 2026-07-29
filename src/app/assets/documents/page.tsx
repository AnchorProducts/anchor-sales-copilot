"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useSiteLive } from "@/lib/flags/useSiteLive";
import { NotLiveNotice } from "@/app/components/ui/NotLiveNotice";

export const dynamic = "force-dynamic";

/* ============================================================================
 * All Documents — a flat view of the SHARED library.
 *
 * Backed by /api/library/docs (assets ⋈ products ⋈ asset_categories, signed
 * server-side), so this page and the Anchor Internal Portal's Documents view
 * list exactly the same rows. The product-centric tackle boxes on /assets are
 * unchanged; this is the searchable index across all of them.
 * ==========================================================================*/

type Doc = {
  id: string;
  title: string;
  categoryKey: string | null;
  categoryLabel: string;
  visibility: string;
  productName: string | null;
  productId: string | null;
  path: string | null;
  updatedAt: string | null;
  downloadUrl: string | null;
};

const ALL = "All";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function extBadge(path: string | null): string {
  const m = String(path || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1].toUpperCase() : "FILE";
}

function chipClass(on: boolean) {
  return [
    "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition whitespace-nowrap",
    on
      ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
      : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]",
  ].join(" ");
}

export default function LibraryDocumentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const { live, ready: liveReady } = useSiteLive();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [solution, setSolution] = useState<string>(ALL);
  const [visibility, setVisibility] = useState<string>(ALL);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  useEffect(() => {
    if (!ready || !live) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/library/docs", { cache: "no-store", credentials: "include" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) { setErr(json?.error || "Couldn't load the library."); return; }
        setDocs((json?.docs ?? []) as Doc[]);
        setCategories((json?.categories ?? []) as string[]);
        setProducts((json?.products ?? []) as string[]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready, live]);

  const visibilities = useMemo(
    () => Array.from(new Set(docs.map((d) => d.visibility))).sort(),
    [docs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (category !== ALL && d.categoryLabel !== category) return false;
      if (solution !== ALL && d.productName !== solution) return false;
      if (visibility !== ALL && d.visibility !== visibility) return false;
      if (!q) return true;
      const hay = [d.title, d.categoryLabel, d.productName ?? "", d.path ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [docs, search, category, solution, visibility]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="All Documents"
        subtitle="The full resource library"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Resource Library", href: "/assets" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!liveReady ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : !live ? (
          <NotLiveNotice />
        ) : (
        <>
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">All Documents</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
            Every document in the shared library, searchable in one place.{" "}
            <Link href="/assets" className="font-semibold text-[var(--anchor-green)] underline-offset-2 hover:underline">
              Browse by solution instead
            </Link>
            .
          </p>
        </header>

        <div className="mb-4 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents, solutions, file names…"
            className="h-11 w-full rounded-full border border-[var(--border-default)] bg-white px-4 text-sm outline-none focus:border-[var(--anchor-green)] sm:max-w-lg"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
              aria-label="Filter by category"
            >
              <option value={ALL}>All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
              aria-label="Filter by solution"
            >
              <option value={ALL}>All solutions</option>
              {products.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            {visibilities.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {[ALL, ...visibilities].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={chipClass(visibility === v)}
                  >
                    {v === ALL ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {err && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>}

        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border-default)] px-4 py-3 text-xs text-[var(--anchor-gray)] sm:px-6">
            {loading
              ? "Loading…"
              : `${filtered.length}${filtered.length !== docs.length ? ` of ${docs.length}` : ""} documents`}
          </div>

          {!loading && filtered.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">
              {docs.length === 0 ? "No documents in the library yet." : "Nothing matches those filters."}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {filtered.map((d) => (
                <li key={d.id}>
                  <a
                    href={d.downloadUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!d.downloadUrl}
                    className={
                      "flex items-center gap-3 px-4 py-3 transition-colors sm:px-6 " +
                      (d.downloadUrl ? "hover:bg-[var(--surface-soft)]" : "cursor-not-allowed opacity-60")
                    }
                  >
                    <span className="grid h-9 w-11 shrink-0 place-items-center rounded-lg bg-[var(--surface-soft)] text-[10px] font-bold text-[var(--anchor-deep)]">
                      {extBadge(d.path)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{d.title}</span>
                        <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                          {d.categoryLabel}
                        </span>
                        {d.visibility === "internal" && (
                          <span className="rounded-full bg-[#fde68a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7c4a00]">
                            Internal
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--anchor-gray)]">
                        {d.productName || "No solution"} · Updated {fmtDate(d.updatedAt)}
                      </div>
                    </div>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--anchor-gray)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </>
        )}
      </div>
    </main>
  );
}
