// src/app/api/doc-open/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePathInput(s: string) {
  return decodeURIComponent((s || "").trim()).replace(/^\/+/, "").replace(/\/+$/, "");
}

function storagePathCandidates(input: string) {
  const raw = normalizePathInput(input);
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (p: string) => {
    const v = normalizePathInput(p);
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };

  add(raw);

  if (raw.toLowerCase().startsWith("knowledge/")) {
    add(raw.slice("knowledge/".length));
  }

  const fromBucketUrl = raw.match(/(?:^|\/)knowledge\/(.+)$/i);
  if (fromBucketUrl?.[1]) add(fromBucketUrl[1]);

  if (raw.toLowerCase().startsWith("internal/")) {
    add(raw.slice("internal/".length));
  }

  if (raw.toLowerCase().startsWith("rep-agreements/")) {
    add(`internal/${raw}`);
  }

  if (raw.toLowerCase().startsWith("internal/rep-agreements/")) {
    const rest = raw.slice("internal/rep-agreements/".length);
    add(`rep-agreements/${rest}`);

    // Legacy bad paths sometimes inserted an extra folder segment.
    const parts = rest.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const tail = parts.slice(1).join("/");
      add(`internal/rep-agreements/${tail}`);
      add(`rep-agreements/${tail}`);
    }

    const file = parts[parts.length - 1] || "";
    if (file) {
      add(`internal/rep-agreements/${file}`);
      add(`rep-agreements/${file}`);
      add(`rep-agreements/rep-agreements/${file}`);
    }
  }

  if (!raw.includes("/")) {
    add(`internal/rep-agreements/${raw}`);
  }

  return out;
}

function filenameFromPath(path: string) {
  const clean = String(path || "").split("?")[0];
  return clean.split("/").pop() || "download";
}

function parentFromPath(path: string) {
  const clean = normalizePathInput(path);
  const i = clean.lastIndexOf("/");
  return i > 0 ? clean.slice(0, i) : "";
}

function extOf(path: string) {
  const m = filenameFromPath(path).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function normalizeNameForMatch(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

async function findRepAgreementFallbackPath(pathOptions: string[], requestedPath: string) {
  const requestedExt = extOf(requestedPath);
  if (!requestedExt) return null;

  const requestedBase = normalizeNameForMatch(filenameFromPath(requestedPath));
  const folderSet = new Set<string>();

  // Priority folders for this domain
  folderSet.add("internal/rep-agreements");
  folderSet.add("rep-agreements");
  folderSet.add("internal/rep-agreements/rep-agreements");
  folderSet.add("rep-agreements/rep-agreements");

  for (const p of pathOptions) {
    const parent = parentFromPath(p);
    if (parent) folderSet.add(parent);
    const up = parentFromPath(parent);
    if (up) folderSet.add(up);
  }

  const folders = [...folderSet].filter((f) => f && f.toLowerCase().includes("rep-agreements"));
  const files: { fullPath: string; name: string; updated_at?: string | null }[] = [];

  for (const folder of folders) {
    const { data, error } = await supabaseAdmin.storage
      .from("knowledge")
      .list(folder, { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
    if (error || !data?.length) continue;

    for (const item of data as any[]) {
      const name = String(item?.name || "");
      if (!name) continue;

      const itemExt = extOf(name);
      if (itemExt === requestedExt) {
        files.push({
          fullPath: `${folder}/${name}`.replace(/\/+/g, "/"),
          name,
          updated_at: item?.updated_at || null,
        });
      } else if (!itemExt) {
        // One-level descent for nested subfolders.
        const nestedFolder = `${folder}/${name}`.replace(/\/+/g, "/");
        const { data: nestedData, error: nestedErr } = await supabaseAdmin.storage
          .from("knowledge")
          .list(nestedFolder, { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
        if (nestedErr || !nestedData?.length) continue;

        for (const nested of nestedData as any[]) {
          const nestedName = String(nested?.name || "");
          if (!nestedName) continue;
          if (extOf(nestedName) !== requestedExt) continue;
          files.push({
            fullPath: `${nestedFolder}/${nestedName}`.replace(/\/+/g, "/"),
            name: nestedName,
            updated_at: nested?.updated_at || null,
          });
        }
      }
    }
  }

  if (!files.length) return null;

  // Prefer filename similarity to requested path.
  const scored = files
    .map((f) => {
      const cand = normalizeNameForMatch(f.name);
      const score =
        cand === requestedBase
          ? 3
          : cand.includes(requestedBase) || requestedBase.includes(cand)
          ? 2
          : requestedBase
              .split(/[^a-z0-9]+/)
              .filter(Boolean)
              .some((t) => cand.includes(t))
          ? 1
          : 0;
      return { ...f, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });

  return scored[0]?.fullPath || null;
}

function contentTypeFor(path: string) {
  const ext = extOf(path);
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "mp4") return "video/mp4";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "pptx")
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

function isInternalPath(path: string) {
  const p = String(path || "").toLowerCase();
  return (
    p.includes("/internal/") ||
    p.startsWith("internal/") ||
    p.includes("/pricebook/") ||
    p.includes("/test/") ||
    p.includes("/test-reports/")
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const path = normalizePathInput(searchParams.get("path") || "");
  const pathOptions = storagePathCandidates(path);
  const download = searchParams.get("download") === "1";

  // ✅ NEW: allow token via query param for mobile (because window.location can't send headers)
  const tokenFromQuery = (searchParams.get("token") || "").trim();

  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  /* ------------------------------------------------
     ✅ Auth (cookie OR bearer OR token query)
     - If no auth, we still allow PUBLIC docs
     - Internal docs still require auth
  ------------------------------------------------- */

  let user: any = null;

  // 1) Cookie-based auth (desktop)
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (!authErr && auth?.user) user = auth.user;
  } catch {
    // ignore
  }

  // 2) Bearer token auth (if you ever fetch doc-open with headers)
  if (!user) {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user) user = data.user;
    }
  }

  // 3) Token from query string (mobile-safe)
  if (!user && tokenFromQuery) {
    const { data, error } = await supabaseAdmin.auth.getUser(tokenFromQuery);
    if (!error && data?.user) user = data.user;
  }

  // 4) If still not authed, only allow PUBLIC paths
  if (!user && pathOptions.some((p) => isInternalPath(p))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ------------------------------------------------
     ✅ INLINE VIEW: redirect to signed URL
  ------------------------------------------------- */

  if (!download) {
    let signedUrl: string | null = null;
    let resolvedPath = "";
    for (const p of pathOptions) {
      const { data, error } = await supabaseAdmin.storage.from("knowledge").createSignedUrl(p, 60 * 30);
      if (!error && data?.signedUrl) {
        signedUrl = data.signedUrl;
        resolvedPath = p;
        break;
      }
    }

    if (!signedUrl && pathOptions.some((p) => p.toLowerCase().includes("rep-agreements"))) {
      const fallbackPath = await findRepAgreementFallbackPath(pathOptions, path);
      if (fallbackPath) {
        const { data, error } = await supabaseAdmin.storage.from("knowledge").createSignedUrl(fallbackPath, 60 * 30);
        if (!error && data?.signedUrl) {
          signedUrl = data.signedUrl;
          resolvedPath = fallbackPath;
        }
      }
    }

    if (!signedUrl) {
      return NextResponse.json(
        { error: "Could not create signed url", tried: pathOptions.slice(0, 8) },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedUrl, 302);
  }

  /* ------------------------------------------------
     ✅ DOWNLOAD: proxy so attachment is forced
  ------------------------------------------------- */

  let file: Blob | null = null;
  let resolvedPath = pathOptions[0] || path;
  for (const p of pathOptions) {
    const { data, error } = await supabaseAdmin.storage.from("knowledge").download(p);
    if (!error && data) {
      file = data;
      resolvedPath = p;
      break;
    }
  }

  if (!file && pathOptions.some((p) => p.toLowerCase().includes("rep-agreements"))) {
    const fallbackPath = await findRepAgreementFallbackPath(pathOptions, path);
    if (fallbackPath) {
      const { data, error } = await supabaseAdmin.storage.from("knowledge").download(fallbackPath);
      if (!error && data) {
        file = data;
        resolvedPath = fallbackPath;
      }
    }
  }

  if (!file) {
    return NextResponse.json({ error: "Could not download file" }, { status: 500 });
  }

  const arrayBuf = await file.arrayBuffer();
  const filename = filenameFromPath(resolvedPath);
  const contentType = contentTypeFor(resolvedPath);

  return new NextResponse(arrayBuf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
