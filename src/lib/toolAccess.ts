// Tools that are not for everyone.
//
// Most sales tools are gated only by audience (internal vs external) through
// admin_tools. A RESTRICTED tool adds a second gate: an explicit list of people
// an admin names in Manage Tools, stored in public.tool_user_access.
//
// Both gates must pass. Switching the tool off hides it from everyone; being
// off the list hides it from you. Framework-free so client, server, and route
// handlers can all import it.

/** Tool keys that require a per-user grant. Keys match the sales-tool registry. */
export const RESTRICTED_TOOL_KEYS = ["showcase"] as const;

export type RestrictedToolKey = (typeof RESTRICTED_TOOL_KEYS)[number];

export function isRestrictedTool(key: string): key is RestrictedToolKey {
  return (RESTRICTED_TOOL_KEYS as readonly string[]).includes(key);
}

/** Does this grant list allow the tool? Unrestricted tools need no grant. */
export function hasToolAccess(key: string, grants: Iterable<string>): boolean {
  if (!isRestrictedTool(key)) return true;
  for (const g of grants) if (g === key) return true;
  return false;
}
