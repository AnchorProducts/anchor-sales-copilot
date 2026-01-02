// src/app/api/admin/learning/action/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withCookies(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get("set-cookie");
  if (setCookie) to.headers.set("set-cookie", setCookie);
  return to;
}

export async function POST(req: Request) {
  try {
    const res = NextResponse.next();
    const supabase = supabaseRoute(req, res);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) {
      return withCookies(res, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const body = await req.json().catch(() => ({}));
    return withCookies(res, NextResponse.json({ ok: true, received: body }));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const res = NextResponse.next();
  const supabase = supabaseRoute(req, res);

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return withCookies(res, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  return withCookies(res, NextResponse.json({ ok: true }));
}
