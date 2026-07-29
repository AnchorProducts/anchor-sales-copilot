import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireInternalUser } from "@/lib/portalAccess";

/* ============================================================================
 * Resource Library — the SHARED document source.
 *
 * Reads the same rows the Anchor Internal Portal's Documents view reads: the
 * `assets` table joined to `products` (name) and `asset_categories` (label),
 * with short-lived signed URLs from the private `knowledge` bucket. Contract is
 * deliberately identical to the portal's getPortalDocuments() so both surfaces
 * show one library.
 *
 * These tables are locked down by RLS (the anon key returns nothing) and the
 * bucket is private, so the reads and the URL signing use the service role.
 * That is safe ONLY because every entry point re-verifies the caller is an
 * authorized internal user first, and only ever SELECTs.
 * ==========================================================================*/

const BUCKET = "knowledge";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export type LibraryDoc = {
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

export type LibraryData = {
  docs: LibraryDoc[];
  categories: string[];
  products: string[];
};

/** All documents in the shared library, newest first, each with a signed
 *  download URL. Returns null when the caller is not an authorized user. */
export async function getLibraryDocuments(): Promise<LibraryData | null> {
  const access = await requireInternalUser();
  if (!access) return null;

  const [assetsRes, catsRes, productsRes] = await Promise.all([
    supabaseAdmin
      .from("assets")
      .select("id,title,path,visibility,category_key,product_id,last_updated,created_at")
      .order("last_updated", { ascending: false, nullsFirst: false }),
    supabaseAdmin.from("asset_categories").select("key,label").order("sort_order", { ascending: true }),
    supabaseAdmin.from("products").select("id,name"),
  ]);

  const rows = (assetsRes.data ?? []) as Array<Record<string, unknown>>;
  const catMap = new Map(
    ((catsRes.data ?? []) as Array<{ key: string; label: string }>).map((c) => [c.key, c.label])
  );
  const prodMap = new Map(
    ((productsRes.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])
  );

  // Sign every path in one batch.
  const paths = rows.map((a) => a.path).filter((p): p is string => Boolean(p));
  const urlMap = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
    }
  }

  const docs: LibraryDoc[] = rows.map((a) => {
    const categoryKey = (a.category_key as string | null) ?? null;
    const productId = (a.product_id as string | null) ?? null;
    const path = (a.path as string | null) ?? null;
    return {
      id: a.id as string,
      title: (a.title as string) || "(untitled)",
      categoryKey,
      categoryLabel: (categoryKey && catMap.get(categoryKey)) || categoryKey || "Document",
      visibility: (a.visibility as string) || "public",
      productName: (productId && prodMap.get(productId)) || null,
      productId,
      path,
      updatedAt: (a.last_updated as string) ?? (a.created_at as string) ?? null,
      downloadUrl: path ? urlMap.get(path) ?? null : null,
    };
  });

  // External reps never see internal-only material, whatever the deploy.
  const visible =
    access.appRole === "external_rep" ? docs.filter((d) => d.visibility !== "internal") : docs;

  const categories = Array.from(new Set(visible.map((d) => d.categoryLabel))).sort();
  const products = Array.from(
    new Set(visible.map((d) => d.productName).filter((p): p is string => Boolean(p)))
  ).sort();

  return { docs: visible, categories, products };
}
