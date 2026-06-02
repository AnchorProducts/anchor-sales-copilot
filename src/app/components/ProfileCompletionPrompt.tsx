"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Modal from "@/app/components/ui/Modal";
import Button from "@/app/components/ui/Button";
import { APP_NAME } from "@/lib/appMode";

// localStorage flag — set once we've auto-prompted a given user on this browser,
// so the welcome nudge fires on first login but doesn't re-appear on every page
// load afterwards. Keyed per user so a shared machine prompts each account once.
const seenKey = (userId: string) => `anchor.profilePrompt.${userId}.seen`;

// Hide on auth screens (same convention as AppTutorial / AppSidebar) and on the
// settings page itself — no point prompting someone to go where they already are.
const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth"];
function shouldHide(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/dashboard/settings")) return true;
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function ProfileCompletionPrompt() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (shouldHide(pathname)) return;
    let alive = true;
    (async () => {
      const { data: ud } = await supabase.auth.getUser();
      if (!alive || !ud.user) return;

      // Already prompted on this browser → don't nag again.
      try {
        if (window.localStorage.getItem(seenKey(ud.user.id)) === "1") return;
      } catch { /* ignore */ }

      // A "new" user is one whose profile hasn't been filled out yet. The signup
      // flow sets full_name up front, so only direct-login users (whose profile
      // is lazily created with no name) land here.
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", ud.user.id)
        .maybeSingle();
      if (!alive) return;

      const hasName = !!(prof as { full_name?: string | null } | null)?.full_name?.trim();
      if (hasName) return;

      // Don't stack on top of the first-run walkthrough or any other open dialog.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      setUserId(ud.user.id);
      setOpen(true);
    })();
    return () => { alive = false; };
  }, [supabase, pathname]);

  function dismiss() {
    if (userId) {
      try { window.localStorage.setItem(seenKey(userId), "1"); } catch { /* ignore */ }
    }
    setOpen(false);
  }

  function goToSettings() {
    dismiss();
    router.push("/dashboard/settings");
  }

  if (!open) return null;

  return (
    <Modal open={open} className="max-w-md">
      <div className="p-1">
        <h2 className="text-lg font-bold leading-tight text-[var(--anchor-deep)]">
          Complete your profile
        </h2>
        <p className="mt-2 text-sm leading-snug text-black/70">
          Welcome to {APP_NAME}! Take a minute to fill out your profile — your name,
          company, phone, and service area — so we can route opportunities and
          commissions to you correctly.
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={dismiss} className="text-sm">
            Maybe later
          </Button>
          <Button variant="primary" onClick={goToSettings} className="text-sm">
            Go to settings
          </Button>
        </div>
      </div>
    </Modal>
  );
}
