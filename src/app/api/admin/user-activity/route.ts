import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as { role?: string } | null)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  created_at: string | null;
};

type ConversationRow = { user_id: string | null };
type LeadRow = { user_id: string | null };
type ReportRow = {
  id: string;
  contractor_name: string | null;
  company_name: string | null;
  access_type: string | null;
  created_at: string;
  file_url: string | null;
  flags_count: number | null;
  user_id: string | null;
};

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: users, error: usersErr } = await supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,company,phone,created_at")
    .eq("user_type", "external")
    .order("created_at", { ascending: false });

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

  const userIds = (users ?? []).map((u: ProfileRow) => u.id);

  const [convRes, leadRes, reportRes] = await Promise.all([
    userIds.length
      ? supabaseAdmin
          .from("conversations")
          .select("user_id")
          .in("user_id", userIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as ConversationRow[], error: null }),
    userIds.length
      ? supabaseAdmin.from("leads").select("user_id").in("user_id", userIds)
      : Promise.resolve({ data: [] as LeadRow[], error: null }),
    supabaseAdmin
      .from("assessment_reports")
      .select("id,contractor_name,company_name,access_type,created_at,file_url,flags_count,user_id")
      .order("created_at", { ascending: false }),
  ]);

  const convCounts: Record<string, number> = {};
  for (const row of (convRes.data ?? []) as ConversationRow[]) {
    if (row.user_id) convCounts[row.user_id] = (convCounts[row.user_id] ?? 0) + 1;
  }

  const leadCounts: Record<string, number> = {};
  for (const row of (leadRes.data ?? []) as LeadRow[]) {
    if (row.user_id) leadCounts[row.user_id] = (leadCounts[row.user_id] ?? 0) + 1;
  }

  const reports: ReportRow[] = (reportRes.data ?? []) as ReportRow[];

  const rows = (users ?? []).map((u: ProfileRow) => ({
    ...u,
    conversationCount: convCounts[u.id] ?? 0,
    leadCount: leadCounts[u.id] ?? 0,
    reports: reports.filter(
      (r) => r.user_id === u.id || (!r.user_id && r.company_name === u.company)
    ),
  }));

  return NextResponse.json({ users: rows });
}
