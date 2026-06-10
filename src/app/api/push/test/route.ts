import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Send a test push to the signed-in user's own devices, so they can confirm
// notifications work after enabling them.
export async function POST() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sent = await sendPushToUser(auth.user.id, {
      title: "Anchor notifications are on 🎉",
      body: "This is a test notification. You're all set.",
      url: "/dashboard",
      tag: "push-test",
    });

    if (sent === 0) {
      return NextResponse.json(
        { ok: false, sent: 0, error: "No active device subscriptions (or push isn't configured on the server)." },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send test." },
      { status: 500 }
    );
  }
}
