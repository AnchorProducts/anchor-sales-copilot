import { NextResponse } from "next/server";
import { getLibraryDocuments } from "@/lib/library/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * GET /api/library/docs → the shared Resource Library.
 *
 * Same rows, same shape, as the Anchor Internal Portal's Documents view.
 * Authorization and signed-URL minting happen server-side in
 * getLibraryDocuments(); this route only shapes the response.
 * ==========================================================================*/
export async function GET() {
  const data = await getLibraryDocuments();
  if (!data) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(data);
}
