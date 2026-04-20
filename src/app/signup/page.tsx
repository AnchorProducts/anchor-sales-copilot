"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Field";
import { Alert } from "@/app/components/ui/Alert";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendCode() {
    setMsg(null);

    const name = fullName.trim();
    const co = company.trim();
    const e = email.trim().toLowerCase();

    if (!name) return setMsg("Enter your name.");
    if (!co) return setMsg("Enter your company name.");
    if (!isEmail(e)) return setMsg("Enter a valid email.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { shouldCreateUser: true },
      });

      if (error) throw error;

      setOtpSent(true);
      setMsg("Enter the 6-digit code from your email.");
    } catch (err: any) {
      setMsg(err?.message || "Couldn't send code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setMsg(null);
    const e = email.trim().toLowerCase();
    const code = otp.trim();

    if (code.length < 6) return setMsg("Enter the 6-digit code from your email.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: e, token: code, type: "email" });
      if (error) throw error;

      // Save profile metadata now that the user is verified
      await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          company: company.trim(),
          phone: phone.trim(),
        },
      });

      // Sync tokens → server cookies
      const { data: sdata } = await supabase.auth.getSession();
      const s = sdata.session;
      if (s?.access_token && s?.refresh_token) {
        await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }),
        });
      }

      router.replace("/dashboard");
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
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="mb-12 flex items-center gap-3">
            <img src="/anchorplogin.svg" alt="Anchor" className="ds-logo shrink-0" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-[var(--anchor-black)]">
                Anchor Sales Co-Pilot
              </div>
              <div className="ds-caption">Sales • Assets • Leads</div>
            </div>
          </div>
          <h1 className="text-3xl">Create your account</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">We'll email you a secure login code.</p>

          <label className="mt-5 block text-xs font-semibold text-[var(--anchor-gray)]">Full name</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="First Last"
            autoComplete="name"
            disabled={otpSent}
            className="mt-2"
          />

          <label className="mt-4 block text-xs font-semibold text-[var(--anchor-gray)]">Company name</label>
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Your company"
            autoComplete="organization"
            disabled={otpSent}
            className="mt-2"
          />

          <label className="mt-4 block text-xs font-semibold text-[var(--anchor-gray)]">Phone</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 555-5555"
            disabled={otpSent}
            className="mt-2"
          />

          <label className="mt-4 block text-xs font-semibold text-[var(--anchor-gray)]">Email</label>
          <Input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (otpSent) { setOtpSent(false); setOtp(""); }
            }}
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.com"
            disabled={otpSent}
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
            <Button onClick={sendCode} disabled={loading} className="mt-6 w-full" variant="primary">
              {loading ? "Sending…" : "Send code"}
            </Button>
          ) : (
            <Button onClick={verifyCode} disabled={loading} className="mt-6 w-full" variant="primary">
              {loading ? "Verifying…" : "Verify code"}
            </Button>
          )}

          {otpSent && (
            <Button
              onClick={() => { setOtpSent(false); setOtp(""); setMsg(null); }}
              disabled={loading}
              className="mt-3 w-full"
              variant="secondary"
            >
              Use a different email
            </Button>
          )}
        </Card>

        <p className="ds-caption mt-6 text-center">
          Already have an account?{" "}
          <Link href="/" className="underline underline-offset-2 hover:opacity-80">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
