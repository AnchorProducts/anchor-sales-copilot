// The "tools" admins can assign users to for push notifications. Each key is a
// stable identifier used in notification_tool_assignments.tool_key and in the
// sendPushToTool() calls inside the event routes. Add a tool here + an
// assignment row + a send call to make a new event notifiable.
//
// Keys must never change once shipped, or existing assignments would orphan.

export type NotificationTool = {
  key: string;
  label: string;
  description: string;
};

export const NOTIFICATION_TOOLS: NotificationTool[] = [
  {
    key: "new_consult",
    label: "New consult",
    description: "A rep submits a new consult / opportunity.",
  },
  {
    key: "marketing_order",
    label: "Marketing order placed",
    description: "A rep submits a marketing order (samples, brochures, swag, …).",
  },
  {
    key: "marketing_order_status",
    label: "Marketing order status change",
    description: "An order moves to processing, shipped, fulfilled, or cancelled.",
  },
  {
    key: "commission_claim",
    label: "Commission claim",
    description: "An external rep submits a commission claim.",
  },
  {
    key: "notable_project",
    label: "Notable project",
    description: "A rep submits a notable installation with photos.",
  },
  {
    key: "support_request",
    label: "Support request",
    description: "A rep files an in-app help / support request.",
  },
  {
    key: "asset_review",
    label: "Photo for review",
    description: "An internal rep uploads a tackle-box photo awaiting approval.",
  },
  {
    key: "weekly_report",
    label: "Weekly analytics report",
    description: "The Friday analytics summary — email + push.",
  },
  {
    key: "document_revision",
    label: "Document revision change",
    description: "A controlled document's revision label is updated (update the QMS master).",
  },
];

export const NOTIFICATION_TOOL_KEYS = NOTIFICATION_TOOLS.map((t) => t.key);

export function isNotificationTool(key: string): boolean {
  return NOTIFICATION_TOOL_KEYS.includes(key);
}
