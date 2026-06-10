import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quick health check for whether THIS deployment can send web push. Visit it on
// any environment (e.g. the external app) to confirm its VAPID keys are set.
// Returns only booleans — no secrets.
export async function GET() {
  const hasPublic = Boolean(process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const hasPrivate = Boolean(process.env.VAPID_PRIVATE_KEY);
  return NextResponse.json({
    configured: hasPublic && hasPrivate,
    hasPublicKey: hasPublic,
    hasPrivateKey: hasPrivate,
    hasSubject: Boolean(process.env.VAPID_SUBJECT),
  });
}
