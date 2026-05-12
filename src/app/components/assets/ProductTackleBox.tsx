// src/components/assets/ProductTackleBox.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { SOLUTION_CATALOG } from "@/lib/solutions/solutionCatalog";

function catalogDisplayName(rawName: string | undefined | null): string {
  if (!rawName) return "";
  const n = String(rawName).toLowerCase().trim();
  const slug = n.replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Prefer a catalog item whose label or legacyName matches this DB row,
  // so the tackle box title shows the new CEO-approved name.
  for (const item of SOLUTION_CATALOG) {
    if (item.label.toLowerCase().trim() === n) return item.label;
    if (item.legacyName && item.legacyName.toLowerCase().trim() === n) return item.label;
    const labelSlug = item.label.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (labelSlug === slug) return item.label;
    if (item.legacyName) {
      const legacySlug = item.legacyName.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (legacySlug === slug) return item.label;
    }
  }
  return rawName;
}

const GLOBAL_SPEC_PATH = "spec/anchor-products-spec-v1.docx";

/* ---------------------------------------------
   Types
--------------------------------------------- */

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  series: string | null;
  section: string | null; // solution | anchor | internal_assets
  internal_kind: "tacklebox" | "docs_list" | "contacts_list" | null;
  active: boolean;
};

type AssetRow = {
  id: string;
  product_id: string;
  title: string | null;
  type: string | null; // document | image | video | link
  category_key: string | null;
  path: string;
  visibility: "public" | "internal";
  created_at: string;
};

type ProfileRow = { id: string; role: string };

/**
 * Tabs are auto-generated from what's actually in storage.
 * Tabs only render if they have >= 1 visible item (public users won't see internal-only tabs).
 */
type TabKey =
  | "all"
  | "spec"
  | "data"
  | "install"
  | "sales"
  | "intake"
  | "test"
  | "pricebook"
  | "approval"
  | "presentation"
  | "pics"
  | "case"
  | "other";

// TAB_LABELS is computed inside the component using t() so it translates

const TAB_ORDER: TabKey[] = [
  "all",
  "spec",
  "data",
  "install",
  "sales",
  "intake",
  "test",
  "pricebook",
  "approval",
  "presentation",
  "pics",
  "case",
  "other",
];

// Tabs that should only appear for internal users
const INTERNAL_ONLY_TABS = new Set<TabKey>(["test", "pricebook"]);

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif"]);
const PDF_EXTS = new Set(["pdf"]);

/* ---------------------------------------------
   Helpers
--------------------------------------------- */

function normalizePrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

/**
 * IMPORTANT for iOS/app-like behavior:
 * - download=0 should open inline (Quick Look / in-app viewer) if your /api/doc-open supports it
 * - download=1 forces attachment download
 */
function docOpenHref(path: string, download: boolean) {
  const p = String(path || "").trim();
  return `/api/doc-open?path=${encodeURIComponent(p)}${download ? "&download=1" : "&download=0"}`;
}
// ✅ NEW: mobile-safe doc-open (adds token as query param when available)
async function docOpenHrefWithToken(
  supabase: ReturnType<typeof supabaseBrowser>,
  path: string,
  download: boolean
) {
  const p = String(path || "").trim();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  const t = token ? `&token=${encodeURIComponent(token)}` : "";
  return `/api/doc-open?path=${encodeURIComponent(p)}${download ? "&download=1" : "&download=0"}${t}`;
}

// ✅ NEW: download without leaving the current page (prevents the black screen)
function triggerDownload(href: string, filename?: string) {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  // If same-origin, download attr helps. If cross-origin, browser may ignore it (still okay).
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function basename(path: string) {
  const clean = String(path || "").split("?")[0];
  return clean.split("/").pop() || clean;
}

function extOf(pathOrName: string) {
  const n = basename(pathOrName).toLowerCase();
  const m = n.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function titleFromPath(path: string) {
  const base = basename(path);
  return base
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function slugifyName(name: string) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Defensive
function isFolderLike(path: string) {
  const p = String(path || "").trim();
  if (!p) return true;
  if (p.endsWith("/")) return true;
  const b = basename(p);
  return !b.includes(".");
}

/**
 * Make internal-only content disappear from public users everywhere (including "All").
 * We mark:
 * - anything under /internal/
 * - anything under /pricebook/ or /test/ or /test-reports/
 * as internal.
 */
function visibilityFromPath(path: string): "public" | "internal" {
  const p = String(path || "").toLowerCase();

  if (p.includes("/internal/") || p.startsWith("internal/")) return "internal";
  if (p.includes("/pricebook/") || p.includes("/test/") || p.includes("/test-reports/")) return "internal";

  return "public";
}

function typeFromPath(path: string) {
  const ext = extOf(path);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ext === "pdf") return "document";
  return "document";
}

/* ---------------------------------------------
   ✅ Routing rules (you already tuned these for solutions)
   NOTE: for anchors, you’ll likely use SPECIAL_PREFIXES_BY_NAME (best)
   or SERIES_ROOTS_BY_SERIES mapping that points to anchor/... roots.
--------------------------------------------- */

const SPECIAL_PREFIXES_BY_NAME: Record<string, string[]> = {
  // Solutions (examples)
  "2-Pipe Snow Fence": ["solutions/snow-retention/2-pipe-snow-fence"],
  "Unitized Snow Fence": ["2pipe/snow-fence", "solutions/snow-retention/unitized-snow-fence"],
  "Existing Mechanical Tie-Down": ["solutions/hvac"],
  "Roof-Mounted Elevated Stack Securement": ["solutions/elevated-stack/roof-stack"],
  "Wall-Mounted Elevated Stack Securement": ["solutions/elevated-stack/wall-stack"],
  "Roof Mounted Box": ["solutions/roof-box"],
  "Attached Pipe Frame": ["pipe-frame/attached", "solutions/pipe-frame/attached", "attached"],
  "Existing Pipe Frame": ["solutions/pipe-frame/exisiting"],
  "Roof Mounted Guardrail": ["solutions/roof-guardrail"],
  "Wall Mounted Guardrail": ["solutions/wall-guardrail"],
  "Wall Mounted Box": ["solutions/wall-box"],
  "Weather Stations": ["solutions/weather-station"],

  // ✅ Anchors (add these if your Product names match exactly)
  "U2000 KEE": ["anchor/u-anchors/u2000/kee"],
  "U2000 PVC": ["anchor/u-anchors/u2000/pvc"],
  "U2000 TPO": ["anchor/u-anchors/u2000/tpo"],
  "U2200 Plate": ["anchor/u-anchors/u2200/plate"],
  "U2400 EDPM": ["anchor/u-anchors/u2400/epdm"],
  "U2400 KEE": ["anchor/u-anchors/u2400/kee"],
  "U2400 PVC": ["anchor/u-anchors/u2400/pvc"],
  "U2400 TPO": ["anchor/u-anchors/u2400/tpo"],
  "U2600 APP": ["anchor/u-anchors/u2600/app"],
  "U2600 SBS": ["anchor/u-anchors/u2600/sbs"],
  "U2600 SBS Torch": ["anchor/u-anchors/u2600/sbs-torch"],
  "U2800 Coatings": ["anchor/u-anchors/u2800/coatings"],
  "U3200 Plate": ["anchor/u-anchors/u3200/plate"],
  "U3400 EDPM": ["anchor/u-anchors/u3400/epdm"],
  "U3400 KEE": ["anchor/u-anchors/u3400/kee"],
  "U3400 PVC": ["anchor/u-anchors/u3400/pvc"],
  "U3400 TPO": ["anchor/u-anchors/u3400/tpo"],
  "U3600 APP": ["anchor/u-anchors/u3600/app"],
  "U3600 SBS": ["anchor/u-anchors/u3600/sbs"],
  "U3600 SBS Torch": ["anchor/u-anchors/u3600/sbs-torch"],
  "U3800 Coatings": ["anchor/u-anchors/u3800/coatings"],
};

const SERIES_ROOTS_BY_SERIES: Record<string, string[]> = {
  // Solutions
  HVAC: ["solutions/hvac"],
  "HVAC Solutions": ["solutions/hvac"],
  "Snow Retention": ["2pipe", "solutions/snow-retention", "solutions/2pipe"],
  "Snow Retention Solutions": ["2pipe", "solutions/snow-retention", "solutions/2pipe"],
  "2 Pipe": ["2pipe", "solutions/snow-retention", "solutions/2pipe"],

  // Anchors (optional series mapping if you use series = "U-Anchors" etc.)
  "U-Anchors": ["anchor/u-anchors"],
  "U Anchors": ["anchor/u-anchors"],
  Anchors: ["anchor"],
};

/* ---------------------------------------------
   Tabs (auto-detect from filenames/folders)
--------------------------------------------- */

function tabFromPath(path: string): TabKey {
  const p = String(path || "").toLowerCase();
  const file = basename(p);

  // Global spec
  if (file === basename(GLOBAL_SPEC_PATH).toLowerCase()) return "spec";

  // Spec
  if (p.includes("/spec/") || file.includes("spec")) return "spec";

  // Data sheet
  if (
    file === "data-sheet.pdf" ||
    file === "product-data-sheet.pdf" ||
    file.includes("data-sheet") ||
    file.includes("datasheet")
  )
    return "data";

  // Sales sheet
  if (file === "sales-sheet.pdf" || file.includes("sales-sheet") || file.includes("salessheet")) return "sales";

  // Install
  if (
    file === "install-manual.pdf" ||
    file === "install-sheet.pdf" ||
    file.includes("install") ||
    file.includes("installation")
  )
    return "install";

  // Intake forms
  if (p.includes("/intake/") || file.includes("intake")) return "intake";

  // Test reports (internal)
  if (
    p.includes("/test/") ||
    p.includes("/test-reports/") ||
    file.includes("test-report") ||
    file.includes("test_report") ||
    file.includes("uplift") ||
    file.includes("astm") ||
    file.includes("fm-")
  )
    return "test";

  // Pricebook (internal)
  if (p.includes("/pricebook/") || file.includes("pricebook") || file.includes("pricing") || file.includes("price-book"))
    return "pricebook";

  // Manufacturer approval letters
  if (p.includes("/approval/") || p.includes("/approvals/") || file.includes("approval") || file.includes("letter"))
    return "approval";

  // Presentation
  if (file.endsWith(".ppt") || file.endsWith(".pptx") || p.includes("/presentation/") || file.includes("presentation"))
    return "presentation";

  // Case studies
  if (p.includes("/case-studies/") || file.includes("case-study") || file.includes("case_study")) return "case";

  // Pictures
  const ext = extOf(file);
  if (IMAGE_EXTS.has(ext)) return "pics";

  return "other";
}

/**
 * Optional badge (still useful for pipe-frame split / or any "attached/existing" subfolders)
 */
function groupBadgeFromPath(path: string): string | null {
  const p = String(path || "").toLowerCase();
  if (p.includes("/attached/")) return "Attached";
  if (p.includes("/existing/")) return "Existing";
  return null;
}

/* ---------------------------------------------
   API fetch
--------------------------------------------- */

async function fetchKnowledgePaths(supabase: ReturnType<typeof supabaseBrowser>, prefix: string) {
  const cleanPrefix = normalizePrefix(prefix);

  // ✅ mobile-safe: attach Bearer token
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";

  const res = await fetch(`/api/knowledge-list?prefix=${encodeURIComponent(cleanPrefix)}`, {
    method: "GET",
    credentials: "include", // keep cookies for desktop
    cache: "no-store",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `knowledge-list failed: ${res.status}`);

  const paths = (json?.paths as string[]) || [];
  return paths.filter((p) => !isFolderLike(p));
}


/* ---------------------------------------------
   Prefix probing
--------------------------------------------- */

function prefixCandidatesForProduct(p: ProductRow): string[] {
  const out: string[] = [];
  const push = (x: string) => {
    const clean = normalizePrefix(x);
    if (clean) out.push(clean);
  };

  // 1) Exact overrides (best for anchors)
  const specials = SPECIAL_PREFIXES_BY_NAME[p.name];
  if (specials?.length) return Array.from(new Set(specials.map(normalizePrefix)));

  const slug = slugifyName(p.name);
  const seriesKey = String(p.series || "").trim();
  const section = String(p.section || "").toLowerCase().trim();

  // 2) Series roots
  const roots = SERIES_ROOTS_BY_SERIES[seriesKey] || [];
  for (const root of roots) {
    // typical: root/<slug>/*
    push(`${root}/${slug}`);
    push(`${root}/${slug}/${slug}`);
  }

  // 3) Generic layouts
  if (section === "solution" || section === "solutions") {
    push(`solutions/${slug}`);
    push(`solutions/${slug}/${slug}`);
  }

  if (section === "anchor" || section === "anchors") {
    // NOTE: your bucket uses "anchor/..." not "anchors/..."
    push(`anchor/${slug}`);
    push(`anchor/${slug}/${slug}`);
  }

  if (section === "internal" || section === "internal_assets") {
    push(`internal/${slug}`);
    push(`internal/${slug}/${slug}`);
  }

  // 4) Extra fallbacks
  push(`${slug}`);
  push(`${slug}/${slug}`);

  return Array.from(new Set(out));
}

/* ---------------------------------------------
   Component
--------------------------------------------- */

export default function ProductTackleBox({ productId }: { productId: string }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const { t } = useTranslation();

  const TAB_LABELS: Record<TabKey, string> = {
    all: t("tabAll"), spec: t("tabSpec"), data: t("tabData"),
    install: t("tabInstall"), sales: t("tabSales"), intake: t("tabIntake"),
    test: t("tabTest"), pricebook: t("tabPricebook"), approval: t("tabApproval"),
    presentation: t("tabPresentation"), pics: t("tabPics"), case: t("tabCase"),
    other: t("tabOther"),
  };

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ProductRow | null>(null);

  const [dbAssets, setDbAssets] = useState<AssetRow[]>([]);
  const [storageAssets, setStorageAssets] = useState<AssetRow[]>([]);
  const [storagePrefix, setStoragePrefix] = useState<string>("");

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [error, setError] = useState<string | null>(null);

  const [isInternalUser, setIsInternalUser] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [triedPrefixes, setTriedPrefixes] = useState<string[]>([]);
  const [accessToken, setAccessToken] = useState("");

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category_key: "data_sheet",
    type: "document",
    path: "",
    visibility: "public" as "public" | "internal",
  });
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUploadMsg, setImageUploadMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setTriedPrefixes([]);

    try {
      // Grab session token for mobile-safe image URLs
      const { data: sessionData } = await supabase.auth.getSession();
      setAccessToken(sessionData?.session?.access_token || "");

      // Auth / role
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;

      if (user) {
        try {
          const { data: prof } = await supabase.from("profiles").select("id,role").eq("id", user.id).maybeSingle();
          const role = (prof as ProfileRow | null)?.role || "";
          setIsInternalUser(role === "admin" || role === "anchor_rep");
          setIsAdmin(role === "admin");
        } catch {
          setIsInternalUser(false);
          setIsAdmin(false);
        }
      } else {
        setIsInternalUser(false);
        setIsAdmin(false);
      }

      // Product
      const { data: p, error: pErr } = await supabase
        .from("products")
        .select("id,name,sku,series,section,internal_kind,active")
        .eq("id", productId)
        .maybeSingle();

      if (pErr) {
        setError(pErr.message);
        setLoading(false);
        return;
      }
      if (!p) {
        setError("Product not found.");
        setLoading(false);
        return;
      }

      // Internal assets redirect
      if (p.section === "internal_assets") {
        const kind = (p as ProductRow).internal_kind;
        if (kind === "contacts_list") router.replace(`/internal-assets/contacts/${encodeURIComponent(p.id)}`);
        else router.replace(`/internal-assets/docs/${encodeURIComponent(p.id)}`);
        setLoading(false);
        return;
      }

      // DB assets
      const { data: a, error: aErr } = await supabase
        .from("assets")
        .select("id,product_id,title,type,category_key,path,visibility,created_at")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (aErr) {
        setError(aErr.message);
        setLoading(false);
        return;
      }

      setProduct(p as ProductRow);
      setDbAssets((a as AssetRow[]) ?? []);

      // Probe storage prefixes
      const candidates = prefixCandidatesForProduct(p as ProductRow);
      setTriedPrefixes(candidates.map((x) => `${normalizePrefix(x)}/`));

      let pickedPrefix = candidates[0] || "";
      let paths: string[] = [];

      for (const candidate of candidates) {
        try {
          const got = await fetchKnowledgePaths(supabase, candidate);
          if (got.length > 0) {
            pickedPrefix = candidate;
            paths = got;
            break;
          }
        } catch (e) {
  console.warn("knowledge-list failed for prefix:", candidate, e);
}
      }

      setStoragePrefix(normalizePrefix(pickedPrefix));

      // Build storage-derived assets
      const derived: AssetRow[] = paths.map((path) => ({
        id: `storage:${path}`,
        product_id: (p as ProductRow).id,
        title: titleFromPath(path),
        type: typeFromPath(path),
        category_key: tabFromPath(path), // informational only
        path,
        visibility: visibilityFromPath(path),
        created_at: new Date().toISOString(),
      }));

      // Always include global spec
      derived.unshift({
        id: `storage:${GLOBAL_SPEC_PATH}`,
        product_id: (p as ProductRow).id,
        title: "Anchor Products Spec (v1)",
        type: "document",
        category_key: "spec",
        path: GLOBAL_SPEC_PATH,
        visibility: "public",
        created_at: new Date().toISOString(),
      });

      // De-dupe by path
      const seen = new Set<string>();
      const deduped = derived.filter((x) => {
        const path = String(x.path || "").trim();
        if (!path) return false;
        if (seen.has(path)) return false;
        seen.add(path);
        return true;
      });

      setStorageAssets(deduped);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Failed to load tackle box.");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Storage first, then DB extras
  const assets = useMemo(() => {
    const byPath = new Map<string, AssetRow>();
    for (const s of storageAssets) byPath.set(s.path, s);
    for (const d of dbAssets) if (!byPath.has(d.path)) byPath.set(d.path, d);
    return Array.from(byPath.values());
  }, [storageAssets, dbAssets]);

  // Public users should not see internal assets at all
  const visibleAssets = useMemo(() => {
    return isInternalUser ? assets : assets.filter((a) => a.visibility !== "internal");
  }, [assets, isInternalUser]);

  // Counts for header chip
  const counts = useMemo(() => {
    const pub = visibleAssets.filter((a) => a.visibility === "public").length;
    const internal = isInternalUser ? visibleAssets.filter((a) => a.visibility === "internal").length : 0;
    return { pub, internal };
  }, [visibleAssets, isInternalUser]);

  // Auto-tab generation (only render tabs that have items)
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      all: visibleAssets.length,
      spec: 0,
      data: 0,
      install: 0,
      sales: 0,
      intake: 0,
      test: 0,
      pricebook: 0,
      approval: 0,
      presentation: 0,
      pics: 0,
      case: 0,
      other: 0,
    };

    for (const a of visibleAssets) {
      const k = tabFromPath(a.path);
      counts[k] = (counts[k] || 0) + 1;
    }

    // if not internal, force-hide internal-only tabs
    if (!isInternalUser) {
      for (const k of INTERNAL_ONLY_TABS) counts[k] = 0;
    }

    return counts;
  }, [visibleAssets, isInternalUser]);

  const availableTabs = useMemo(() => {
    return TAB_ORDER.filter((k) => k === "all" || tabCounts[k] > 0);
  }, [tabCounts]);

  // Keep activeTab valid if its tab disappears (e.g. switch user role)
  useEffect(() => {
    if (!availableTabs.includes(activeTab)) setActiveTab("all");
  }, [availableTabs, activeTab]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return visibleAssets;
    return visibleAssets.filter((a) => tabFromPath(a.path) === activeTab);
  }, [visibleAssets, activeTab]);

  function isPdf(path: string) {
    return PDF_EXTS.has(extOf(path));
  }

  function imgSrc(path: string) {
    const base = docOpenHref(path, false);
    return accessToken ? `${base}&token=${encodeURIComponent(accessToken)}` : base;
  }

  // "Open" should be inline (good for iOS Quick Look / in-app viewer)
  function openInline(path: string) {
    window.location.href = docOpenHref(path, false);
  }

  function forceDownload(path: string) {
    window.location.href = docOpenHref(path, true);
  }

  async function shareAsset(path: string) {
    // Share a link that works on iOS. This endpoint should redirect to a signed URL.
    const url = new URL(docOpenHref(path, false), window.location.origin).toString();
    const title = titleFromPath(path);

    try {
      // Web Share API (iOS Safari supports this)
      if (navigator.share) {
        await navigator.share({ title, text: title, url });
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to copy
    }

    try {
      await navigator.clipboard.writeText(url);
      setFormMsg("Link copied.");
      setTimeout(() => setFormMsg(null), 1500);
    } catch {
      setFormMsg("Couldn’t share or copy link.");
      setTimeout(() => setFormMsg(null), 1500);
    }
  }

  async function uploadImages() {
    if (!imageFiles.length || !product) return;
    setUploadingImages(true);
    setImageUploadMsg(null);

    const prefix = storagePrefix || prefixCandidatesForProduct(product)[0] || `solutions/${slugifyName(product.name)}`;

    const fd = new FormData();
    fd.append("prefix", normalizePrefix(prefix));
    for (const file of imageFiles) fd.append("files", file);

    try {
      const res = await fetch("/api/assets/upload-images", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setImageUploadMsg(json?.error || "Upload failed.");
        setUploadingImages(false);
        return;
      }

      const failed: { name: string; error?: string }[] = json.failed > 0
        ? (json.results as any[]).filter((r) => !r.ok)
        : [];

      const successCount = imageFiles.length - failed.length;

      if (failed.length) {
        setImageUploadMsg(
          `${successCount} uploaded. Failed: ${failed.map((f) => `${f.name} (${f.error})`).join("; ")}`
        );
      } else {
        setImageUploadMsg(`${successCount} image${successCount !== 1 ? "s" : ""} uploaded.`);
        setImageFiles([]);
        await load();
      }
    } catch (e: any) {
      setImageUploadMsg(e?.message || "Upload failed.");
    }

    setUploadingImages(false);
  }

  async function submitAddAsset(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);

    const title = form.title.trim();
    const category_key = form.category_key.trim();
    const type = form.type.trim();
    const path = form.path.trim();
    const visibility = form.visibility;

    if (!title || !category_key || !path) {
      setFormMsg("Please fill out title, category, and path.");
      return;
    }

    setAdding(true);

    const { error: insErr } = await supabase.from("assets").insert({
      product_id: productId,
      title,
      type,
      category_key,
      path,
      visibility,
    });

    if (insErr) {
      setFormMsg(insErr.message);
      setAdding(false);
      return;
    }

    setForm({ title: "", category_key: "data_sheet", type: "document", path: "", visibility: "public" });
    setFormMsg("Added!");
    await load();
    setAdding(false);
  }

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="rounded-2xl border border-black/10 bg-[#F6F7F8] p-4 text-sm text-black/60">Loading tackle box…</div>
      ) : (
        <>
          {/* Header */}
          <div className="rounded-3xl border border-black/10 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[#047835]">{t("tackleBox")}</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black break-words">{catalogDisplayName(product?.name)}</h1>

                <div className="mt-2 text-sm text-[#76777B]">
                  {product?.sku ? `SKU: ${product.sku}` : t("noSku")}
                  {product?.series ? ` • Series: ${product.series}` : ""}
                  {product?.section ? ` • ${product.section}` : ""}
                </div>

                
              </div>

              <div className="shrink-0 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold ${
                    product?.active ? "bg-[#9CE2BB] text-[#11500F]" : "bg-black/5 text-black/55"
                  }`}
                >
                  {product?.active ? t("active") : t("inactive")}
                </span>

                <span className="inline-flex items-center rounded-full bg-black/5 px-3 py-1 text-[12px] font-semibold text-black/70">
                  {counts.pub} {t("showingPublic").replace("Showing: ", "")}{isInternalUser ? ` • ${counts.internal} ${t("internal").toLowerCase()}` : ""}
                </span>

                <span className="inline-flex items-center rounded-full bg-black/5 px-3 py-1 text-[12px] font-semibold text-black/70">
                  {isInternalUser ? t("showingPublicInternal") : t("showingPublic")}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs (auto-generated; only show tabs with content) */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {availableTabs.map((key) => {
              const on = key === activeTab;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[12px] font-semibold transition ${
                    on ? "border-[#047835] bg-[#047835] text-white" : "border-black/10 bg-white text-black hover:bg-black/[0.03]"
                  }`}
                  type="button"
                >
                  {TAB_LABELS[key]}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-black">{TAB_LABELS[activeTab]}</div>
              <div className="text-[12px] text-black/50 shrink-0">
                {filtered.length} item{filtered.length === 1 ? "" : "s"}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-black/10 bg-[#F6F7F8] p-4 text-sm text-black/60">
                {t("nothingInTab")}
              </div>
            ) : (() => {
              const images = filtered.filter((a) => IMAGE_EXTS.has(extOf(a.path)));
              const docs   = filtered.filter((a) => !IMAGE_EXTS.has(extOf(a.path)));

              return (
                <div className="mt-4 space-y-4">
                  {/* ── Image grid ─────────────────────────────────── */}
                  {images.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {images.map((a) => (
                        <div
                          key={a.id}
                          className="overflow-hidden rounded-2xl border border-black/10 bg-[#F6F7F8]"
                        >
                          {/* Thumbnail — clicks open full-size */}
                          <button
                            type="button"
                            onClick={() => openInline(a.path)}
                            className="block w-full"
                          >
                            <img
                              src={imgSrc(a.path)}
                              alt={a.title || basename(a.path)}
                              className="h-36 w-full object-cover sm:h-44"
                              loading="lazy"
                            />
                          </button>
                          <div className="px-3 py-2">
                            <div className="truncate text-[12px] font-semibold text-black">
                              {a.title || basename(a.path)}
                            </div>
                            {a.visibility === "internal" && (
                              <span className="mt-0.5 inline-block rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-black/60">
                                {t("internal")}
                              </span>
                            )}
                            <div className="mt-2 flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => openInline(a.path)}
                                className="flex-1 rounded-lg bg-[#047835] py-1.5 text-[11px] font-semibold text-white"
                              >
                                {t("view")}
                              </button>
                              <button
                                type="button"
                                onClick={() => forceDownload(a.path)}
                                className="flex-1 rounded-lg border border-black/10 bg-white py-1.5 text-[11px] font-semibold text-black"
                              >
                                {t("save")}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Document list ───────────────────────────────── */}
                  {docs.length > 0 && (
                    <div className="grid gap-3">
                      {docs.map((a) => {
                        const badge = groupBadgeFromPath(a.path);
                        const ext = extOf(a.path);
                        const canOpenInline = ["pdf", "mp4"].includes(ext);
                        return (
                          <div
                            key={a.id}
                            className="w-full overflow-hidden rounded-2xl border border-black/10 bg-white p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold text-black truncate">{a.title || t("untitled")}</div>
                                  {badge && (
                                    <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-black/70">{badge}</span>
                                  )}
                                  {a.visibility === "internal" && (
                                    <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-black/70">{t("internal")}</span>
                                  )}
                                </div>
                                <div className="mt-1 text-[12px] text-[#76777B] truncate">
                                  {typeFromPath(a.path)} • {a.path}
                                </div>
                              </div>
                              <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
                                {canOpenInline && (
                                  <button
                                    type="button"
                                    onClick={() => openInline(a.path)}
                                    className="inline-flex flex-1 sm:flex-none items-center justify-center rounded-xl bg-[#047835] px-3 py-2 text-[12px] font-semibold text-white whitespace-nowrap"
                                  >
                                    Open →
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => shareAsset(a.path)}
                                  className="hidden sm:inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-3 py-2 text-[12px] font-semibold text-black whitespace-nowrap hover:bg-black/[0.03]"
                                >
                                  Share
                                </button>
                                <button
                                  type="button"
                                  onClick={() => forceDownload(a.path)}
                                  className="inline-flex flex-1 sm:flex-none items-center justify-center rounded-xl border border-black/10 bg-white px-3 py-2 text-[12px] font-semibold text-black whitespace-nowrap hover:bg-black/[0.03]"
                                >
                                  Download
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>{/* end tab content */}

          {/* Image upload — visible to all internal users */}
          {isInternalUser && (
            <div className="mt-4 rounded-3xl border border-black/10 bg-white p-5">
              <div className="text-sm font-semibold text-black">{t("uploadProductImages")}</div>
              <div className="mt-1 text-[12px] text-[#76777B]">{t("imagesUploadNote")}</div>

              <label className="mt-4 block cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files || []);
                    setImageFiles((prev) => {
                      const existing = new Set(prev.map((f) => f.name + f.size));
                      return [...prev, ...incoming.filter((f) => !existing.has(f.name + f.size))];
                    });
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
                <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-black/15 bg-[#F6F7F8] px-4 py-6 text-center transition-colors hover:border-[#047835] hover:bg-[#F0FDF4] active:border-[#047835] active:bg-[#F0FDF4]">
                  <div className="flex items-center gap-2 text-black/30">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                      <circle cx="12" cy="13" r="3"/>
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-semibold" style={{ color: "#047835" }}>{t("tapToSelectImages")}</span>
                    <span className="text-sm text-black/40"> or drag & drop</span>
                  </div>
                  <div className="text-[11px] text-black/35">{t("pngJpgAccepted")}</div>
                </div>
              </label>

              {imageFiles.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {imageFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${file.size}-${i}`}
                      className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2 text-[12px]"
                    >
                      <span className="truncate pr-3 text-black">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setImageFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-black/5"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {imageFiles.length > 0 && (
                <button
                  type="button"
                  onClick={uploadImages}
                  disabled={uploadingImages}
                  className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-60 sm:w-auto sm:px-6"
                  style={{ backgroundColor: "#047835" }}
                >
                  {uploadingImages
                    ? "Uploading…"
                    : `${t("uploadProductImages")} (${imageFiles.length})`}
                </button>
              )}

              {imageUploadMsg && (
                <div className="mt-3 text-sm text-black/70">{imageUploadMsg}</div>
              )}
            </div>
          )}

          {/* Admin-only Add Asset */}
          {isAdmin && (
            <div className="mt-4 rounded-3xl border border-black/10 bg-white p-5">
              <div className="text-sm font-semibold text-black">{t("addAsset")}</div>
              <div className="mt-1 text-sm text-[#76777B]">{t("adminOnlyNote")}</div>

              <form onSubmit={submitAddAsset} className="mt-4 grid gap-3 sm:grid-cols-4">
                <input
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  placeholder="Title"
                  className="h-10 rounded-2xl border border-black/10 bg-[#F6F7F8] px-4 text-sm outline-none focus:border-[#047835]"
                />

                <select
                  value={form.category_key}
                  onChange={(e) => setForm((s) => ({ ...s, category_key: e.target.value }))}
                  className="h-10 rounded-2xl border border-black/10 bg-[#F6F7F8] px-4 text-sm outline-none focus:border-[#047835]"
                >
                  <option value="spec_document">spec_document</option>
                  <option value="data_sheet">data_sheet</option>
                  <option value="install_sheet">install_sheet</option>
                  <option value="sales_sheet">sales_sheet</option>
                  <option value="intake_forms">intake_forms</option>
                  <option value="test_reports">test_reports</option>
                  <option value="pricebook">pricebook</option>
                  <option value="approval_letters">approval_letters</option>
                  <option value="presentation">presentation</option>
                  <option value="case_studies">case_studies</option>
                  <option value="other">other</option>
                </select>

                <select
                  value={form.type}
                  onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                  className="h-10 rounded-2xl border border-black/10 bg-[#F6F7F8] px-4 text-sm outline-none focus:border-[#047835]"
                >
                  <option value="document">document</option>
                  <option value="image">image</option>
                  <option value="video">video</option>
                  <option value="link">link</option>
                </select>

                <select
                  value={form.visibility}
                  onChange={(e) => setForm((s) => ({ ...s, visibility: e.target.value as any }))}
                  className="h-10 rounded-2xl border border-black/10 bg-[#F6F7F8] px-4 text-sm outline-none focus:border-[#047835]"
                >
                  <option value="public">public</option>
                  <option value="internal">internal</option>
                </select>

                <input
                  value={form.path}
                  onChange={(e) => setForm((s) => ({ ...s, path: e.target.value }))}
                  placeholder={t("knowledgePathPlaceholder")}
                  className="h-10 sm:col-span-4 rounded-2xl border border-black/10 bg-[#F6F7F8] px-4 text-sm outline-none focus:border-[#047835]"
                />

                <div className="sm:col-span-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="submit"
                    disabled={adding}
                    className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#047835] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {adding ? t("adding") : t("addAsset")}
                  </button>

                  {formMsg ? (
                    <div className="text-sm text-black/70">{formMsg}</div>
                  ) : (
                    <div className="text-[12px] text-black/50">{t("tipStorage")}</div>
                  )}
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
