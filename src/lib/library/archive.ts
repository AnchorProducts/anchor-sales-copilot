/* ============================================================================
 * Archive documents — the "ARCHIVE-" naming convention.
 *
 * Archiving is ORTHOGONAL to category. An archived sales sheet is still a sales
 * sheet: it keeps its category so the Sales filter lists it alongside the
 * current one, and it additionally carries the archive marker so an "Archive"
 * filter can pull every retired document together in one place.
 *
 * The marker is the FILE NAME, not a database column. That is deliberate — the
 * library is assembled from two sources (rows in `assets` and a raw listing of
 * the `knowledge` bucket), and only the file name is present in both. One rule,
 * read the same way on the server, in the browser, and by a human looking at
 * the bucket:
 *
 *     ARCHIVE-<name>            e.g. ARCHIVE-sales-sheet-mech-tie-down.pdf
 *
 * Archived files are uploaded into the product's `internal/` folder, so every
 * existing internal-path gate (the public Webflow feed, external-rep filtering)
 * already keeps them away from customers with no extra rules.
 * ==========================================================================*/

export const ARCHIVE_PREFIX = "ARCHIVE-";

/** Case-insensitive so a hand-uploaded "archive-foo.pdf" still counts. */
const ARCHIVE_RE = /^archive[-_]/i;

function basename(p: string): string {
  const s = String(p || "").split("?")[0];
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

/** True when the file at this storage path is an archived document. */
export function isArchivePath(path: string | null | undefined): boolean {
  return ARCHIVE_RE.test(basename(String(path || "")).trim());
}

/** True when a display title already carries the archive marker. */
export function isArchiveTitle(title: string | null | undefined): boolean {
  return ARCHIVE_RE.test(String(title || "").trim());
}

/** True when either the path or the stored title marks the document archived. */
export function isArchiveDoc(doc: { path?: string | null; title?: string | null }): boolean {
  return isArchivePath(doc.path) || isArchiveTitle(doc.title);
}

/** Apply the naming convention exactly once — never "ARCHIVE-ARCHIVE-x". */
export function withArchivePrefix(name: string): string {
  const n = String(name || "").trim();
  if (!n) return ARCHIVE_PREFIX;
  return isArchiveTitle(n) ? n : `${ARCHIVE_PREFIX}${n}`;
}

/** The display title with the marker stripped, for a badge-style UI. */
export function stripArchivePrefix(name: string): string {
  return String(name || "").trim().replace(ARCHIVE_RE, "");
}
