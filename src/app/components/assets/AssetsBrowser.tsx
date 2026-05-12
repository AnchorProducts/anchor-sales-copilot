"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input } from "@/app/components/ui/Field";
import { useTranslation } from "@/lib/i18n/useTranslation";
import {
  SOLUTION_CATALOG,
  SOLUTION_CATEGORIES,
  type CatalogSolution,
  type SolutionCategory,
} from "@/lib/solutions/solutionCatalog";

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

function ensureTrailingSlash(prefix: string) {
  const p = String(prefix || "").trim();
  if (!p) return "";
  return p.endsWith("/") ? p : `${p}/`;
}

function storagePrefixForProduct(p: ProductRow) {
  const slug = slugify(p.name);
  if (p.section === "solution") return ensureTrailingSlash(`solutions/${slug}`);
  if (p.section === "anchor") return ensureTrailingSlash(`anchor/${slug}`);
  return ensureTrailingSlash(`internal/${slug}`);
}

function specPrefixForSection(section: ProductSection) {
  if (section === "solution") return ensureTrailingSlash("spec/solutions");
  if (section === "anchor") return ensureTrailingSlash("spec/anchor");
  return ensureTrailingSlash("spec/internal");
}

function parseCounts(payload: any): { public: number; internal: number } {
  const p = payload ?? {};
  const pub =
    Number(
      p.public ??
        p.publicCount ??
        p.public_count ??
        p.count_public ??
        p.counts?.public ??
        p.counts?.publicCount ??
        0
    ) || 0;

  const internal =
    Number(
      p.internal ??
        p.internalCount ??
        p.internal_count ??
        p.count_internal ??
        p.counts?.internal ??
        p.counts?.internalCount ??
        0
    ) || 0;

  const total = Number(p.total ?? p.count ?? p.totalCount ?? 0) || 0;

  if (pub === 0 && internal === 0 && total > 0) {
    return { public: total, internal: 0 };
  }

  return { public: pub, internal };
}

async function fetchKnowledgeCounts(prefix: string) {
  const pref = ensureTrailingSlash(prefix);

  const res = await fetch(`/api/knowledge-counts?prefix=${encodeURIComponent(pref)}`, {
    method: "GET",
    credentials: "include",
    headers: { "cache-control": "no-store" },
  });

  if (!res.ok) {
    return { public: 0, internal: 0 };
  }

  const json = await res.json().catch(() => ({}));
  return parseCounts(json);
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

export default function AssetsBrowser() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [counts, setCounts] = useState<Record<string, { public: number; internal: number }>>({});

  const [q, setQ] = useState("");
  const [activeOnly] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [isInternalUser, setIsInternalUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

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
      const { data, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: item.label,
          section: "solution",
          active: true,
        })
        .select("id")
        .single();

      if (insertErr || !data?.id) {
        setError(insertErr?.message || "Could not create product row.");
        setCreatingKey(null);
        return;
      }
      router.push(`/assets/${encodeURIComponent(data.id)}`);
    } catch (e: any) {
      setError(e?.message || "Could not create product row.");
      setCreatingKey(null);
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

        const sectionsInList = Array.from(new Set(list.map((p) => p.section)));

        const specBySection: Record<string, { public: number; internal: number }> = {};
        await Promise.all(
          sectionsInList.map(async (sec) => {
            specBySection[sec] = await fetchKnowledgeCounts(specPrefixForSection(sec));
          })
        );

        const perProduct = await mapWithLimit(
          list,
          6,
          async (p): Promise<[string, { public: number; internal: number }]> => {
            const folderCounts = await fetchKnowledgeCounts(storagePrefixForProduct(p));
            const specCounts = specBySection[p.section] || { public: 0, internal: 0 };

            return [
              p.id,
              {
                public: folderCounts.public + specCounts.public,
                internal: folderCounts.internal + specCounts.internal,
              },
            ];
          }
        );

        if (!alive) return;

        const map: Record<string, { public: number; internal: number }> = {};
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

  const nonSolutionProducts = useMemo(
    () => products.filter((p) => p.section !== "solution" && matchesSearch(p, q)),
    [products, q]
  );

  const showSolutions = filter === "all" || filter === "solution";
  const showAnchors = filter === "all" || filter === "anchor";
  const showInternal = isInternalUser && (filter === "all" || filter === "internal_assets");

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
  const internalRows = useMemo(
    () => nonSolutionProducts.filter((p) => p.section === "internal_assets"),
    [nonSolutionProducts]
  );

  const hasAnyResult =
    (showSolutions && catalogGroups.length > 0) ||
    (showAnchors && anchorRows.length > 0) ||
    (showInternal && internalRows.length > 0);

  return (
    <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-black">{t("browseTackleBoxes")}</div>
          <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("specsNote")}</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            className="h-10 w-full bg-[var(--surface-soft)] px-4 text-sm sm:w-[280px]"
          />
        </div>
      </div>

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

      <div className="mt-4">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : loading ? (
          <Alert tone="neutral">{t("loading")}</Alert>
        ) : !hasAnyResult ? (
          <Alert tone="neutral">{t("noProductsFound")}</Alert>
        ) : (
          <div className="grid gap-6">
            {showSolutions &&
              catalogGroups.map(({ category, items }) => {
                // Auto-expand when searching so matches aren't hidden behind collapsed sections.
                const isCollapsed = q.trim() ? false : collapsed[category.key] ?? true;
                // "Coming soon" badge applies only when every item in the
                // category is flagged comingSoon — independent of DB state.
                const activeCount = items.filter((it) => !it.comingSoon).length;
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
                          if (item.comingSoon) {
                            return (
                              <ComingSoonCard
                                key={item.key}
                                label={item.label}
                                isAdmin={isAdmin}
                                pending={creatingKey === item.key}
                                onAdminOpen={() => adminOpenComingSoon(item)}
                              />
                            );
                          }
                          // Prefer a direct DB row with the new label; fall back to
                          // the legacy DB row so existing tackle box / docs surface
                          // until the new row is seeded. Slug-based matching
                          // tolerates hyphen / spacing variants between catalog
                          // names and stored DB names.
                          const product = findProductForCatalog(item);
                          if (!product) {
                            return (
                              <ComingSoonCard
                                key={item.key}
                                label={item.label}
                                isAdmin={isAdmin}
                                pending={creatingKey === item.key}
                                onAdminOpen={() => adminOpenComingSoon(item)}
                              />
                            );
                          }
                          return (
                            <SolutionCard
                              key={item.key}
                              product={product}
                              displayName={item.label}
                              openLabel={t("open")}
                              title={t("openTackleBox")}
                            />
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}

            {showAnchors && anchorRows.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                  {t("anchors")}
                </h3>
                <div className="grid gap-2">
                  {anchorRows.map((p) => (
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
}: {
  product: ProductRow;
  openLabel: string;
  title: string;
  displayName?: string;
}) {
  return (
    <Link
      href={productHref(product)}
      title={title}
      className="block w-full overflow-hidden rounded-[14px] border border-black/10 bg-white p-4 transition duration-200 hover:bg-[var(--surface-soft)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-black break-words">{displayName || product.name}</div>
          <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
            {product.series ? ` Series: ${product.series}` : ""}
            {product.section ? ` • ${product.section}` : ""}
          </div>
        </div>

        <div className="w-full sm:w-auto sm:shrink-0">
          <div className="inline-flex w-full items-center justify-center rounded-[12px] bg-[var(--anchor-green)] px-3 py-2 text-[12px] font-semibold text-white whitespace-nowrap sm:w-auto">
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
        className="block w-full overflow-hidden rounded-[14px] border border-dashed border-[var(--anchor-green)]/60 bg-[var(--surface-soft)] p-4 text-left transition duration-200 hover:bg-white disabled:opacity-60"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-black break-words">{label}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
              Coming soon — click to add content
            </div>
          </div>

          <div className="w-full sm:w-auto sm:shrink-0">
            <div className="inline-flex w-full items-center justify-center rounded-[12px] bg-[var(--anchor-green)] px-3 py-2 text-[12px] font-semibold text-white whitespace-nowrap sm:w-auto">
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
      className="block w-full overflow-hidden rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4 opacity-60 cursor-not-allowed select-none"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-black/60 break-words">{label}</div>
          <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
            Solution materials in development
          </div>
        </div>

        <div className="w-full sm:w-auto sm:shrink-0">
          <div className="inline-flex w-full items-center justify-center rounded-[12px] bg-black/10 px-3 py-2 text-[12px] font-semibold text-black/50 whitespace-nowrap sm:w-auto">
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
