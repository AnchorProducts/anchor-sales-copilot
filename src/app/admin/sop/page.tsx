"use client";

// The operating manual, in the app. Everything a stand-in needs to run each
// tool — admin, internal and external — lives in src/lib/sop/content.ts; this
// page only renders it. When a tool changes, update its section there.

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Icon, Pill, Segmented, Surface } from "@/app/components/ui/kit";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import {
  SOP_AUDIENCES,
  SOP_REVIEWED,
  SOP_SECTIONS,
  type SopAudience,
  type SopSection,
} from "@/lib/sop/content";

export const dynamic = "force-dynamic";

// "**Label**" renders as bold, so exact button and tab names stand out.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-black">{p.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}

function sectionText(s: SopSection) {
  return [
    s.title,
    s.where || "",
    s.summary,
    ...s.blocks.flatMap((b) => [b.heading, ...(b.steps || []), ...(b.bullets || []), b.note || ""]),
  ]
    .join(" ")
    .toLowerCase();
}

function audienceLabel(a: SopAudience) {
  return SOP_AUDIENCES.find((x) => x.value === a)?.label || a;
}

export default function AdminSopPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SopAudience>("start");
  const [query, setQuery] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (!alive) return;
      if (String((prof as { role?: string } | null)?.role || "") !== "admin") setError("Admin access only.");
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  // Printing renders every audience, not just the open tab.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (printing) return SOP_SECTIONS;
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      return SOP_SECTIONS.filter((s) => {
        const hay = sectionText(s);
        return words.every((w) => hay.includes(w));
      });
    }
    return SOP_SECTIONS.filter((s) => s.audience === tab);
  }, [printing, q, tab]);

  const current = SOP_AUDIENCES.find((a) => a.value === tab);

  return (
    <main className="ds-page">
      <AppNavbar
        title="SOP"
        subtitle="How every tool works"
        menuItems={[{ label: "Admin", href: "/admin" }]}
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <ToolLoader feature="admin" label="Loading…" />
        ) : error ? (
          <Surface className="p-5 text-sm text-[var(--anchor-deep)]">{error}</Surface>
        ) : (
          <div className="mx-auto max-w-5xl">
            <Surface className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link href="/admin" className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--anchor-green)] print:hidden">
                    <Icon name="chevronLeft" className="h-4 w-4" />
                    Admin Console
                  </Link>
                  <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-black">
                    Standard Operating Procedures
                  </h1>
                  <p className="mt-1.5 max-w-2xl text-[14px] leading-snug text-[var(--anchor-gray)]">
                    How the app works for admins, Anchor staff and outside reps, tool by tool. Written so
                    anyone covering marketing or admin can pick up the work without asking. Last reviewed{" "}
                    {new Date(`${SOP_REVIEWED}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
                  </p>
                </div>
                <Pill variant="gray" size="sm" className="shrink-0 self-start print:hidden" onClick={() => setPrinting(true)}>
                  <Icon name="print" className="h-4 w-4" />
                  Print all
                </Pill>
              </div>

              <div className="mt-5 flex flex-col gap-3 print:hidden">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search every procedure — e.g. pizza box, push, reset password"
                  className="ds-input w-full"
                />
                <div className={`-mx-1 overflow-x-auto px-1 ${q ? "pointer-events-none opacity-40" : ""}`}>
                  <Segmented
                    ariaLabel="Audience"
                    size="sm"
                    options={SOP_AUDIENCES.map((a) => ({ value: a.value, label: a.label }))}
                    value={q ? null : tab}
                    onChange={(v) => setTab(v)}
                  />
                </div>
              </div>
            </Surface>

            {!q && !printing && current && (
              <p className="mt-4 px-1 text-[13px] leading-snug text-[var(--anchor-gray)]">{current.hint}</p>
            )}
            {q && (
              <p className="mt-4 px-1 text-[13px] text-[var(--anchor-gray)]">
                {visible.length} {visible.length === 1 ? "procedure matches" : "procedures match"} &ldquo;{query.trim()}&rdquo;
              </p>
            )}

            <div className="mt-4 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
              {!q && !printing && visible.length > 1 && (
                <nav aria-label="Contents" className="hidden lg:block print:hidden">
                  <div className="sticky top-6">
                    <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Contents</div>
                    <ul className="mt-2 space-y-0.5">
                      {visible.map((s) => (
                        <li key={s.id}>
                          <a
                            href={`#${s.id}`}
                            className="block rounded-lg px-2 py-1.5 text-[13px] leading-snug text-black/75 hover:bg-[var(--mo-fill)] hover:text-black"
                          >
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </nav>
              )}

              <div className={`space-y-4 ${!q && !printing && visible.length > 1 ? "" : "lg:col-span-2"}`}>
                {visible.length === 0 && (
                  <Surface className="p-6 text-center text-[14px] text-[var(--anchor-gray)]">
                    Nothing matches. Try a shorter word, or the name of the page.
                  </Surface>
                )}
                {visible.map((s, i) => (
                  <Fragment key={s.id}>
                    {printing && (i === 0 || visible[i - 1].audience !== s.audience) && (
                      <h2 className="pt-4 text-[22px] font-semibold text-black">{audienceLabel(s.audience)}</h2>
                    )}
                    <SectionCard section={s} showAudience={!!q} />
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function SectionCard({ section: s, showAudience }: { section: SopSection; showAudience: boolean }) {
  return (
    <Surface id={s.id} className="scroll-mt-6 p-5 sm:p-6 print:break-inside-avoid-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.02em] text-black">{s.title}</h2>
            {showAudience && (
              <span className="rounded-full bg-[var(--mo-fill)] px-2 py-0.5 text-[11px] font-semibold text-black/70">
                {audienceLabel(s.audience)}
              </span>
            )}
          </div>
          {s.where && <div className="mt-1 font-mono text-[12px] text-[var(--anchor-gray)]">{s.where}</div>}
        </div>
        {s.href && (
          <Link
            href={s.href}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--anchor-green)]/12 px-3.5 text-[13px] font-semibold text-[var(--anchor-green)] hover:bg-[var(--anchor-green)]/18 print:hidden"
          >
            Open
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        )}
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-black/80">
        <Rich text={s.summary} />
      </p>

      {s.blocks.map((b) => (
        <div key={b.heading} className="mt-5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">{b.heading}</h3>
          {b.steps && b.steps.length > 0 && (
            <ol className="mt-2 space-y-1.5">
              {b.steps.map((step, i) => (
                <Row key={i} marker={<span className="tabular-nums">{i + 1}</span>}>
                  <Rich text={step} />
                </Row>
              ))}
            </ol>
          )}
          {b.bullets && b.bullets.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {b.bullets.map((item, i) => (
                <Row key={i} marker={<span className="h-1.5 w-1.5 rounded-full bg-black/35" />}>
                  <Rich text={item} />
                </Row>
              ))}
            </ul>
          )}
          {b.note && (
            <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-[13px] leading-snug text-amber-900">
              <Icon name="warning" className="mt-0.5 h-4 w-4" />
              <div><Rich text={b.note} /></div>
            </div>
          )}
        </div>
      ))}
    </Surface>
  );
}

function Row({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-[14px] leading-relaxed text-black/80">
      <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--mo-fill)] text-[11px] font-semibold text-black/70">
        {marker}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}
