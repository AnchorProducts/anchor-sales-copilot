// Standalone route kept for deep links (low-stock notifications point here). The
// shared panel also powers the Marketing Admin Center (/admin/marketing).
import InventoryPanel from "./InventoryPanel";

export const dynamic = "force-dynamic";

export default function Page() {
  return <InventoryPanel />;
}
