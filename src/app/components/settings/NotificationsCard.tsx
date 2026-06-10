"use client";

import { useEffect, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
  type PushSupport,
} from "@/lib/push/client";

// Per-device push-notification control. Lets a user turn notifications on/off on
// the current browser/phone and send themselves a test. What they actually get
// notified about is controlled by the admin (Notifications → tool assignments).
export default function NotificationsCard() {
  const [state, setState] = useState<PushSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function refresh() {
    setState(await getPushState());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    const r = await subscribeToPush();
    setMsg(r.ok ? { kind: "ok", text: "Notifications enabled on this device." } : { kind: "err", text: r.error || "Failed." });
    await refresh();
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    const r = await unsubscribeFromPush();
    setMsg(r.ok ? { kind: "ok", text: "Notifications turned off on this device." } : { kind: "err", text: r.error || "Failed." });
    await refresh();
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await sendTestPush();
    setMsg(r.ok ? { kind: "ok", text: "Test sent — check your notifications." } : { kind: "err", text: r.error || "Test failed." });
    setBusy(false);
  }

  const subscribed = state?.supported === true && state.subscribed;
  const blocked = state?.supported === true && state.permission === "denied";

  return (
    <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
      <div className="text-sm font-semibold text-black">Notifications</div>
      <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
        Get a push notification on this device when something needs your attention. On iPhone/iPad,
        add this app to your Home Screen first (iOS 16.4+).
      </div>

      {state === null ? (
        <div className="mt-4 text-[12px] text-[var(--anchor-gray)]">Checking…</div>
      ) : !state.supported ? (
        <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-3 text-[12px] text-[var(--anchor-gray)]">
          {state.reason}
        </div>
      ) : blocked ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          Notifications are blocked for this app in your browser settings. Allow them there, then reload.
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {subscribed ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--anchor-mint)]/50 px-3 py-1 text-[12px] font-semibold text-[var(--anchor-deep)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--anchor-green)]" />
                On for this device
              </span>
              <Button type="button" variant="secondary" disabled={busy} onClick={test} className="px-4 py-2 text-sm">
                Send test
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={disable} className="px-4 py-2 text-sm">
                Turn off
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" disabled={busy} onClick={enable} className="px-5 py-2 text-sm">
              {busy ? "Enabling…" : "Enable notifications"}
            </Button>
          )}
        </div>
      )}

      {msg && (
        <div
          className={
            "mt-3 rounded-lg px-3 py-2 text-xs " +
            (msg.kind === "ok"
              ? "bg-[var(--anchor-mint)]/40 text-[var(--anchor-deep)]"
              : "border border-red-200 bg-red-50 text-red-700")
          }
        >
          {msg.text}
        </div>
      )}
    </Card>
  );
}
