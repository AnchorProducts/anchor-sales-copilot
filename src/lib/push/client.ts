// Browser-side Web Push helpers. The service worker is registered by next-pwa;
// here we request permission, create/remove the push subscription, and sync it
// to the server. iOS only allows this from an installed (home-screen) PWA on
// iOS 16.4+; elsewhere it works in the browser and installed PWA.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushSupport =
  | { supported: true; permission: NotificationPermission; subscribed: boolean }
  | { supported: false; reason: string };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari exposes navigator.standalone; others use the display-mode query.
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Whether push can work here, and the current state. Used to drive the UI.
export async function getPushState(): Promise<PushSupport> {
  if (typeof window === "undefined") return { supported: false, reason: "ssr" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iOS < 16.4 (or a non-installed iOS PWA) lands here.
    return {
      supported: false,
      reason: isIos() && !isStandalone()
        ? "On iPhone/iPad, add this app to your Home Screen first, then enable notifications."
        : "This browser doesn’t support notifications.",
    };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { supported: false, reason: "Notifications aren’t configured on the server yet." };
  }
  // Use getRegistration() (resolves immediately) — NOT serviceWorker.ready,
  // which never resolves until a worker is active and would hang the card on
  // "Checking…".
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  return { supported: true, permission: Notification.permission, subscribed: !!sub };
}

// Get an active service-worker registration, registering /sw.js ourselves if
// next-pwa hasn't (and waiting — with a timeout — for it to become active).
async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  const active = (ready as ServiceWorkerRegistration | null) || reg;
  if (!active.active) throw new Error("The notification service worker didn’t start. Reload the app and try again.");
  return active;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1);
}

// Request permission + subscribe this device, then sync to the server.
export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const state = await getPushState();
    if (!state.supported) return { ok: false, error: state.reason };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, error: "Notification permission was not granted." };
    }

    const reg = await ensureRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return { ok: false, error: j?.error || "Failed to save subscription." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to enable notifications." };
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to turn off notifications." };
  }
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/push/test", { method: "POST", credentials: "include" });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.ok === false) return { ok: false, error: j?.error || "Test failed." };
  return { ok: true };
}
