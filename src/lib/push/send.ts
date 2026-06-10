// Server-side Web Push sending. Best-effort and self-contained: configures VAPID
// from env, looks up subscriptions, sends via web-push, and prunes dead
// endpoints. Never throws to callers (event routes fire-and-forget).
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@anchorp.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
};

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

async function deliver(subs: SubRow[], payload: PushPayload): Promise<number> {
  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        // 404/410 = subscription expired/unsubscribed — drop it.
        if (code === 404 || code === 410) dead.push(s.id);
      }
    })
  );
  if (dead.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
  }
  return sent;
}

// Push to every device of every user assigned to a tool. No-op if VAPID isn't
// configured, the tool has no assignees, or none of them have subscribed.
export async function sendPushToTool(toolKey: string, payload: PushPayload): Promise<void> {
  try {
    if (!configure()) {
      console.warn("[push] VAPID not configured — skipping tool:", toolKey);
      return;
    }
    const { data: assignments } = await supabaseAdmin
      .from("notification_tool_assignments")
      .select("user_id")
      .eq("tool_key", toolKey);
    const userIds = (assignments || []).map((a: { user_id: string }) => a.user_id);
    if (userIds.length === 0) return;

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", userIds);
    if (!subs || subs.length === 0) return;

    await deliver(subs as SubRow[], payload);
  } catch (e) {
    console.warn("[push] sendPushToTool failed:", e);
  }
}

// Push to a single user's devices (used by the "send test" route). Returns the
// number of devices the push reached.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return 0;
  return deliver(subs as SubRow[], payload);
}
