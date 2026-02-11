// src/app/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Field";
import { Alert } from "@/app/components/ui/Alert";

export const dynamic = "force-dynamic";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function LoginHome() {
  return (
    <Suspense fallback={<FullScreenLoading />}>
      <LoginInner />
    </Suspense>
  );
}

function FullScreenLoading() {
  return (
    <main className="ds-page flex min-h-dvh items-center justify-center">
      <div className="ds-toast ds-alert-neutral max-w-sm">Loading…</div>
    </main>
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

  // If already signed in → go to dashboard (and ensure cookies exist)
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (data.session) {
        // Best-effort: sync cookies in case this session is only localStorage
        try {
          const s = data.session;
          await fetch("/api/auth/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: s.access_token,
              refresh_token: s.refresh_token,
            }),
          });
        } catch {
          // non-fatal
        }

        router.replace(nextUrl);
        router.refresh();
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase, router, nextUrl]);

  function resetOtp() {
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
          // Keep redirect for email link flows, but OTP verify still happens on this page.
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`
              : undefined,
        },
      });

      if (error) throw error;

      setOtpSent(true);
      setMsg("Enter the 6-digit code from your email.");
    } catch (err: any) {
      setMsg(err?.message || "Couldn’t send code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setMsg(null);
    const e = email.trim().toLowerCase();
    const code = otp.trim();

    if (!isEmail(e)) return setMsg("Enter a valid email.");
    if (code.length < 6) return setMsg("Enter the 6-digit code from your email.");

    setLoading(true);
    try {
      // 1) Verify OTP (client)
      const { error } = await supabase.auth.verifyOtp({
        email: e,
        token: code,
        type: "email",
      });

      if (error) throw error;

      // 2) Read session tokens from client
      const { data: sdata } = await supabase.auth.getSession();
      const s = sdata.session;

      if (!s?.access_token || !s?.refresh_token) {
        // This should not happen after successful verifyOtp, but handle it cleanly.
        throw new Error("Signed in, but session tokens were missing. Please retry.");
      }

      // 3) Sync tokens → server cookies (required so /api/doc-open works in new tab)
      const syncRes = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
        }),
        cache: "no-store",
      });

      const syncJson: any = await syncRes.json().catch(() => null);

      if (!syncRes.ok || !syncJson?.ok) {
        console.error("auth sync failed", syncRes.status, syncJson);
        // Don’t block login; but warn so you can debug.
        setMsg("Signed in, but server cookies failed to sync. Try refreshing once.");
      }

      router.replace(nextUrl);
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ds-page flex min-h-dvh items-center justify-center px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-3">
          <img src="/anchorp.svg" alt="Anchor" className="ds-logo shrink-0" />
          <div>
            <div className="text-sm font-semibold tracking-wide text-[var(--anchor-black)]">
              Anchor Sales Co-Pilot
            </div>
            <div className="ds-caption">Docs • Specs • Install • Downloads</div>
          </div>
        </div>

        {/* Card */}
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-6">
          <h1 className="text-3xl">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">We’ll email you a secure login code.</p>

          <label className="mt-5 block text-xs font-semibold text-[var(--anchor-gray)]">Email</label>
          <Input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (otpSent) resetOtp();
            }}
            placeholder="name@company.com"
            autoComplete="email"
            className="mt-2"
          />

          {otpSent && (
            <>
              <label className="mt-4 block text-xs font-semibold text-[var(--anchor-gray)]">Code</label>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mt-2"
                onKeyDown={(e) => e.key === "Enter" && verifyCode()}
              />
            </>
          )}

          {msg && (
            <Alert className="mt-4" tone="neutral">
              {msg}
            </Alert>
          )}

          {!otpSent ? (
            <Button
              onClick={sendCode}
              disabled={loading}
              className="mt-6 w-full"
              variant="primary"
            >
              {loading ? "Sending…" : "Send code"}
            </Button>
          ) : (
            <Button
              onClick={verifyCode}
              disabled={loading}
              className="mt-6 w-full"
              variant="primary"
            >
              {loading ? "Verifying…" : "Verify code"}
            </Button>
          )}

          {otpSent && (
            <Button
              type="button"
              onClick={() => {
                resetOtp();
                setMsg(null);
              }}
              disabled={loading}
              className="mt-3 w-full"
              variant="secondary"
            >
              Use a different email
            </Button>
          )}
        </Card>

        <p className="ds-caption mt-6 text-center">
          If you don’t have access, ask an admin to enable your account.
        </p>
      </div>
    </main>
  );
}
