"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input } from "@/app/components/ui/Field";

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

/**
 * ✅ Keep filter buttons EXACTLY like before (do not compact them for mobile)
 */
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

  // folders in bucket: solutions/<slug>/..., anchor/<slug>/..., internal/<slug>/...
  if (p.section === "solution") return ensureTrailingSlash(`solutions/${slug}`);
  if (p.section === "anchor") return ensureTrailingSlash(`anchor/${slug}`);
  return ensureTrailingSlash(`internal/${slug}`);
}

function specPrefixForSection(section: ProductSection) {
  // folders in bucket: spec/solutions/, spec/anchor/, spec/internal/
  if (section === "solution") return ensureTrailingSlash("spec/solutions");
  if (section === "anchor") return ensureTrailingSlash("spec/anchor");
  return ensureTrailingSlash("spec/internal");
}

/**
 * Parse /api/knowledge-counts response safely (supports a few shapes).
 */
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

/**
 * Small concurrency limiter so we don't spam the API with 100+ calls at once.
 */
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [counts, setCounts] = useState<Record<string, { public: number; internal: number }>>({});

  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const [isInternalUser, setIsInternalUser] = useState(false);

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
          setLoading(false);
          return;
        }

        // Determine internal via profiles.role
        let internal = false;
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

          internal = isInternalRole((prof as ProfileRow | null)?.role || "");
        } catch {
          internal = false;
        }

        if (!alive) return;
        setIsInternalUser(internal);

        // If user is NOT internal and they land on internal_assets, bump to All
        if (!internal && filter === "internal_assets") {
          setFilter("all");
        }

        // PRODUCTS LIST
        const prodQuery = supabase
          .from("products")
          .select("id,name,sku,series,section,internal_kind,active")
          .order("name", { ascending: true });

        if (activeOnly) prodQuery.eq("active", true);

        if (filter !== "all") {
          prodQuery.eq("section", filter);
        }

        // External users should never see internal_assets products (extra safety)
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

        /**
         * ✅ COUNTS FROM STORAGE (same idea as ProductTackleBox)
         * - folder counts per product
         * - PLUS spec counts per section (spec everywhere)
         */
        const sectionsInList = Array.from(new Set(list.map((p) => p.section)));

        // spec counts once per section
        const specBySection: Record<string, { public: number; internal: number }> = {};
        await Promise.all(
          sectionsInList.map(async (sec) => {
            specBySection[sec] = await fetchKnowledgeCounts(specPrefixForSection(sec));
          })
        );

        // per-product folder counts (limit concurrency)
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
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase, activeOnly, filter]);

  const filtered = useMemo(() => products.filter((p) => matchesSearch(p, q)), [products, q]);

  function countFor(id: string) {
    const c = counts[id] || { public: 0, internal: 0 };
    return {
      publicCount: c.public,
      internalCount: isInternalUser ? c.internal : 0,
    };
  }

  return (
    <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-black">Browse tackle boxes</div>
          <div className="mt-1 text-sm text-[var(--anchor-gray)]">
            Specs live inside each product tackle box (not a separate category).
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-10 w-full bg-[var(--surface-soft)] px-4 text-sm sm:w-[280px]"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [-webkit-overflow-scrolling:touch]">
          <button type="button" onClick={() => setFilter("all")} className={btnClass(filter === "all")}>
            All
          </button>
          <button type="button" onClick={() => setFilter("solution")} className={btnClass(filter === "solution")}>
            Solutions
          </button>
          <button type="button" onClick={() => setFilter("anchor")} className={btnClass(filter === "anchor")}>
            Anchors
          </button>

          <button
            type="button"
            onClick={() => isInternalUser && setFilter("internal_assets")}
            disabled={!isInternalUser}
            className={[
              "rounded-full border px-4 py-2 text-[12px] font-semibold transition whitespace-nowrap",
              !isInternalUser
                ? "border-black/10 bg-white text-black/30 cursor-not-allowed"
                : filter === "internal_assets"
                ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]",
            ].join(" ")}
          >
            Internal assets
          </button>
        </div>

        <div className="flex justify-end">
          <span className="inline-flex items-center rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--anchor-deep)]">
            <span className="sm:hidden">Showing: Pub{isInternalUser ? " + Int" : ""}</span>
            <span className="hidden sm:inline">Showing: Public{isInternalUser ? " + Internal" : ""}</span>
          </span>
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : loading ? (
          <Alert tone="neutral">Loading…</Alert>
        ) : filtered.length === 0 ? (
          <Alert tone="neutral">No products found.</Alert>
        ) : (
          <div className="grid gap-3">
            {filtered.map((p) => {
              const c = countFor(p.id);

              return (
                <Link
                  key={p.id}
                  href={productHref(p)}
                  title="Open tackle box"
                  className="block w-full overflow-hidden rounded-[14px] border border-black/10 bg-white p-4 transition duration-200 hover:bg-[var(--surface-soft)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-black truncate">{p.name}</div>

                      <div className="mt-1 truncate text-[12px] text-[var(--anchor-gray)]">
                        
                        {p.series ? ` Series: ${p.series}` : ""}
                        {p.section ? ` • ${p.section}` : ""}
                      </div>

                      
                    </div>

                    <div className="w-full sm:w-auto sm:shrink-0">
                      <div className="inline-flex w-full items-center justify-center rounded-[12px] bg-[var(--anchor-green)] px-3 py-2 text-[12px] font-semibold text-white whitespace-nowrap sm:w-auto">
                        Open →
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
