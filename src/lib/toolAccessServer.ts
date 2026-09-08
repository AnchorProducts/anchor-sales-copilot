import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isRestrictedTool } from "@/lib/toolAccess";

/* ============================================================================
 * Server-side enforcement of the per-user tool grants.
 *
 * Hiding a tile is a courtesy; this is the actual gate. Fails CLOSED — a
 * missing grant, an unreadable token, or a query error all mean no access.
 * ==========================================================================*/

/** Is this user on the named list for this tool? Unrestricted tools: always. */
export async function userHasToolAccess(userId: string, toolKey: string): Promise<boolean> {
  if (!isRestrictedTool(toolKey)) return true;
  try {
    const { data, error } = await supabaseAdmin
      .from("tool_user_access")
      .select("tool_key")
      .eq("tool_key", toolKey)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export type ToolGate =
  | { userId: string }
  | { error: string; status: 401 | 403 };

/**
 * Resolve a bearer token to a user and check their grant in one step.
 *
 * The token is the caller's own Supabase access token — the same one the
 * website verifies. We verify it here too rather than trusting the client,
 * because the grant is keyed on the user id it resolves to.
 */
export async function requireToolAccessFromBearer(
  token: string,
  toolKey: string
): Promise<ToolGate> {
  if (!token) return { error: "Not signed in.", status: 401 };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const user = error ? null : data?.user;
  if (!user) return { error: "Not signed in.", status: 401 };

  const allowed = await userHasToolAccess(user.id, toolKey);
  if (!allowed) {
    return {
      error: "You're not assigned to the mobile showcase. Ask an admin to add you in Manage Tools.",
      status: 403,
    };
  }
  return { userId: user.id };
}
