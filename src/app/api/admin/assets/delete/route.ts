import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as any)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin writes cannot bypass RLS." },
      { status: 500 }
    );
  }

  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body.id;
  const path: string | undefined = body.path;
  const productId: string | undefined = body.productId;

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // 1) Delete the storage object from the knowledge bucket.
  const { error: storageErr } = await supabaseAdmin.storage
    .from("knowledge")
    .remove([path]);

  if (storageErr) {
    console.error("[assets/delete] storage remove failed:", storageErr);
    return NextResponse.json(
      { error: `Storage: ${storageErr.message}` },
      { status: 500 }
    );
  }

  // 2) Remove any matching rows from the assets table so they don't reappear.
  const isRealId = id && typeof id === "string" && !id.startsWith("storage:") && !id.startsWith("optimistic:");
  if (isRealId) {
    const { error: rowErr } = await supabaseAdmin.from("assets").delete().eq("id", id);
    if (rowErr) {
      console.error("[assets/delete] assets row delete by id failed:", rowErr);
      // The storage object is gone; don't fail the whole request, but report it.
      return NextResponse.json({ ok: true, storageDeleted: true, rowDeleted: false, rowError: rowErr.message });
    }
  } else if (productId) {
    const { error: rowErr } = await supabaseAdmin
      .from("assets")
      .delete()
      .eq("product_id", productId)
      .eq("path", path);
    if (rowErr) {
      console.error("[assets/delete] assets row delete by path failed:", rowErr);
      return NextResponse.json({ ok: true, storageDeleted: true, rowDeleted: false, rowError: rowErr.message });
    }
  }

  return NextResponse.json({ ok: true, storageDeleted: true, rowDeleted: true });
}
