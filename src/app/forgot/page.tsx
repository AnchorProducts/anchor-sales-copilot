"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function ForgotPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendReset() {
    setMsg(null);

    const e = email.trim().toLowerCase();
    if (!isEmail(e)) return setMsg("Enter a valid email.");

    setLoading(true);
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/reset` : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo });
      if (error) throw error;

      setMsg("Check your email for a password reset link.");
    } catch (err: any) {
      setMsg(err?.message || "Couldn’t send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-2 text-sm text-white/60">
          Enter your email and we’ll send a reset link.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          <label className="block text-xs font-semibold text-white/70">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base outline-none placeholder:text-white/35 focus:border-emerald-300/30"
          />

          {msg && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85">
              {msg}
            </div>
          )}

          <button
            type="button"
            onClick={sendReset}
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-lime-400 px-4 py-3 text-base font-semibold text-black shadow disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <div className="mt-4 text-center text-sm text-white/60">
            <Link href="/login" className="text-emerald-200 hover:text-emerald-100 underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
