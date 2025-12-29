"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function signUp() {
    setMsg(null);

    const name = fullName.trim();
    const e = email.trim().toLowerCase();

    if (!name) return setMsg("Enter your name.");
    if (!isEmail(e)) return setMsg("Enter a valid email.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          data: { full_name: name }, // stored on auth.user metadata
        },
      });

      if (error) throw error;

      // Many Supabase projects require email confirmation.
      // If confirmation is ON, user may be null session until confirmed.
      if (!data.session) {
        setMsg("Check your email to confirm your account, then come back to sign in.");
        return;
      }

      router.replace("/chat");
    } catch (err: any) {
      setMsg(err?.message || "Couldn’t create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-white/60">First time here? Set up your login.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          <label className="block text-xs font-semibold text-white/70">Full name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="First Last"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base outline-none placeholder:text-white/35 focus:border-emerald-300/30"
          />

          <label className="mt-4 block text-xs font-semibold text-white/70">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base outline-none placeholder:text-white/35 focus:border-emerald-300/30"
          />

          <label className="mt-4 block text-xs font-semibold text-white/70">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base outline-none placeholder:text-white/35 focus:border-emerald-300/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") signUp();
            }}
          />

          {msg && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85">
              {msg}
            </div>
          )}

          <button
            type="button"
            onClick={signUp}
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-lime-400 px-4 py-3 text-base font-semibold text-black shadow disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create account"}
          </button>

          <div className="mt-4 text-center text-sm text-white/60">
            Already have an account?{" "}
            <Link href="/login" className="text-emerald-200 hover:text-emerald-100 underline-offset-4 hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
