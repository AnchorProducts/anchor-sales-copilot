"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics/track";

export function UserEventTracker() {
  const pathname = usePathname() || "";
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
