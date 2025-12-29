"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function ResetPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function updatePassword() {
    setMsg(null);
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");

    setLoading(true);
    try {
      // If the user arrived from the recovery email, Supabase should have a session context.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setMsg("This reset link is invalid or expired. Please request a new one.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg("Password updated. Redirecting…");
      setTimeout(() => router.replace("/chat"), 700);
    } catch (err: any) {
      setMsg(err?.message || "Couldn’t update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-2 text-sm text-white/60">Choose a strong password you’ll remember.</p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          <label className="block text-xs font-semibold text-white/70">New password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base outline-none placeholder:text-white/35 focus:border-emerald-300/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") updatePassword();
            }}
          />

          {msg && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85">
              {msg}
            </div>
          )}

          <button
            type="button"
            onClick={updatePassword}
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-lime-400 px-4 py-3 text-base font-semibold text-black shadow disabled:opacity-60"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </main>
  );
}
