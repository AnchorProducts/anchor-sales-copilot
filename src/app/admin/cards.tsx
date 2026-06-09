// Shared catalog of admin console tools (the bento tiles on /admin).
//
// This is the single source of truth for both the hub (src/app/admin/page.tsx)
// and the activation manager (src/app/admin/tools/page.tsx). Each card carries a
// stable `key` that maps to a row in the public.admin_tools table — that's how an
// admin's activate/deactivate choice survives across renders and deploys. Keys
// must never change once shipped, or a tool's saved state would orphan.

export type IconName =
  | "users" | "chart" | "phone" | "clipboard" | "wallet"
  | "shield" | "camera" | "book" | "image" | "mail" | "briefcase" | "grid" | "lifebuoy" | "play" | "megaphone";

export type AdminCard = {
  key: string;
  title: string;
  description: string;
  badge: "Config" | "Analytics" | "Content";
  href?: string;
  comingSoon?: boolean;
  icon: IconName;
  featured?: boolean;
};

export const CARDS: AdminCard[] = [
  {
    key: "oem-analytics",
    title: "OEM Analytics",
    description: "Manufacturer rep & consultant engagement: the OEM matrix, adoption and usage by OEM, with a matrix PDF export.",
    badge: "Analytics",
    href: "/admin/analytics",
    icon: "chart",
    featured: true,
  },
  {
    key: "user-analytics",
    title: "User Analytics",
    description: "Everyone who isn't an OEM rep or consultant — internal Anchor staff and other signed-up users, with per-user activity PDFs.",
    badge: "Analytics",
    href: "/admin/user-analytics",
    icon: "users",
  },
  {
    key: "users",
    title: "Users",
    description: "Edit names, emails, phone numbers, and roles for every user.",
    badge: "Config",
    href: "/admin/users",
    icon: "users",
  },
  {
    key: "sales-reps",
    title: "Sales Reps",
    description: "Configure inside/outside sales reps, regions, Teams links, and contact info.",
    badge: "Config",
    href: "/admin/sales-reps",
    icon: "phone",
  },
  {
    key: "notifications",
    title: "Notifications",
    description: "Configure email recipients for every form — commission claims, marketing orders, notable projects, support requests — plus the Friday analytics report.",
    badge: "Config",
    href: "/admin/notifications",
    icon: "mail",
  },
  {
    key: "support",
    title: "Support Queue",
    description: "In-app help requests filed by external and internal reps — read, reply, and close threads.",
    badge: "Config",
    href: "/admin/support",
    icon: "lifebuoy",
  },
  {
    key: "projects",
    title: "Projects",
    description: "All submitted opportunities across users and regions.",
    badge: "Analytics",
    href: "/dashboard/opportunities",
    icon: "clipboard",
  },
  {
    key: "commission-claims",
    title: "Commission Claims",
    description: "Every commission claim submitted by external reps, with rep info and order details.",
    badge: "Analytics",
    href: "/admin/commission-claims",
    icon: "wallet",
  },
  {
    key: "rooftop-reports",
    title: "Rooftop Reports",
    description: "All OSHA-guided rooftop equipment audit submissions, with PDFs and flag counts.",
    badge: "Analytics",
    href: "/admin/rooftop-reports",
    icon: "shield",
  },
  {
    key: "rooftop-logic",
    title: "Rooftop Audit Logic",
    description: "View and edit the OSHA decision tree that drives the rooftop audit assessment — questions, branches, and flags.",
    badge: "Config",
    href: "/admin/rooftop-logic",
    icon: "shield",
  },
  {
    key: "notable-projects",
    title: "Notable Projects",
    description: "Submitted notable installations with photos and brief writeups from external reps.",
    badge: "Analytics",
    href: "/admin/notable-projects",
    icon: "camera",
  },
  {
    key: "marketing-orders",
    title: "Marketing Orders",
    description: "Samples, brochure, swag, and collateral orders submitted by internal and external sales reps.",
    badge: "Analytics",
    href: "/admin/marketing-orders",
    icon: "megaphone",
  },
  {
    key: "knowledge",
    title: "Knowledge",
    description: "Curate Copilot knowledge sources, corrections, and indexed content.",
    badge: "Content",
    href: "/admin/knowledge",
    icon: "book",
  },
  {
    key: "asset-reviews",
    title: "Asset Reviews",
    description: "Approve or reject photos submitted by internal reps for solution tackle boxes.",
    badge: "Content",
    href: "/admin/asset-reviews",
    icon: "image",
  },
  {
    key: "walkthroughs",
    title: "Walkthroughs",
    description: "Preview the guided page tours users see when they tap the walkthrough button on each page.",
    badge: "Content",
    href: "/admin/walkthroughs",
    icon: "play",
  },
];

export const BADGE_STYLE: Record<AdminCard["badge"], string> = {
  Analytics: "bg-[var(--anchor-mint)]/60 text-[var(--anchor-deep)]",
  Config: "bg-[#fde68a] text-[#7c4a00]",
  Content: "bg-[#dbeafe] text-[#1e3a8a]",
};

export function TileIcon({ name, className }: { name: IconName; className?: string }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "users":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
          <line x1="3" y1="20" x2="21" y2="20" />
        </svg>
      );
    case "phone":
      return (
        <svg {...props}>
          <path d="M22 16.92V21a1 1 0 0 1-1.11 1A19.86 19.86 0 0 1 2 4.11 1 1 0 0 1 3 3h4.09a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.27 1L7.21 10.21a16 16 0 0 0 6.58 6.58l1.46-1.61a1 1 0 0 1 1-.27l4 1a1 1 0 0 1 .75 1z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...props}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="9" y1="16" x2="13" y2="16" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...props}>
          <path d="M20 12V8H4a2 2 0 0 1 0-4h14v4" />
          <rect x="2" y="6" width="20" height="14" rx="2" />
          <circle cx="16" cy="13" r="1.5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "camera":
      return (
        <svg {...props}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "book":
      return (
        <svg {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "image":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "mail":
      return (
        <svg {...props}>
          <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <polyline points="22 6 12 13 2 6" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...props}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "lifebuoy": // Support — rendered as a question mark.
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "play": // Walkthroughs — "start the tour".
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "megaphone": // Marketing Orders.
      return (
        <svg {...props}>
          <path d="M3 11l15-5v12L3 13v-2z" />
          <path d="M18 8a3 3 0 0 1 0 6" />
          <path d="M6 13v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1.5" />
        </svg>
      );
  }
}
