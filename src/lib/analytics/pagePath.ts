// Map raw request paths (the page_path stored on user_events) into the
// human-readable page names admins recognize. Used by the User Activity
// report UI and the PDF export so paths render consistently everywhere.

type Rule = { pattern: RegExp; label: string };

// Order matters — more specific patterns must come before broader ones.
const RULES: Rule[] = [
  // Auth / marketing
  { pattern: /^\/$/, label: "Sign in" },
  { pattern: /^\/signup$/, label: "Sign up" },
  { pattern: /^\/forgot$/, label: "Forgot password" },
  { pattern: /^\/reset$/, label: "Reset password" },

  // Top-level
  { pattern: /^\/dashboard$/, label: "Dashboard" },
  { pattern: /^\/chat(?:\/.*)?$/, label: "Copilot" },

  // Assets / Resource Library
  { pattern: /^\/assets$/, label: "Resource Library" },
  { pattern: /^\/assets\/.+$/, label: "Resource Library · Product" },

  // Internal assets
  { pattern: /^\/internal-assets\/contacts\/.+$/, label: "Internal Contacts" },
  { pattern: /^\/internal-assets\/docs\/.+$/, label: "Internal Documents" },
  { pattern: /^\/internal-assets(?:\/.*)?$/, label: "Internal Assets" },

  // Doc viewer
  { pattern: /^\/docs\/view(?:\/.*)?$/, label: "Document Viewer" },

  // External-rep workflows
  { pattern: /^\/dashboard\/opportunities\/new$/, label: "Rooftop Equipment Consult · New" },
  { pattern: /^\/dashboard\/opportunities\/.+$/, label: "Rooftop Equipment Consult · Detail" },
  { pattern: /^\/dashboard\/opportunities$/, label: "Active Consults" },
  { pattern: /^\/dashboard\/commission\/new$/, label: "Commission Claim Form" },
  { pattern: /^\/dashboard\/commission(?:\/.*)?$/, label: "Commission Claims" },
  { pattern: /^\/dashboard\/notable-projects\/new$/, label: "Notable Project · New" },
  { pattern: /^\/dashboard\/notable-projects(?:\/.*)?$/, label: "Notable Projects" },

  // Settings / reports
  { pattern: /^\/dashboard\/settings(?:\/.*)?$/, label: "Settings" },
  { pattern: /^\/dashboard\/reports(?:\/.*)?$/, label: "User Activity" },

  // Admin console
  { pattern: /^\/admin$/, label: "Admin Console" },
  { pattern: /^\/admin\/users(?:\/.*)?$/, label: "Admin · Users" },
  { pattern: /^\/admin\/sales-reps(?:\/.*)?$/, label: "Admin · Sales Reps" },
  { pattern: /^\/admin\/rooftop-reports(?:\/.*)?$/, label: "Admin · Rooftop Reports" },
  { pattern: /^\/admin\/notable-projects(?:\/.*)?$/, label: "Admin · Notable Projects" },
  { pattern: /^\/admin\/knowledge(?:\/.*)?$/, label: "Admin · Knowledge" },
  { pattern: /^\/admin\/asset-reviews(?:\/.*)?$/, label: "Admin · Asset Reviews" },
  { pattern: /^\/admin\/learning(?:\/.*)?$/, label: "Admin · Learning" },
];

export function prettyPagePath(path: string | null | undefined): string {
  const p = (path || "").trim();
  if (!p) return "—";
  for (const r of RULES) {
    if (r.pattern.test(p)) return r.label;
  }
  return p; // fall back to the raw path if we haven't named it
}
