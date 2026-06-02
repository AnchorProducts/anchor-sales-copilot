"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input } from "@/app/components/ui/Field";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { StackingFilesLoader } from "@/app/components/assets/StackingFilesLoader";
import {
  SOLUTION_CATALOG,
  SOLUTION_CATEGORIES,
  type CatalogSolution,
  type SolutionCategory,
} from "@/lib/solutions/solutionCatalog";
import {
  prefixCandidatesForProduct,
  isFolderLike,
  GLOBAL_SPEC_PATH,
} from "@/lib/assets/storagePrefixes";

type ProductSection = "solution" | "anchor" | "internal_assets";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  series: string | null;
  section: ProductSection;
  internal_kind: "tacklebox" | "docs_list" | "contacts_list" | null;
  active: boolean;
};

type ProfileRow = { role: string };

type FilterKey = "all" | "solution" | "anchor" | "internal_assets";

function norm(v: string | null | undefined) {
  return String(v || "").toLowerCase().trim();
}

function matchesSearch(p: ProductRow, q: string) {
  const s = norm(q);
  if (!s) return true;
  const hay = [p.name, p.sku ?? "", p.series ?? "", p.section ?? ""].join(" ").toLowerCase();
  return hay.includes(s);
}

function catalogMatchesSearch(item: CatalogSolution, q: string) {
  const s = norm(q);
  if (!s) return true;
  return item.label.toLowerCase().includes(s);
}

function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

function productHref(p: ProductRow) {
  if (p.section === "internal_assets") {
    if (p.internal_kind === "contacts_list") {
      return `/internal-assets/contacts/${encodeURIComponent(p.id)}`;
    }
    return `/internal-assets/docs/${encodeURIComponent(p.id)}`;
  }
  return `/assets/${encodeURIComponent(p.id)}`;
}

function btnClass(on: boolean) {
  return [
    "rounded-full border px-4 py-2 text-[12px] font-semibold transition whitespace-nowrap duration-200",
    on
      ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
      : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]",
  ].join(" ");
}

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Count the public files inside a product's tackle box, using the SAME resolver
// the tackle box itself uses (prefixCandidatesForProduct + first non-empty
// prefix + the always-included global spec). This keeps the per-card badge in
// lock-step with the "N Public" chip shown once the tackle box is opened.
// (/api/knowledge-list returns public paths only, so this is the public count.)
async function fetchTackleBoxFileCount(product: ProductRow, accessToken: string): Promise<number> {
  const candidates = prefixCandidatesForProduct(product);

  let paths: string[] = [];
  for (const candidate of candidates) {
    try {
      const res = await fetch(`/api/knowledge-list?prefix=${encodeURIComponent(candidate)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) continue;
      const json = await res.json().catch(() => ({}));
      const got = ((json?.paths as string[]) || []).filter((p) => !isFolderLike(p));
      if (got.length > 0) {
        paths = got;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  // The global spec is always shown inside every tackle box.
  const unique = new Set<string>(paths);
  unique.add(GLOBAL_SPEC_PATH);
  return unique.size;
}

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return results;
}

type AssetsBrowserProps = {
  // When true: hide the filter buttons, force the view to Solutions only,
  // and skip the anchors + internal assets sections entirely. Used by the
  // Knowledge admin tab so it mirrors the Resource Library catalog 1:1.
  solutionsOnly?: boolean;
};

export default function AssetsBrowser({ solutionsOnly = false }: AssetsBrowserProps = {}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRow[]>([]);
  // product.id -> number of files inside its tackle box (public files + global spec)
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [q, setQ] = useState("");
  const [activeOnly] = useState(true);
  const [filter, setFilter] = useState<FilterKey>(solutionsOnly ? "solution" : "all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [isInternalUser, setIsInternalUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  // Admin "New tacklebox" inline form
  const [showNewBox, setShowNewBox] = useState(false);
  const [creatingBox, setCreatingBox] = useState(false);
  const [newBoxMsg, setNewBoxMsg] = useState<string | null>(null);
  const [newBox, setNewBox] = useState<{ name: string; section: ProductSection; series: string; sku: string }>({
    name: "",
    section: "solution",
    series: "",
    sku: "",
  });

  const router = useRouter();

  function toggleCategory(key: string) {
    // Categories start collapsed; treat undefined as collapsed when toggling
    // so the first click expands.
    setCollapsed((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  async function adminOpenComingSoon(item: CatalogSolution) {
    if (!isAdmin || creatingKey) return;
    setCreatingKey(item.key);
    try {
      // If a DB row already exists (race / repeat click), navigate to it.
      const existing = findProductForCatalog(item);
      if (existing) {
        router.push(`/assets/${encodeURIComponent(existing.id)}`);
        return;
      }
      const res = await fetch("/api/admin/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.label, section: "solution" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.id) {
        setError(json?.error || "Could not create product row.");
        setCreatingKey(null);
        return;
      }
      router.push(`/assets/${encodeURIComponent(json.id)}`);
    } catch (e: any) {
      setError(e?.message || "Could not create product row.");
      setCreatingKey(null);
    }
  }

  async function createTacklebox() {
    if (!isAdmin || creatingBox) return;
    const name = newBox.name.trim();
    if (!name) {
      setNewBoxMsg("Name is required.");
      return;
    }
    setCreatingBox(true);
    setNewBoxMsg(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          section: newBox.section,
          series: newBox.series.trim() || null,
          sku: newBox.sku.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.id) {
        setNewBoxMsg(json?.error || "Could not create tacklebox.");
        setCreatingBox(false);
        return;
      }
      // Land on the new (or existing) tacklebox.
      router.push(`/assets/${encodeURIComponent(json.id)}`);
    } catch (e) {
      setNewBoxMsg(e instanceof Error ? e.message : "Could not create tacklebox.");
      setCreatingBox(false);
    }
  }

  const searchParams = useSearchParams();
  useEffect(() => {
    const initialQ = searchParams.get("q");
    if (initialQ) setQ(initialQ);
  }, [searchParams]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;

        if (!user) {
          if (!alive) return;
          setError("Not signed in.");
          setProducts([]);
          setCounts({});
          setIsInternalUser(false);
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        let internal = false;
        let admin = false;
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

          const role = (prof as ProfileRow | null)?.role || "";
          internal = isInternalRole(role);
          admin = role === "admin";
        } catch {
          internal = false;
          admin = false;
        }

        if (!alive) return;
        setIsInternalUser(internal);
        setIsAdmin(admin);

        if (!internal && filter === "internal_assets") {
          setFilter("all");
        }

        const prodQuery = supabase
          .from("products")
          .select("id,name,sku,series,section,internal_kind,active")
          .order("name", { ascending: true });

        if (activeOnly) prodQuery.eq("active", true);

        if (filter === "anchor" || filter === "internal_assets") {
          prodQuery.eq("section", filter);
        }

        if (!internal) {
          prodQuery.neq("section", "internal_assets");
        }

        const { data: prodRows, error: prodErr } = await prodQuery;

        if (!alive) return;

        if (prodErr) {
          setError(prodErr.message);
          setProducts([]);
          setCounts({});
          setLoading(false);
          return;
        }

        const list = (prodRows || []) as ProductRow[];
        setProducts(list);

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token || "";

        // Only solutions & anchors get a file-count badge. Internal-assets
        // products live behind internal/* paths that /api/knowledge-list hides,
        // and they render in their own docs/contacts pages anyway.
        const countable = list.filter((p) => p.section === "solution" || p.section === "anchor");

        const perProduct = await mapWithLimit(
          countable,
          6,
          async (p): Promise<[string, number]> => {
            const total = await fetchTackleBoxFileCount(p, accessToken);
            return [p.id, total];
          }
        );

        if (!alive) return;

        const map: Record<string, number> = {};
        for (const [id, c] of perProduct) map[id] = c;
        setCounts(map);

        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load asset library.");
        setProducts([]);
        setCounts({});
        setIsInternalUser(false);
        setIsAdmin(false);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase, activeOnly, filter]);

  // Lookup: catalog label (lowercased) → product row (for live catalog items)
  const productByLabel = useMemo(() => {
    const m = new Map<string, ProductRow>();
    for (const p of products) {
      if (p.section === "solution") {
        m.set(norm(p.name), p);
      }
    }
    return m;
  }, [products]);

  // Slug-based lookup so spelling variants (hyphens, extra spaces, & vs and)
  // resolve to the same product row.
  const productBySlug = useMemo(() => {
    const m = new Map<string, ProductRow>();
    for (const p of products) {
      if (p.section === "solution") {
        m.set(slugify(p.name), p);
      }
    }
    return m;
  }, [products]);

  function findProductForCatalog(item: CatalogSolution): ProductRow | undefined {
    return (
      productByLabel.get(norm(item.label)) ||
      productBySlug.get(slugify(item.label)) ||
      (item.legacyName
        ? productByLabel.get(norm(item.legacyName)) ||
          productBySlug.get(slugify(item.legacyName))
        : undefined)
    );
  }

  // A catalog item is "live" (renders as a clickable card, not a coming-soon
  // placeholder) when it has an active DB row AND either the catalog already
  // launched it OR its tacklebox actually contains files. counts[id] includes
  // the always-present global spec, so > 1 means it has real content.
  // (Inactive products are filtered out of `products`, so an admin can hide a
  // tacklebox with the Active switch and it reverts to a placeholder here.)
  function isItemLive(item: CatalogSolution): boolean {
    const product = findProductForCatalog(item);
    if (!product) return false;
    if (!item.comingSoon) return true;
    return (counts[product.id] ?? 0) > 1;
  }

  const nonSolutionProducts = useMemo(
    () => products.filter((p) => p.section !== "solution" && matchesSearch(p, q)),
    [products, q]
  );

  const showSolutions = filter === "all" || filter === "solution";
  const showAnchors = !solutionsOnly && (filter === "all" || filter === "anchor");
  const showInternal = !solutionsOnly && isInternalUser && (filter === "all" || filter === "internal_assets");

  const catalogGroups: Array<{ category: SolutionCategory; items: CatalogSolution[] }> = useMemo(() => {
    return SOLUTION_CATEGORIES.map((category) => ({
      category,
      items: SOLUTION_CATALOG.filter((s) => s.category === category.key && catalogMatchesSearch(s, q)),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  const anchorRows = useMemo(
    () => nonSolutionProducts.filter((p) => p.section === "anchor"),
    [nonSolutionProducts]
  );

  // Group anchors into U-Anchor 2000/3000/5000 series for the collapsible UI.
  const ANCHOR_CATEGORIES = useMemo(
    () => [
      { key: "u-anchor-2000", label: "U-Anchor 2000 Series", prefixes: ["U2", "u2", "2000"] },
      { key: "u-anchor-3000", label: "U-Anchor 3000 Series", prefixes: ["U3", "u3", "3000"] },
      { key: "u-anchor-5000", label: "U-Anchor 5000 Series", prefixes: ["U5", "u5", "5000"] },
    ],
    []
  );

  function classifyAnchor(p: ProductRow): string | null {
    const hay = `${p.name} ${p.sku || ""} ${p.series || ""}`.toLowerCase();
    for (const cat of ANCHOR_CATEGORIES) {
      if (cat.prefixes.some((pref) => hay.includes(pref.toLowerCase()))) {
        return cat.key;
      }
    }
    return null;
  }

  const anchorGroups = useMemo(() => {
    const groups: Record<string, ProductRow[]> = {};
    for (const cat of ANCHOR_CATEGORIES) groups[cat.key] = [];
    const other: ProductRow[] = [];
    for (const p of anchorRows) {
      const key = classifyAnchor(p);
      if (key && groups[key]) groups[key].push(p);
      else other.push(p);
    }
    return { groups, other };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRows, ANCHOR_CATEGORIES]);
  const internalRows = useMemo(
    () => nonSolutionProducts.filter((p) => p.section === "internal_assets"),
    [nonSolutionProducts]
  );

  // When the anchors filter is active we always want to render the
  // category placeholders (so the "U-Anchor 5000 Series — coming soon"
  // category remains visible). Treat the anchors block as "having results"
  // whenever the user explicitly asks for anchors, even if no rows exist.
  const hasAnyResult =
    (showSolutions && catalogGroups.length > 0) ||
    (showAnchors && (anchorRows.length > 0 || (filter === "anchor" && !q.trim()))) ||
    (showInternal && internalRows.length > 0);

  return (
    <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-black">{t("browseTackleBoxes")}</div>
          <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("specsNote")}</div>
        </div>

        <div data-tutorial="assets-search" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            className="h-10 w-full bg-[var(--surface-soft)] px-4 text-sm sm:w-[280px]"
          />
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setNewBoxMsg(null);
                setShowNewBox((v) => !v);
              }}
              className="h-10 shrink-0 rounded-full border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-4 text-[12px] font-semibold text-white transition hover:opacity-90"
            >
              {showNewBox ? "Close" : "+ New tacklebox"}
            </button>
          )}
        </div>
      </div>

      {isAdmin && showNewBox && (
        <div className="mt-4 rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
          <div className="text-sm font-semibold text-black">New tacklebox</div>
          <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
            Creates a product record. Add files inside it afterward, or link a knowledge-bucket folder.
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-black/70">Name</span>
              <input
                value={newBox.name}
                onChange={(e) => setNewBox((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Roof Pipe Securement"
                className="h-10 rounded-[10px] border border-black/10 bg-white px-3 text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-black/70">Section</span>
              <select
                value={newBox.section}
                onChange={(e) => setNewBox((s) => ({ ...s, section: e.target.value as ProductSection }))}
                className="h-10 rounded-[10px] border border-black/10 bg-white px-3 text-sm"
              >
                <option value="solution">Solution</option>
                <option value="anchor">Anchor</option>
                <option value="internal_assets">Internal assets</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-black/70">Series (optional)</span>
              <input
                value={newBox.series}
                onChange={(e) => setNewBox((s) => ({ ...s, series: e.target.value }))}
                placeholder="e.g. Solutions"
                className="h-10 rounded-[10px] border border-black/10 bg-white px-3 text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-black/70">SKU (optional)</span>
              <input
                value={newBox.sku}
                onChange={(e) => setNewBox((s) => ({ ...s, sku: e.target.value }))}
                placeholder="e.g. RPS-0310"
                className="h-10 rounded-[10px] border border-black/10 bg-white px-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={createTacklebox}
              disabled={creatingBox || !newBox.name.trim()}
              className="inline-flex items-center justify-center rounded-[10px] bg-[var(--anchor-green)] px-4 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {creatingBox ? "Creating…" : "Create & open"}
            </button>
            {newBoxMsg && <span className="text-[12px] text-red-600">{newBoxMsg}</span>}
          </div>
        </div>
      )}

      {!solutionsOnly && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [-webkit-overflow-scrolling:touch]">
            <button type="button" onClick={() => setFilter("all")} className={btnClass(filter === "all")}>{t("all")}</button>
            <button type="button" onClick={() => setFilter("solution")} className={btnClass(filter === "solution")}>{t("solutions")}</button>
            <button type="button" onClick={() => setFilter("anchor")} className={btnClass(filter === "anchor")}>{t("anchors")}</button>
            {isInternalUser && (
              <button type="button" onClick={() => setFilter("internal_assets")} className={btnClass(filter === "internal_assets")}>{t("internalAssets")}</button>
            )}
          </div>

          <div className="flex justify-end">
            <span className="inline-flex items-center rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--anchor-deep)]">
              <span className="sm:hidden">{isInternalUser ? t("showingPubInt") : t("showingPub")}</span>
              <span className="hidden sm:inline">{isInternalUser ? t("showingPublicInternal") : t("showingPublic")}</span>
            </span>
          </div>
        </div>
      )}

      <div className="mt-4">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : loading ? (
          <StackingFilesLoader label={t("loading")} />
        ) : !hasAnyResult ? (
          <Alert tone="neutral">{t("noProductsFound")}</Alert>
        ) : (
          <div className="grid gap-6">
            {showSolutions &&
              catalogGroups.map(({ category, items }) => {
                // Auto-expand when searching so matches aren't hidden behind collapsed sections.
                const isCollapsed = q.trim() ? false : collapsed[category.key] ?? true;
                // "Coming soon" badge applies only when nothing in the category
                // is live (launched in the catalog, or content-bearing).
                const activeCount = items.filter((it) => isItemLive(it)).length;
                return (
                  <section key={category.key} className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.key)}
                      className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-black/10 bg-[var(--surface-soft)] px-4 py-3 text-left hover:bg-[var(--surface-soft)]/80"
                      aria-expanded={!isCollapsed}
                    >
                      <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                        {category.label}
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-black/60">
                          {items.length}
                        </span>
                        {activeCount === 0 && (
                          <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-black/50">
                            Coming soon
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-black/40">{isCollapsed ? "▾" : "▴"}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="grid gap-2">
                        {items.map((item) => {
                          // Prefer a direct DB row with the new label; fall back to
                          // the legacy DB row so existing tackle box / docs surface.
                          // Slug-based matching tolerates hyphen / spacing variants
                          // between catalog names and stored DB names.
                          const product = findProductForCatalog(item);
                          // Render as a live card when the catalog launched it OR it
                          // actually contains files — even if still flagged comingSoon.
                          if (product && isItemLive(item)) {
                            return (
                              <SolutionCard
                                key={item.key}
                                product={product}
                                displayName={item.label}
                                openLabel={t("open")}
                                title={t("openTackleBox")}
                                fileCount={counts[product.id]}
                              />
                            );
                          }
                          return (
                            <ComingSoonCard
                              key={item.key}
                              label={item.label}
                              isAdmin={isAdmin}
                              pending={creatingKey === item.key}
                              onAdminOpen={() => adminOpenComingSoon(item)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}

            {showAnchors && (anchorRows.length > 0 || filter === "anchor" || filter === "all") && (
              <section className="grid gap-2">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                  {t("anchors")}
                </h3>
                <div className="grid gap-2">
                  {ANCHOR_CATEGORIES.map((cat) => {
                    const items = anchorGroups.groups[cat.key] || [];
                    // Hide an empty 5000-series only when not actively searching;
                    // when searching, the parent already filters out empties.
                    if (items.length === 0 && q.trim()) return null;
                    const isCollapsed = q.trim() ? false : collapsed[`anchor:${cat.key}`] ?? true;
                    return (
                      <div key={cat.key} className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCategory(`anchor:${cat.key}`)}
                          className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-black/10 bg-[var(--surface-soft)] px-4 py-3 text-left hover:bg-[var(--surface-soft)]/80"
                          aria-expanded={!isCollapsed}
                        >
                          <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                            {cat.label}
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-black/60">
                              {items.length}
                            </span>
                            {items.length === 0 && (
                              <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-black/50">
                                Coming soon
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[11px] text-black/40">{isCollapsed ? "▾" : "▴"}</span>
                        </button>
                        {!isCollapsed && (
                          <div className="grid gap-2">
                            {items.length > 0 ? (
                              items.map((p) => (
                                <SolutionCard
                                  key={p.id}
                                  product={p}
                                  openLabel={t("open")}
                                  title={t("openTackleBox")}
                                  fileCount={counts[p.id]}
                                />
                              ))
                            ) : (
                              <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4 text-[12px] text-[var(--anchor-gray)]">
                                Coming soon — {cat.label} products will appear here.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {anchorGroups.other.length > 0 && (
                    <div className="grid gap-2">
                      {anchorGroups.other.map((p) => (
                        <SolutionCard
                          key={p.id}
                          product={p}
                          openLabel={t("open")}
                          title={t("openTackleBox")}
                          fileCount={counts[p.id]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {showInternal && internalRows.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                  {t("internalAssets")}
                </h3>
                <div className="grid gap-2">
                  {internalRows.map((p) => (
                    <SolutionCard
                      key={p.id}
                      product={p}
                      openLabel={t("open")}
                      title={t("openTackleBox")}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function SolutionCard({
  product,
  openLabel,
  title,
  displayName,
  fileCount,
}: {
  product: ProductRow;
  openLabel: string;
  title: string;
  displayName?: string;
  fileCount?: number;
}) {
  return (
    <Link
      href={productHref(product)}
      title={title}
      className="block w-full overflow-hidden rounded-[12px] border border-black/10 bg-white px-4 py-2.5 transition duration-200 hover:bg-[var(--surface-soft)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-black break-words">{displayName || product.name}</div>
          <div className="mt-0.5 text-[12px] text-[var(--anchor-gray)] truncate">
            {product.series ? `Series: ${product.series}` : ""}
            {product.section ? ` • ${product.section}` : ""}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {typeof fileCount === "number" && (
            <span
              className="inline-flex items-center rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-black/60 whitespace-nowrap"
              title={`${fileCount} file${fileCount === 1 ? "" : "s"} in this tackle box`}
            >
              {fileCount} {fileCount === 1 ? "file" : "files"}
            </span>
          )}
          <div className="inline-flex items-center justify-center rounded-[10px] bg-[var(--anchor-green)] px-3 py-1.5 text-[12px] font-semibold text-white whitespace-nowrap">
            {openLabel}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ComingSoonCard({
  label,
  isAdmin,
  pending,
  onAdminOpen,
}: {
  label: string;
  isAdmin?: boolean;
  pending?: boolean;
  onAdminOpen?: () => void;
}) {
  if (isAdmin && onAdminOpen) {
    return (
      <button
        type="button"
        onClick={onAdminOpen}
        disabled={pending}
        className="block w-full overflow-hidden rounded-[12px] border border-dashed border-[var(--anchor-green)]/60 bg-[var(--surface-soft)] px-4 py-2.5 text-left transition duration-200 hover:bg-white disabled:opacity-60"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-black break-words">{label}</div>
            <div className="mt-0.5 text-[12px] text-[var(--anchor-gray)] truncate">
              Coming soon — click to add content
            </div>
          </div>

          <div className="shrink-0">
            <div className="inline-flex items-center justify-center rounded-[10px] bg-[var(--anchor-green)] px-3 py-1.5 text-[12px] font-semibold text-white whitespace-nowrap">
              {pending ? "Opening…" : "Add content"}
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      aria-disabled="true"
      className="block w-full overflow-hidden rounded-[12px] border border-black/10 bg-[var(--surface-soft)] px-4 py-2.5 opacity-60 cursor-not-allowed select-none"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-black/60 break-words">{label}</div>
          <div className="mt-0.5 text-[12px] text-[var(--anchor-gray)] truncate">
            Solution materials in development
          </div>
        </div>

        <div className="shrink-0">
          <div className="inline-flex items-center justify-center rounded-[10px] bg-black/10 px-3 py-1.5 text-[12px] font-semibold text-black/50 whitespace-nowrap">
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
