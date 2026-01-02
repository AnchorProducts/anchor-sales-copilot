// src/app/api/admin/learning/action/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = supabaseRoute();

    // Require signed-in user
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // If you expect a body, keep this
    const body = await req.json().catch(() => ({}));

    // ✅ TODO: put your actual learning action logic here
    // For now this just confirms the endpoint exists and compiles.
    return NextResponse.json({ ok: true, received: body });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

// Optional: allow a quick health check in browser
export async function GET() {
  return NextResponse.json({ ok: true });
}
