// src/app/assets/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseRoute } from "@/lib/supabase/server";
import AssetsBrowser from "../components/assets/AssetsBrowser";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const supabase = await supabaseRoute();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/");

  return (
    <main className="min-h-dvh bg-[#F6F7F8] text-black">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-[#047835] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-md bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <img src="/anchorp.svg" alt="Anchor Products" className="h-10 w-auto" />
            </div>

            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold tracking-wide truncate text-white">
                Asset Management
              </div>
              <div className="text-[12px] text-white/80 truncate">
                Tackle boxes • Asset Library
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard"
              className="h-9 inline-flex items-center rounded-md border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15 transition"
              title="Back to Dashboard"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Page body */}
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="mb-4 rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Asset Library</h1>
          <p className="mt-1 text-sm text-[#76777B]">
            Browse Solutions + Anchors + Tacklebox Items
          </p>
        </div>

        <AssetsBrowser />
      </div>
    </main>
  );
}
