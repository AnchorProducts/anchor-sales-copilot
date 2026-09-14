"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ShowcaseSubmitForm from "@/app/components/showcase/ShowcaseSubmitForm";
import MySubmissions from "@/app/components/showcase/MySubmissions";
import ShowcaseSchedule from "@/app/components/showcase/ShowcaseSchedule";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Tabs, TabButton } from "@/app/components/ui/Tabs";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";
import { useToolAccess } from "@/lib/role/useToolAccess";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { NO_ACCESS, showcaseFetch, useRefetchOnFocus } from "@/lib/showcase/client";

export const dynamic = "force-dynamic";

export default function ShowcaseSubmitPage() {
  // Internal sales only — the mobile showcase is driven by operations and the
  // stops are filed by whoever is on the road. Admins must "View app as" an
  // internal rep to preview, the same as every other submission form.
  const { ready } = useFormAccess("sales");
  // The showcase is a named list, not a role. The API routes enforce this too —
  // this only decides what the page renders.
  const { grants, ready: grantsReady } = useToolAccess();
  const { t } = useTranslation();

  const allowed = grants.has("showcase");

  return (
    <main className="ds-page">
      <AppNavbar
        title="Showcase Stop"
        subtitle="File a mobile showcase stop"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-3xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Mobile showcase</div>
          <h1 className="mt-2 text-2xl">File a stop</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Log where the showcase went, what happened there, and a photograph.
          </p>
          <p className="mt-3 text-sm text-[var(--anchor-gray)]">
            Every stop is filed pending. Marketing publishes or declines it on anchorp.com, and
            the public schedule only ever shows published stops — so nothing you file here goes
            live on its own. If a stop is declined, the reason shows under My submissions.
          </p>
        </Card>

        {!ready || !grantsReady ? (
          <ToolLoader feature="notable" label={t("loading")} />
        ) : allowed ? (
          <ShowcaseWorkspace />
        ) : (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            You&rsquo;re not assigned to the mobile showcase. An admin can add you in Admin
            Console → Manage Tools.
          </Card>
        )}
      </div>
    </main>
  );
}

type Tab = "file" | "mine" | "schedule";

/** yes/no: the website answered. unknown: it couldn't be asked (offline, or
 *  not live yet) — asked again when the person comes back to the app. */
type Keeper = "checking" | "yes" | "no" | "unknown" | "noaccess";

function ShowcaseWorkspace() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [tab, setTab] = useState<Tab>("file");
  const [keeper, setKeeper] = useState<Keeper>("checking");
  const [filed, setFiled] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Who keeps the schedule is the website's rule (the Showcase flag, an admin,
  // or the marketing team), and copying it here would drift. So ask: load the
  // schedule once and let 200 / 403 / 401 decide which screens exist.
  const decide = useCallback((result: { ok: boolean; status: number }) => {
    if (result.ok) setKeeper("yes");
    else if (result.status === 401) setKeeper("noaccess");
    else if (result.status === 403) setKeeper("no");
    else setKeeper("unknown");
  }, []);

  const probe = useCallback(async () => {
    decide(await showcaseFetch(supabase, "/api/showcase/stops"));
  }, [supabase, decide]);

  useEffect(() => {
    let alive = true;
    void showcaseFetch(supabase, "/api/showcase/stops").then((result) => {
      if (alive) decide(result);
    });
    return () => {
      alive = false;
    };
  }, [supabase, decide]);

  useRefetchOnFocus(
    useCallback(() => {
      if (keeper === "unknown" || keeper === "noaccess") void probe();
    }, [keeper, probe])
  );

  function go(next: Tab) {
    setTab(next);
    setFlash(null);
    setNotice(null);
  }

  const onFiled = useCallback(() => {
    setFlash("Sent to marketing for review.");
    setFiled((n) => n + 1);
    setTab("mine");
    window.scrollTo({ top: 0 });
  }, []);

  const onForbidden = useCallback(() => {
    setKeeper("no");
    setTab((current) => (current === "schedule" ? "file" : current));
    setNotice("You don't have access to the showcase schedule any more. You can still file stops.");
  }, []);

  if (keeper === "checking") return <div className="text-sm text-[var(--anchor-gray)]">Loading…</div>;

  if (keeper === "noaccess") {
    return (
      <Card className="p-5 text-sm text-[var(--anchor-deep)]">
        <div className="font-semibold">You don&rsquo;t have access to the showcase.</div>
        <p className="mt-1 text-[var(--anchor-gray)]">{NO_ACCESS}</p>
        <Button variant="secondary" className="mt-3" onClick={() => void probe()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <>
      <Tabs className="mb-4">
        <TabButton active={tab === "file"} onClick={() => go("file")}>
          File a stop
        </TabButton>
        <TabButton active={tab === "mine"} onClick={() => go("mine")}>
          My submissions
        </TabButton>
        {keeper === "yes" && (
          <TabButton active={tab === "schedule"} onClick={() => go("schedule")}>
            Schedule
          </TabButton>
        )}
      </Tabs>

      {notice && <Alert className="mb-4">{notice}</Alert>}

      {/* Panels stay mounted and are only hidden, so a half-filled stop or an
          open edit survives a trip to another tab. */}
      <div hidden={tab !== "file"}>
        <ShowcaseSubmitForm onFiled={onFiled} />
      </div>
      <div hidden={tab !== "mine"}>
        <MySubmissions active={tab === "mine"} refreshKey={filed} flash={flash} />
      </div>
      {keeper === "yes" && (
        <div hidden={tab !== "schedule"}>
          <ShowcaseSchedule active={tab === "schedule"} refreshKey={filed} onForbidden={onForbidden} />
        </div>
      )}
    </>
  );
}
