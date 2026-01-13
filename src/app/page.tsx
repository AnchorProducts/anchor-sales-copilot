// src/app/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function LoginHome() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-[#F6F7F8] text-black">
          <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-10">
            <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="text-sm text-[#76777B]">Loading…</div>
            </div>
          </div>
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextUrl = useMemo(() => sp.get("next") || "/dashboard", [sp]);

  const supabase = useMemo(() => supabaseBrowser(), []);

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // If already authed, go to dashboard
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (data.session) router.replace("/dashboard");
    })();
    return () => {
      alive = false;
    };
  }, [supabase, router]);

  // Show auth errors from URL hash
  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const desc = params.get("error_description");
    if (desc) setMsg(desc.replace(/\+/g, " "));

    window.history.replaceState({}, "", window.location.pathname + window.location.search);
  }, []);

  function reset() {
    setOtpSent(false);
    setOtp("");
  }

  async function sendCode() {
    setMsg(null);

    const e = email.trim().toLowerCase();
    if (!isEmail(e)) return setMsg("Enter a valid email.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          shouldCreateUser: true,
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`
              : undefined,
        },
      });

      if (error) throw error;

      setOtpSent(true);
      setMsg("Enter the 8-digit code from your email.");
    } catch (err: any) {
      setMsg(err?.message || "Couldn’t send code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setMsg(null);

    const e = email.trim().toLowerCase();
    const code = otp.trim();

    if (!isEmail(e)) return setMsg("Enter a valid email.");
    if (code.length < 6) return setMsg("Enter the 6–8 digit code.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: e,
        token: code,
        type: "email",
      });

      if (error) throw error;

      router.replace(nextUrl);
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || "Invalid code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#F6F7F8] text-black">
      {/* Top band (matches dashboard) */}
      <div className="border-b border-black/10 bg-gradient-to-r from-[#11500F] via-[#047835] to-[#047835]">
        <div className="mx-auto max-w-md px-5 py-8">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
              <img src="/anchorp.svg" alt="Anchor" className="h-10 w-auto" />
            </div>

            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide text-white">
                Anchor Sales Co-Pilot
              </div>
              <div className="text-[12px] text-white/80">Docs • Specs • Install • Downloads</div>
            </div>
          </div>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">Sign in</h1>
          <p className="mt-2 text-sm text-white/80">
            We’ll email you a secure 8-digit code. Fast, simple, mobile-ready.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-md px-5 pb-10 pt-8">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <label className="block text-xs font-semibold text-black/70">Email</label>
          <input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (otpSent) reset();
            }}
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.com"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-base outline-none placeholder:text-[#76777B] focus:border-[#047835]"
          />

          {!otpSent ? (
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-[#76777B]">We’ll send an 8-digit code.</div>
              <Link
                href="/signup"
                className="text-xs font-semibold text-[#047835] hover:underline underline-offset-4"
              >
                First time user
              </Link>
            </div>
          ) : (
            <>
              <label className="mt-4 block text-xs font-semibold text-black/70">8-digit code</label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="12345678"
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-base outline-none placeholder:text-[#76777B] focus:border-[#047835]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") verifyCode();
                }}
              />

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={loading}
                  className="text-xs font-semibold text-black/60 hover:text-black underline-offset-4 hover:underline disabled:opacity-60"
                >
                  Resend code
                </button>

                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setMsg(null);
                  }}
                  className="text-xs font-semibold text-[#047835] hover:underline underline-offset-4"
                >
                  Change email
                </button>
              </div>
            </>
          )}

          {msg && (
            <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.03] px-4 py-3 text-sm text-black/80">
              {msg}
            </div>
          )}

          {!otpSent ? (
            <button
              type="button"
              onClick={sendCode}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[#047835] px-4 py-3 text-base font-semibold text-white shadow hover:bg-[#11500F] disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send code"}
            </button>
          ) : (
            <button
              type="button"
              onClick={verifyCode}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[#047835] px-4 py-3 text-base font-semibold text-white shadow hover:bg-[#11500F] disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify code"}
            </button>
          )}

          
        </div>

        <p className="mt-6 text-center text-[11px] text-[#76777B]">
          If you don’t have access, ask an admin to enable your account.
        </p>
      </div>
    </main>
  );
}
