"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffectiveRole } from "@/lib/role/viewAs";

// Who may open a submission form. Admins viewing the app as themselves can
// NEVER open a form — they must use "View app as" to preview as internal or
// external sales. This hook resolves the *effective* role (View-As aware) and
// redirects anyone outside the form's audience.
//
//   "external" — external sales only (e.g. the REC / project identifier form).
//   "sales"    — internal OR external sales (admin-view still blocked).
export type FormAudience = "external" | "sales";

export function useFormAccess(audience: FormAudience, redirectTo: string = "/dashboard") {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      setActualRole(String((prof as { role?: string } | null)?.role || ""));
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const effectiveRole = useEffectiveRole(actualRole);

  // Admin-as-admin is never allowed; only the sales personas are.
  const allowed =
    audience === "external"
      ? effectiveRole === "external_rep"
      : effectiveRole === "external_rep" || effectiveRole === "anchor_rep";

  useEffect(() => {
    if (loaded && !allowed) router.replace(redirectTo);
  }, [loaded, allowed, router, redirectTo]);

  return { ready: loaded && allowed, allowed, loaded, actualRole, effectiveRole };
}
