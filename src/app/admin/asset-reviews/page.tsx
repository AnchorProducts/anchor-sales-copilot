"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import Button from "@/app/components/ui/Button";

export const dynamic = "force-dynamic";

type ReviewItem = {
  id: string;
  product_id: string;
  product_name: string | null;
  uploaded_by_name: string | null;
  uploaded_by_company: string | null;
  uploaded_by_email: string | null;
  filename: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  note: string | null;
  status: string;
  created_at: string;
  preview_url: string | null;
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

export default function AdminAssetReviewsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");

  async function fetchItems(status: "pending" | "approved" | "rejected") {
    const res = await fetch(`/api/admin/asset-reviews?status=${status}`, {
      cache: "no-store",
      credentials: "include",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setLoadErr(json?.error || "Failed to load reviews.");
      setItems([]);
      return;
    }
    setItems(json?.items || []);
    setLoadErr(null);
  }

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
      if (role !== "admin") {
        setAccessError("Admin access only.");
        setReady(true);
        return;
      }
      await fetchItems(statusFilter);
      if (!alive) return;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  useEffect(() => {
    if (!ready || accessError) return;
    fetchItems(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const body: any = { id, action };
      if (action === "reject") {
        const reason = window.prompt("Reason for rejection (optional)") || "";
        body.reason = reason;
      }
      const res = await fetch("/api/admin/asset-reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadErr(json?.error || "Action failed.");
        setBusyId(null);
        return;
      }
      setItems((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen anchor-app-bg p-6">
        <Alert tone="neutral" className="mx-auto max-w-5xl">
          Loading…
        </Alert>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="min-h-screen anchor-app-bg p-6">
        <Alert tone="error" className="mx-auto max-w-5xl">
          {accessError}
        </Alert>
      </main>
    );
  }

  return (
    <main className="min-h-screen anchor-app-bg p-4 sm:p-6">
      <AppNavbar
        title="Asset Reviews"
        subtitle="Admin"
        menuItems={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin", href: "/admin" },
        ]}
      />

      <div className="mx-auto mt-6 max-w-5xl">
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-black">Asset reviews</div>
              <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                Approve or reject photos submitted by internal users. Approved files
                publish to the matching solution's tackle box.
              </div>
            </div>
            <div className="flex gap-2">
              {(["pending", "approved", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
                    statusFilter === s
                      ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                      : "border-black/10 bg-white text-black"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loadErr && (
            <Alert className="mt-4" tone="error">
              {loadErr}
            </Alert>
          )}

          {items.length === 0 && !loadErr ? (
            <Alert className="mt-4" tone="neutral">
              No {statusFilter} items.
            </Alert>
          ) : (
            <div className="mt-4 grid gap-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-2xl border border-black/10 bg-white p-4 sm:grid-cols-[180px_1fr]"
                >
                  <div className="overflow-hidden rounded-xl bg-[var(--surface-soft)]">
                    {item.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.preview_url}
                        alt={item.filename}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center text-[12px] text-black/40">
                        No preview
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 grid gap-2">
                    <div>
                      <div className="text-sm font-semibold text-black break-words">
                        {item.product_name || item.product_id}
                      </div>
                      <div className="mt-0.5 text-[12px] text-[var(--anchor-gray)] break-words">
                        {item.filename}
                        {item.size_bytes ? ` · ${(item.size_bytes / 1024).toFixed(1)} KB` : ""}
                      </div>
                    </div>

                    <div className="text-[12px] text-[var(--anchor-gray)]">
                      Submitted by{" "}
                      <span className="font-semibold text-black">
                        {item.uploaded_by_name || item.uploaded_by_email || "Unknown"}
                      </span>
                      {item.uploaded_by_company ? ` · ${item.uploaded_by_company}` : ""} ·{" "}
                      {formatDate(item.created_at)}
                    </div>

                    {item.note && (
                      <div className="rounded-md bg-[var(--surface-soft)] p-2 text-[12px] text-black/70">
                        {item.note}
                      </div>
                    )}

                    {statusFilter === "pending" ? (
                      <div className="mt-1 flex gap-2">
                        <Button
                          onClick={() => review(item.id, "approve")}
                          disabled={busyId === item.id}
                          variant="primary"
                          className="px-4 py-2 text-[12px]"
                        >
                          {busyId === item.id ? "Working…" : "Approve"}
                        </Button>
                        <Button
                          onClick={() => review(item.id, "reject")}
                          disabled={busyId === item.id}
                          variant="secondary"
                          className="px-4 py-2 text-[12px]"
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <div className="text-[11px] uppercase tracking-wide text-black/50">
                        {item.status}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
