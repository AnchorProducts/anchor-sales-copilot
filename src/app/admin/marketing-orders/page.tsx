// Standalone route kept for deep links (notifications point here). The shared
// panel also powers the Marketing Admin Center (/admin/marketing).
import OrdersPanel from "./OrdersPanel";

export const dynamic = "force-dynamic";

export default function Page() {
  return <OrdersPanel />;
}
