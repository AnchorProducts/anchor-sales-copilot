// Marketing Hub → Submissions. The queue itself lives in SubmissionsPanel, which
// is shared with the Marketing Admin Center's Submissions tab.
import SubmissionsPanel from "./SubmissionsPanel";

export const dynamic = "force-dynamic";

export default function SubmissionsPage() {
  return <SubmissionsPanel />;
}
