// Rooftop Audit is temporarily paused (Coming soon). The full implementation is
// preserved in RealRooftopPage.tsx — restore by rendering it here again.
import ComingSoon from "@/app/components/ui/ComingSoon";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ComingSoon
      title="Rooftop Audit"
      message="Rooftop audits are temporarily unavailable. We'll let you know when they're back."
    />
  );
}
