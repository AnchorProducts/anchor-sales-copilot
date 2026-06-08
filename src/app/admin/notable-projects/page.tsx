"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type Photo = { path: string; filename: string; contentType: string; url: string | null };

type NotableProject = {
  id: string;
  name: string;
  location: string | null;
  description: string | null;
  contact: string | null;
  submitter_name: string | null;
  submitter_company: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;
  created_at: string | null;
  status: string | null;
  photos: Photo[];
};

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function AdminNotableProjectsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [items, setItems] = useState<NotableProject[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        router.replace("/");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = String((prof as any)?.role || "");
      if (role !== "admin" && role !== "anchor_rep") {
        setAccessError("Admin access only.");
        setReady(true);
        return;
      }

      const res = await fetch("/api/notable-projects", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(json?.error || "Failed to load notable projects.");
      } else {
        setItems(json?.items || []);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router, supabase]);

  return (
    <main className="ds-page">

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Admin</div>
          <h1 className="mt-2 text-2xl">Notable Projects</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Submitted notable installations from external reps. Photos are valid for 1 hour after each load.
          </p>
        </Card>

        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Alert tone="error">{accessError}</Alert>
        ) : loadErr ? (
          <Alert tone="error">{loadErr}</Alert>
        ) : items.length === 0 ? (
          <Card className="p-5 text-sm text-[var(--anchor-gray)]">No notable projects submitted yet.</Card>
        ) : (
          <div className="grid gap-4">
            {items.map((it) => (
              <Card key={it.id} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-lg font-semibold text-black">{it.name}</div>
                  <div className="text-xs text-[var(--anchor-gray)]">{formatDate(it.created_at)}</div>
                </div>
                {it.location && <div className="mt-1 text-sm text-[var(--anchor-gray)]">{it.location}</div>}

                <div className="mt-3 grid gap-1 text-sm text-[var(--anchor-gray)]">
                  <div>
                    <span className="font-medium text-black">Submitted by:</span>{" "}
                    {[it.submitter_name, it.submitter_company, it.submitter_phone, it.submitter_email]
                      .filter(Boolean)
                      .join(" | ") || "—"}
                  </div>
                  {it.contact && (
                    <div>
                      <span className="font-medium text-black">Contact:</span> {it.contact}
                    </div>
                  )}
                </div>

                {it.description && (
                  <div className="mt-3 whitespace-pre-wrap rounded-[10px] bg-[var(--surface-soft)] p-3 text-sm text-black">
                    {it.description}
                  </div>
                )}

                {it.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {it.photos.map((p) =>
                      p.url ? (
                        <a
                          key={p.path}
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block aspect-square overflow-hidden rounded-[10px] border border-black/10"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={p.filename} className="h-full w-full object-cover" />
                        </a>
                      ) : (
                        <div
                          key={p.path}
                          className="flex aspect-square items-center justify-center rounded-[10px] border border-black/10 bg-[var(--surface-soft)] text-xs text-[var(--anchor-gray)]"
                        >
                          {p.filename}
                        </div>
                      )
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
