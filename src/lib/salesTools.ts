// Catalog of the rep-facing "sales tools" — the Quick Action tiles a sales rep
// sees on /dashboard. Admins can activate/deactivate each one PER AUDIENCE
// (internal vs external) from /admin/tools.
//
// Activation lives in the same public.admin_tools table as the admin console
// cards, under composite keys `sales:<audience>:<tool key>`. A key with no row
// is active, so tools light up by default and new entries need no backfill.
//
// `key` MUST match the dashboard Action `key` for the corresponding tile
// (src/app/dashboard/page.tsx) so the dashboard can filter by it.

import type { IconName } from "@/app/admin/cards";

export type SalesAudience = "internal" | "external";

export type SalesTool = {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  audiences: SalesAudience[];
};

export const SALES_TOOLS: SalesTool[] = [
  {
    key: "assets",
    label: "Resource Library",
    description: "Browse solution tackle boxes, spec sheets, and Anchor assets.",
    icon: "book",
    audiences: ["internal", "external"],
  },
  {
    key: "chat",
    label: "Copilot (AI)",
    description: "Solution recommendations and next-step guidance.",
    icon: "grid",
    audiences: ["internal", "external"],
  },
  {
    key: "project",
    label: "Rooftop Equipment Consult",
    description: "New request from someone new to Anchor who needs a rep's help (not a quote).",
    icon: "clipboard",
    audiences: ["internal", "external"],
  },
  {
    key: "project-intake",
    label: "Project Intake (Quote)",
    description: "Quote request from an existing customer — project specs, optional FM details.",
    icon: "clipboard",
    audiences: ["internal", "external"],
  },
  {
    key: "rooftop",
    label: "Rooftop Equipment Audit",
    description: "OSHA-guided rooftop access & egress safety verification (produces a Rooftop Report).",
    icon: "shield",
    audiences: ["internal", "external"],
  },
  {
    key: "notable",
    label: "Notable Projects",
    description: "Submit a notable rooftop project for the showcase.",
    icon: "camera",
    audiences: ["internal", "external"],
  },
  {
    key: "commission",
    label: "Commission Claim",
    description: "File a commission claim (also gated per-user by the commission flag).",
    icon: "wallet",
    audiences: ["external"],
  },
  {
    key: "consults",
    label: "Active Consults",
    description: "Triage rooftop equipment consults submitted by external reps in your region.",
    icon: "clipboard",
    audiences: ["internal"],
  },
  {
    key: "marketing-orders",
    label: "Marketing Orders",
    description: "Order samples, brochures, swag, and other marketing collateral.",
    icon: "package",
    audiences: ["internal", "external"],
  },
];

// Composite admin_tools key for a sales tool in a given audience.
export function salesToolKey(audience: SalesAudience, toolKey: string): string {
  return `sales:${audience}:${toolKey}`;
}

// The dashboard hero promotes a "top feature" whose feature key sometimes
// differs from the Action key. Only `consults` (the hero feature) maps to the
// `project` Action tile; everything else is 1:1. Used to keep a deactivated
// tool from being promoted in the hero.
export const HERO_FEATURE_TO_TOOL_KEY: Record<string, string> = {
  chat: "chat",
  assets: "assets",
  consults: "project",
  commission: "commission",
  notable: "notable",
};
