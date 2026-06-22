"use client";

import { useCallback, useEffect, useState } from "react";

// Tracks per-order unread chat counts for the current viewer and keeps them
// fresh with light polling. Used by both the rep history and admin console to
// badge each order's "Messages" button.
export function useOrderUnread(pollMs = 20000) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Optimistically clear an order's badge (call when its thread is opened) and
  // tell the server this viewer has now seen it.
  const markRead = useCallback((orderId: string) => {
    setCounts((c) => (c[orderId] ? { ...c, [orderId]: 0 } : c));
    void fetch(`/api/marketing-orders/${orderId}/messages`, { method: "PATCH" }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/marketing-orders/unread", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !alive) return;
        setCounts((json?.counts as Record<string, number>) || {});
      } catch {
        /* best-effort; leave prior counts in place */
      }
    }
    load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return { counts, markRead };
}
