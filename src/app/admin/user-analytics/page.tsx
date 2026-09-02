// The User Analytics page merged into the one analytics dashboard: it fetched
// the same endpoint as OEM Analytics and split the result by contact_type,
// which meant two windows, two search boxes and two answers to "who is this
// person". The route stays as a redirect so old links and bookmarks land
// somewhere useful — on the People panel, which is what they were after.
import { redirect } from "next/navigation";

export default function AdminUserAnalyticsRedirect() {
  redirect("/admin/analytics?view=people");
}
