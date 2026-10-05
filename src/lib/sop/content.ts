// src/lib/sop/content.ts
//
// The in-app SOP (/admin/sop). Written for whoever is covering marketing or
// admin: exact button and tab names in **bold**, steps in order, and the
// surprises called out. When a tool changes, update its section here and bump
// SOP_REVIEWED so readers can tell how fresh it is.

export type SopAudience = "start" | "admin" | "internal" | "external" | "fixes";

export type SopBlock = {
  heading: string;
  steps?: string[];
  bullets?: string[];
  note?: string;
};

export type SopSection = {
  id: string;
  audience: SopAudience;
  title: string;
  where?: string;
  href?: string;
  summary: string;
  blocks: SopBlock[];
};

export const SOP_REVIEWED = "2026-09-30";

export const SOP_AUDIENCES: { value: SopAudience; label: string; hint: string }[] = [
  { value: "start", label: "Start here", hint: "How the app is put together, the roles, and the daily and weekly routine. Read this first." },
  { value: "admin", label: "Admin", hint: "Every tile in the Admin Console, and the marketing tools inside it." },
  { value: "internal", label: "Internal", hint: "What Anchor staff (role Internal sales) see and do in the Anchor Internal app." },
  { value: "external", label: "External", hint: "What outside partner reps (role External) see and do in the Anchor App, plus the public pages that need no login." },
  { value: "fixes", label: "Fixes", hint: "What people report, the likely cause, and the fix. Work down this before asking a developer." },
];

export const SOP_SECTIONS: SopSection[] = [
  /* ───────────────────────────── Start here ───────────────────────────── */
  {
    id: "overview",
    audience: "start",
    title: "What this app is",
    summary:
      "The Anchor Sales Co-Pilot is where reps submit work (consults, quote requests, commission claims, notable projects, marketing orders, support requests), where Anchor routes that work to the right person, and where everyone finds product documents and asks the Copilot.",
    blocks: [
      {
        heading: "Two sites, one app",
        bullets: [
          "**Anchor Internal** (anchor-internal.vercel.app) is for Anchor staff: admins and internal sales. It sits behind a Vercel login.",
          "**Anchor App** (anchor-sales-copilot.vercel.app) is for outside partner reps. It is also the public domain, so QR codes and website document links point here.",
          "Both run the same code and update together from every release. What a person sees depends on their **role**, not on which address they typed.",
          "Emails link each person to their own site: outside reps get the Anchor App link, everyone else gets Anchor Internal.",
        ],
      },
      {
        heading: "It installs like a phone app",
        bullets: [
          "On a phone browser, both sites show an install screen first. iPhone: open in **Safari** → Share → **Add to Home Screen** → **Add**. Android: **Install app**.",
          "**Continue in browser** skips the install screen for that browser session only.",
          "Push notifications only work from the installed app on iPhone, and each person turns them on in **Settings → Notifications → Enable notifications**.",
        ],
      },
      {
        heading: "Signing in",
        steps: [
          "Enter an email on the sign-in page and tap **Send code**.",
          "Type the 8-digit code from the email and tap **Verify code**.",
        ],
        note: "There are no passwords. The **Forgot / Reset password** pages are leftovers; always point people to the emailed code.",
      },
    ],
  },
  {
    id: "roles",
    audience: "start",
    title: "Roles and View as",
    href: "/admin/users",
    where: "Admin Console → Users",
    summary:
      "There are three roles. A new person's role is set automatically the first time they sign in, from their email domain. Only an admin can change it afterwards.",
    blocks: [
      {
        heading: "The three roles",
        bullets: [
          "**External** — outside partner and OEM reps. Forms, Copilot, Resource Library, Marketing Orders, Support. No queues, no admin.",
          "**Internal sales** — Anchor staff. Everything External has (except Commission Claims) plus **Active Consults**, internal documents, tradeshow gear, Showcase (if granted) and the marketing fulfillment screens.",
          "**Admin** — everything, including the Admin Console.",
          "Emails at **anchorp.com**, **icalcit.com** and **rte-solutions.com** start as Internal sales. Everyone else starts as External. Nobody needs approval to sign up.",
        ],
      },
      {
        heading: "Change someone's role",
        steps: [
          "Open **Admin Console → Users** and search for the person.",
          "Click their row, pick a **Role** chip (Admin / Internal sales / External) and click **Save**.",
          "Ask them to refresh or sign out and back in.",
        ],
        note: "You can't change your own role — another admin has to.",
      },
      {
        heading: "View as (see the app as a rep does)",
        steps: [
          "Click the floating role pill (bottom-right on desktop, top-centre on a phone). Only admins have it.",
          "Choose **Admin**, **Internal sales** or **External user**. The page reloads and the pill turns amber: \"Viewing as …\".",
          "When you're done, pick **Admin** again.",
        ],
        bullets: [
          "Admins don't see the submission forms. To test a form or place a test order, View as a sales role.",
          "It only changes what you *see*. Anything you submit is still done by your admin account, and the server still treats you as an admin.",
          "It's remembered in this browser. If the Admin Console seems to have vanished, the pill is still set to a sales role.",
        ],
      },
    ],
  },
  {
    id: "rhythm",
    audience: "start",
    title: "Daily, weekly and monthly routine",
    summary: "The minimum routine that keeps nothing sitting unanswered.",
    blocks: [
      {
        heading: "Every morning",
        steps: [
          "**Marketing Admin Center → Orders** — move anything on **New** to **Processing**, or message the rep. Check that each order has an **Assigned to** person.",
          "**Active Consults** (Projects tile) — every consult and quote request on **New** should get an assignee.",
          "**Support Queue** — reply to anything **Open**. Reps' follow-up replies don't notify anyone, so look even if no email arrived.",
          "**Asset Reviews** — approve or reject pending photos. Nobody sees them until you do.",
          "**Inventory** — glance at the pills at the top: low stock, overdue loans, kit pieces not set up.",
        ],
      },
      {
        heading: "Weekly",
        bullets: [
          "**Friday** — the analytics report emails itself at 17:00 UTC (1 PM Eastern in summer). Confirm it arrived.",
          "**Inventory → Checkouts** — chase overdue tradeshow loans. There is no automatic reminder.",
          "**Commission Claims** and **Notable Projects** — read what came in. Both are read-only lists.",
          "**Knowledge → Corrections** — approve or reject Copilot corrections.",
        ],
      },
      {
        heading: "Monthly",
        bullets: [
          "**Notifications** — walk every event and make sure the people listed still work here and still own that job.",
          "**Sales Reps** — every state should have an outside and an inside rep, and each rep's email must match their app login.",
          "**Users** — downgrade or delete people who have left.",
          "**Product of the Month** — update both places (see the Product of the Month section).",
        ],
      },
    ],
  },
  {
    id: "onboarding",
    audience: "start",
    title: "Onboarding and offboarding",
    summary: "Checklists for when someone joins or leaves.",
    blocks: [
      {
        heading: "An Anchor employee joins",
        steps: [
          "They sign in once with their company email. That creates them as Internal sales.",
          "**Users** — make them an Admin if they need the console.",
          "**Notifications** — add them to every event they own.",
          "**Sales Reps** — if they carry a territory, add them with their states (and ZIP prefixes if a state is shared). Use the same email they sign in with.",
          "**Manage tools → Showcase Stop** — assign them if they run showcase stops.",
          "**Portal Access** — add their email with the right level and team if they need the Anchor Internal Portal.",
          "Tell them to install the app on their phone and turn on notifications in Settings.",
        ],
      },
      {
        heading: "An outside rep joins",
        steps: [
          "They sign in once with their own email. That creates them as External.",
          "**Users** — tick **Anchor commission** if they may file commission claims. Without it the form bounces them.",
          "Ask them to add their **Service area** states in **Settings** (and a ZIP if Texas), so **Contact Your Rep** and marketing orders find the right people.",
          "Check **Sales Reps** covers their states.",
        ],
      },
      {
        heading: "Someone leaves",
        steps: [
          "**Sales Reps** — reassign their states first. An uncovered state means consults and marketing orders reach nobody in that region.",
          "**Notifications** — remove them from every event, including any \"Marketing order — {Name}'s region\" entries.",
          "Reassign their open orders, consults and support threads.",
          "**Portal Access** — remove them.",
          "**Users** — change their role, or delete them with the trash icon (their submissions are kept as \"Deleted user\").",
        ],
      },
    ],
  },
  {
    id: "no-touch",
    audience: "start",
    title: "What not to touch",
    summary: "These live outside the app. Leave them to a developer.",
    blocks: [
      {
        heading: "Hands off",
        bullets: [
          "The Supabase dashboard and SQL editor. Every admin task has a screen in the app.",
          "Uploading straight into storage buckets. Upload through the tackle box so the app records the file.",
          "Vercel settings, environment variables, email sending (Resend), push keys, scheduled jobs and NetSuite credentials.",
          "Renaming or moving files in the bucket. Links on anchorp.com point at exact paths and break silently.",
        ],
        note: "When you escalate, send: who (email and role), the page address, what they clicked, the exact error text, phone or desktop, and a screenshot.",
      },
    ],
  },

  /* ─────────────────────────────── Admin ─────────────────────────────── */
  {
    id: "admin-console",
    audience: "admin",
    title: "Admin Console and Manage tools",
    where: "/admin · /admin/tools",
    href: "/admin/tools",
    summary:
      "The Admin Console is the grid of tiles. **Manage tools** (top right) switches tiles and rep tools on and off. Every switch saves the moment you click it.",
    blocks: [
      {
        heading: "Manage tools",
        bullets: [
          "**Site live** — releases **All Documents** and **Portal Access**. Off means hidden from everyone, admins included. **Take offline** asks you to confirm.",
          "**Admin Console tools** — a tile switched off is hidden from everyone else and shows **Inactive** to admins.",
          "**Sales rep tools** — separate **INTERNAL** and **EXTERNAL** switches per tool. Off removes the tile from reps' dashboards.",
          "**Showcase Stop** — only named people get it: **Assign people** → search → tick names → **Done**. With nobody assigned it's hidden.",
        ],
      },
      {
        heading: "Tiles you'll see",
        bullets: [
          "**Rooftop Reports** and **Rooftop Audit Logic** say Coming soon and can't be opened. Not a bug.",
          "**Projects** opens Active Consults (/dashboard/opportunities).",
          "**Contacts** (manufacturer reps) has no tile — it's in the Analytics menu.",
        ],
      },
    ],
  },
  {
    id: "notifications",
    audience: "admin",
    title: "Notifications — who gets told",
    where: "/admin/notifications",
    href: "/admin/notifications",
    summary:
      "The most important setting in the app. Every form and event has a list of people to tell. **An event with nobody on it is silent** — submissions arrive and no one is told.",
    blocks: [
      {
        heading: "Add or remove a recipient",
        steps: [
          "Find the event.",
          "**+ Add user…** for someone with an app login (they get email and push), or **+ Add email…** for a shared inbox (email only).",
          "Click **×** on a name to remove it. Each change saves straight away.",
        ],
        note: "Adding a user doesn't turn on their push. They have to do that on their own phone in Settings → Notifications.",
      },
      {
        heading: "The events",
        bullets: [
          "**New consult** — a rep submits a consult. (The reps covering the project's state are also emailed automatically.)",
          "**Rooftop Equipment Intake (FM)** — a Project Intake / quote request.",
          "**Marketing order placed** — any new marketing order, and messages reps post on their orders.",
          "**Marketing order status change** — every status change, plus the due-date reminder for unassigned orders.",
          "**Marketing order — {Name}'s region** — one per inside rep in Sales Reps. The regional manager for outside reps' orders.",
          "**Commission claim**, **Notable project**, **Support request**, **Photo for review**.",
          "**Inventory low stock** — an item first drops to its low-stock level.",
          "**Marketing aisle pickup** — aisle QR pickups, pizza-box scans and returns.",
          "**Document replaced** — a library file was replaced in place.",
          "**Weekly analytics report** — the Friday email.",
        ],
      },
      {
        heading: "Sent to one person automatically (nothing to set up)",
        bullets: [
          "Reps covering a project's state: \"New consult in your region\".",
          "The inside rep a marketing order is auto-assigned to, and anyone you assign an order to by hand.",
          "The rep who placed an order: when it ships, is tagged custom, gets a message from the team, or is due tomorrow.",
        ],
        note: "Deleting and re-adding an inside rep in Sales Reps creates a new region entry — assign its manager again.",
      },
    ],
  },
  {
    id: "sales-reps",
    audience: "admin",
    title: "Sales Reps — territories",
    where: "/admin/sales-reps",
    href: "/admin/sales-reps",
    summary:
      "The territory table. It decides who hears about each consult, who a marketing order is assigned to, which regional manager is told, and which rep an outside rep sees under **Contact Your Rep**.",
    blocks: [
      {
        heading: "Add a salesperson",
        steps: [
          "Fill **Type** (External = outside rep, Internal = inside rep), **Name**, **Email**.",
          "Add a **Teams Link** for outside reps.",
          "**States Covered** — e.g. TX, OK, NM.",
          "**ZIP sub-territory** — optional 3-digit ZIP prefixes when two reps split a state (e.g. Houston/Gulf vs the rest of Texas).",
          "Click **Add Salesperson**. Use **Edit** → **Save Changes** to update one.",
        ],
        note: "The email must match the person's app login exactly, or orders and consults can't find them.",
      },
    ],
  },
  {
    id: "users",
    audience: "admin",
    title: "Users",
    where: "/admin/users",
    href: "/admin/users",
    summary:
      "One list of everyone: app logins and OEM roster contacts, merged. Edit names, contact details, service states, OEM details, the commission flag and roles.",
    blocks: [
      {
        heading: "Edit someone",
        steps: [
          "Search or use **Filters → Type**.",
          "Click the row. Edit **Profile**, **Type**, **OEM details** as needed.",
          "Tick **Anchor commission** to unlock the Commission Claim form for an outside rep.",
          "**Send password reset** isn't needed — sign-in uses emailed codes.",
          "Click **Save**.",
        ],
      },
      {
        heading: "Delete someone",
        steps: [
          "Use the **trash icon on the row** (not the Delete button inside the editor — it has no preview).",
          "Read what will be erased (login, profile, activity, notification assignments) and kept (their consults, claims, projects, messages, support requests show as \"Deleted user\").",
          "Type their name or email and click **Delete permanently**.",
        ],
        note: "Changing someone's Type to **App user** removes their OEM roster entry.",
      },
    ],
  },
  {
    id: "marketing-orders",
    audience: "admin",
    title: "Marketing orders — fulfillment",
    where: "Marketing Admin Center → Orders · /admin/marketing?tab=orders",
    href: "/admin/marketing?tab=orders",
    summary:
      "The queue for pizza boxes (samples), swag, printables, Product of the Month and OEM custom-printed orders. Admins see every order; inside reps see their territory's orders, orders assigned to them and their own.",
    blocks: [
      {
        heading: "Status path",
        bullets: [
          "**New → Processing → Shipped → Fulfilled.** **Delayed** and **Cancelled** sit off to the side. **Archived** holds Fulfilled and Cancelled.",
          "At **Shipped**, the rep is emailed and asked to tap **Mark as Received**, which moves the order to Fulfilled.",
        ],
      },
      {
        heading: "Work an order",
        steps: [
          "Open **Active**. Use the pills **OEM**, **Custom orders**, **Assigned to me** to narrow it.",
          "Click an order. Read **Needed by**, the items, **Ship to**, notes, and for OEM orders the artwork under **Shared files**.",
          "Check **Assigned to** (admins only). New orders are auto-assigned to the inside rep for the submitter's territory; change it if needed.",
          "Under **Update status**, pick the next status, write what you did (required) and click **Save update**.",
          "When you ship, fill **Inventory used** so stock comes off the shelf. It's pre-filled from the order; **+ Add item** adds a line; a negative number puts stock back.",
          "If it's late, set **Delayed** and fill **Projected ship date** and **Reason for delay** → **Save delay details**.",
          "**Print request** prints a pick sheet and a cut-out shipping label.",
        ],
      },
      {
        heading: "Other controls",
        bullets: [
          "**Needs custom order** — tick when it can't come from stock. The rep is told it will take longer, and stock is never taken for it.",
          "**Messages** — chat with the rep, with photos. **Activity log** — internal notes.",
          "**Delete** (admins, red link) is permanent. Use **Cancelled** instead.",
          "Customer orders are capped at 10 samples. Bigger or custom-printed orders are OEM orders, which only inside reps can place and which never touch stock.",
        ],
        note: "Stock only comes off when **Inventory used** is filled in at Shipped or Fulfilled. If you skip it, the shelf count stays wrong.",
      },
      {
        heading: "Who is told",
        bullets: [
          "New order: **Marketing order placed**, the auto-assigned inside rep, the submitter (confirmation), and for outside reps' orders that region's manager.",
          "Every status change: **Marketing order status change**.",
          "A daily 9 AM Eastern reminder nudges the assignee about orders needed tomorrow or overdue (the status-change list if nobody is assigned). Each order is nudged once.",
        ],
      },
    ],
  },
  {
    id: "inventory",
    audience: "admin",
    title: "Inventory — items, loans, pickups",
    where: "Marketing Admin Center → Inventory · /admin/marketing?tab=inventory",
    href: "/admin/marketing?tab=inventory",
    summary:
      "Marketing stock. Tabs: **Items**, **Pizza boxes**, **Checkouts** (\"Loans\" on a phone) and **Aisle pickups**. The **•••** menu has **Aisle QR poster** and **Item QR codes**.",
    blocks: [
      {
        heading: "Add or edit an item",
        steps: [
          "**Items → Add item**.",
          "Fill **Name**, Category, SKU, Location, Unit cost, **Quantity on hand**, **Low-stock alert at**, and a photo.",
          "Options: **Can be checked out** (tradeshow loans), **Offer a pizza box at pickup**, **Offer a plastic overlay at pickup**, **Product of the Month**, **Pizza box kit** series, **Packaging stock role**.",
          "Click **Save**. On a card, **− / +** adjusts the count and **+ Add stock** adds a delivery.",
        ],
        bullets: [
          "**Talk to marketing** (admins) adds a note that shows on every order containing the item.",
          "**Delete** is permanent and blocked while units are out on loan.",
        ],
      },
      {
        heading: "Tradeshow loans (Checkouts)",
        steps: [
          "Item → **Check out** → **Quantity**, **Due back**, **Event / tradeshow**, **Taken by** → **Check out**.",
          "When it comes back: **Check in** → **Returned (good)** or **Damaged / lost** → **Check in**. Damaged or lost units don't return to stock.",
        ],
        note: "Overdue loans only show as a red badge. Nobody is emailed — chase them yourself.",
      },
      {
        heading: "Aisle pickups",
        bullets: [
          "A read-only log of what people took with the aisle QR, with a second list of returns.",
        ],
      },
    ],
  },
  {
    id: "pizza-boxes",
    audience: "admin",
    title: "Pizza boxes",
    where: "Inventory → Pizza boxes",
    href: "/admin/marketing?tab=inventory",
    summary:
      "A finished box is five pieces: the anchor (the sample), **The box**, **Plastic overlay**, **Under-anchor insert** and **Over-anchor insert (foldable)**. There is one kit per series (2000 / 3000 / 5000).",
    blocks: [
      {
        heading: "Set up once",
        steps: [
          "**What's in a box** — pick each piece per series, and any printables that go in every box. Click **Save** (it says \"Not saved yet\" until you do).",
          "**Samples not set up as boxes** — pick **Series…** → **Make it a box**.",
          "**+ New box type** for an anchor not in inventory yet.",
        ],
      },
      {
        heading: "Day to day",
        steps: [
          "**Assemble** moves loose pieces into the \"ready\" count. **Unbox** reverses it.",
          "Set label counts (or **One label each**) → **Print N labels**, and stick one on each box.",
          "**Copy scanner link** gives the box scanner people use to take boxes off the shelf.",
        ],
        note: "If Assemble warns about short stock, cancel — usually the boxes were already counted.",
      },
    ],
  },
  {
    id: "aisle-qr",
    audience: "admin",
    title: "Marketing aisle QR (no-login pickups)",
    where: "Inventory → ••• → Aisle QR poster · public page /grab/…",
    href: "/admin/marketing?tab=inventory",
    summary:
      "A QR poster on the marketing aisle lets anyone record what they take without signing in. Stock drops immediately and **Marketing aisle pickup** recipients are told.",
    blocks: [
      {
        heading: "Print or manage the poster",
        steps: [
          "Inventory → **•••** → **Aisle QR poster**.",
          "Pick **All items** or one category, then **Print this poster** (or **Print all posters** / **Copy link**).",
          "**Item QR codes** prints shelf labels for single items.",
        ],
        bullets: [
          "**Disable** stops every scan until you **Enable** again.",
          "**Rotate token** breaks every printed code. Only do it if a code leaked, and reprint everything afterwards.",
          "QR links always use the public Anchor App domain. The internal domain won't open on a stranger's phone.",
        ],
      },
      {
        heading: "What the scanner sees",
        bullets: [
          "**Take items** — quantities, **Your name**, **Your email** → **Take N**. Samples ask whether they're for a pizza box and which pieces.",
          "**Return items** — tradeshow gear only: email → **Find what I have out** → **Return N**.",
          "The box scanner page: **Scan a box** with the camera → **Take N boxes**.",
        ],
        note: "Aisle pickups don't trigger the low-stock alert. Check the Items list yourself.",
      },
    ],
  },
  {
    id: "product-of-month",
    audience: "admin",
    title: "Product of the Month",
    summary: "Set in two places. Update both each month.",
    blocks: [
      {
        heading: "Steps",
        steps: [
          "**Resource Library** (/assets) → **+ Set product of the month** (or **Change**) → pick the product or group → **Save**. Pick \"None\" to hide the pill.",
          "**Inventory** → **Edit** on each item → tick **Product of the Month**. Tagged items appear under the Product of the Month tile in the store.",
        ],
      },
    ],
  },
  {
    id: "consult-queue",
    audience: "admin",
    title: "Consults and Project Intake",
    where: "Projects tile → /dashboard/opportunities · Project Intake → /admin/fm-intake",
    href: "/dashboard/opportunities",
    summary:
      "Consults (from **Start a consult**) and quote requests (from **Request a quote**) both land in **Active Consults**, filtered by the rep's states. Quote requests also have their own admin page, **Project Intake**.",
    blocks: [
      {
        heading: "Assign one",
        steps: [
          "Open **Active Consults**. Filter by type and **New / Assigned**.",
          "Click the company to open it and read the project and photos.",
          "Pick a person in **Assigned to** and click **Save assignment** (on Project Intake: add **Review notes** → **Save decision**).",
        ],
        bullets: [
          "Status follows the assignment: someone assigned = **Assigned**, nobody = **New**.",
          "Assigning someone does not email them — tell them.",
          "**Delete** (admin, under Danger zone) removes it and its files for good.",
          "The **NetSuite** panel is greyed out on purpose until NetSuite is connected.",
        ],
        note: "An inside rep sees only the states their Sales Reps entry covers. \"Your account isn't assigned to any states yet\" means they need adding there.",
      },
    ],
  },
  {
    id: "support-queue",
    audience: "admin",
    title: "Support Queue",
    where: "/admin/support",
    href: "/admin/support",
    summary: "Help requests from any rep.",
    blocks: [
      {
        heading: "Answer a request",
        steps: [
          "Open **Open (N)** and click a thread.",
          "Type in **Reply** (add images if useful).",
          "Click **Send reply**, or **Reply & close** when it's done.",
        ],
        note: "Your reply goes to the rep by email only. When a rep writes back, a closed thread reopens but **nobody is notified** — check the queue daily.",
      },
    ],
  },
  {
    id: "read-only-queues",
    audience: "admin",
    title: "Commission Claims and Notable Projects",
    where: "/admin/commission-claims · /admin/notable-projects",
    href: "/admin/commission-claims",
    summary: "Both are read-only lists. There's no status to set.",
    blocks: [
      {
        heading: "Commission Claims",
        bullets: [
          "Search by rep, company or job, and expand a claim for the order details.",
          "Each claim also emails a PDF to the **Commission claim** recipients.",
          "Only outside reps with **Anchor commission** ticked (in Users) can file one.",
        ],
      },
      {
        heading: "Notable Projects",
        bullets: [
          "Photos and a short write-up of an installation. Click a photo for full size.",
          "Use them for case studies and social posts; there's nothing to approve.",
        ],
      },
    ],
  },
  {
    id: "library-admin",
    audience: "admin",
    title: "Documents — upload, replace, archive",
    where: "Resource Library → open a tackle box",
    href: "/assets",
    summary:
      "Inside any tackle box, admins get extra controls. Replacing a file in place keeps its link, so the website and Copilot pick up the new version with no other change.",
    blocks: [
      {
        heading: "Add a file",
        steps: [
          "Open the tackle box → **Add asset**.",
          "Choose the **File**, **Category** (Spec, Data Sheet, Install Guide, Assembly, CAD, Internal Document…), **Type** and **Visibility** (Public or Internal).",
          "Click save. Product photos go through **Upload Product Images** instead.",
        ],
      },
      {
        heading: "Replace a file (preferred for updates)",
        steps: [
          "Click **Replace** on the file and pick the new version.",
          "The link stays the same everywhere, including anchorp.com. **Document replaced** recipients are told.",
        ],
        note: "Don't delete and re-upload an updated document — that changes its link and breaks the website button pointing at it.",
      },
      {
        heading: "Add an internal document",
        steps: [
          "Open the tackle box → **Add asset** and choose the **File**.",
          "Set **Category** to **Internal Document**. **Visibility** locks to Internal.",
          "Click save. It's filed in the product's internal/ folder as internal-document-….",
        ],
        bullets: [
          "It shows under the tackle box's **Internal** tab (internal users only).",
          "On the website it's in the staff library at **/portal/documents**, never on the public Product Literature page.",
          "Public download links (/api/public/doc) refuse it, so it can't be pasted into a Webflow card.",
        ],
      },
      {
        heading: "Archive an old version",
        bullets: [
          "Upload it with **Archive this document** ticked. It's renamed ARCHIVE-…, made Internal and kept out of the Copilot.",
          "It shows under the tackle box's **Archive** tab (internal users only).",
        ],
      },
      {
        heading: "Shared U-anchor spec",
        bullets: [
          "Every U2000–U3800 tackle box shows one file, **U2000 / U3000 Series Spec** (anchor/u-anchors/spec.docx). **Replace** it from any of those boxes and all of them update. Delete is hidden on it on purpose.",
        ],
      },
      {
        heading: "Tackle box settings",
        bullets: [
          "**Active / Inactive** shows or hides the box in the library.",
          "The edit icon changes name, SKU, section and group.",
          "**Delete tacklebox** deletes the box and its files. It can't be undone.",
        ],
      },
    ],
  },
  {
    id: "knowledge",
    audience: "admin",
    title: "Knowledge — teaching the Copilot",
    where: "/admin/knowledge",
    href: "/admin/knowledge",
    summary: "What the Copilot learns from: ratings, corrections and the document index.",
    blocks: [
      {
        heading: "Tabs",
        bullets: [
          "**Feedback** — rated answers. Read the bad ones and **Mark reviewed**.",
          "**Corrections** — what reps said the Copilot got wrong. **Approve** (optionally **Promote to doc draft**) or **Reject**. The switch shows **Used by Copilot** / **Off**.",
          "**Knowledge docs** — every library file by category. **Copy link** gives the permanent public link; **Replace file** uploads a new version and re-indexes it.",
        ],
        note: "An approved correction keeps teaching the Copilot until you turn it **Off**. If answers go wrong after an approval, look here first.",
      },
    ],
  },
  {
    id: "asset-reviews",
    audience: "admin",
    title: "Asset Reviews",
    where: "/admin/asset-reviews",
    href: "/admin/asset-reviews",
    summary: "Photos internal reps submit from a tackle box wait here until you act.",
    blocks: [
      {
        heading: "Steps",
        steps: [
          "Open **Pending**.",
          "**Approve** publishes the photo to that solution's tackle box. **Reject** deletes the file.",
        ],
        note: "The rep isn't told either way, and a rejection can't be undone.",
      },
    ],
  },
  {
    id: "analytics",
    audience: "admin",
    title: "Analytics and Contacts",
    where: "/admin/analytics · /admin/manufacturer-contacts",
    href: "/admin/analytics",
    summary: "Who uses the app and what they do, plus the manufacturer contact roster.",
    blocks: [
      {
        heading: "Analytics",
        bullets: [
          "**Overview**, **OEM matrix** and **People** views, with a time window at the right.",
          "**OEM matrix** — one row per OEM; click a number to see the people. **Export PDF** downloads it.",
          "**People** — search anyone, open a row for their activity and Copilot chats, **PDF** for their full log.",
          "The **Weekly analytics report** emails every Friday to its Notifications recipients.",
        ],
      },
      {
        heading: "Contacts",
        bullets: [
          "Reached from the Analytics menu → **Contacts**. Add and edit manufacturer reps, consultants and contractors.",
          "It overlaps Users; prefer Users for anyone with a login.",
        ],
      },
    ],
  },
  {
    id: "portal-access",
    audience: "admin",
    title: "Portal Access",
    where: "/admin/portal-access (needs Site live)",
    href: "/admin/portal-access",
    summary:
      "The authorized-emails list shared with the **Anchor Internal Portal**. It is not the app's user list — app access comes from roles in Users.",
    blocks: [
      {
        heading: "Steps",
        steps: [
          "Under **Authorize an email**, fill **Email**, **Level** (Admin / Internal) and **Team** → **Add**.",
          "Change a row's level or team in place, or remove it.",
        ],
        bullets: [
          "The **Marketing** team is what opens the Portal's Marketing Hub.",
          "Showcase filers also need to be here, or Showcase says their anchorp.com account isn't authorized.",
        ],
      },
    ],
  },
  {
    id: "walkthroughs",
    audience: "admin",
    title: "Walkthroughs",
    where: "/admin/walkthroughs",
    href: "/admin/walkthroughs",
    summary: "Preview the guided tour on each page exactly as a user sees it. Nothing is saved.",
    blocks: [
      {
        heading: "Steps",
        steps: ["Click **Preview** next to a page. You're taken there and the tour runs."],
      },
    ],
  },
  {
    id: "hubspot-website",
    audience: "admin",
    title: "HubSpot — website leads",
    where: "anchorp.com portal → Marketing → Forms",
    summary:
      "Every anchorp.com form becomes a HubSpot contact, assigned to the territory rep, who is emailed by a HubSpot workflow. The HubSpot login is Riley's; the website side is Lauren's. This lives in the website, not this app.",
    blocks: [
      {
        heading: "What happens on every submission",
        steps: [
          "The submission is saved in the portal first, so a lead is never lost even if HubSpot is down.",
          "The person is created or updated as a HubSpot contact with every answer filled in. A returning visitor who mistypes their email is matched to their existing contact.",
          "The contact goes to the territory rep for their state/ZIP. With no territory, the first person under the form's **Who gets notified** gets it. An existing owner is never replaced.",
          "The HubSpot workflow **Website form submission > email the territory rep (anchorp.com)** emails the rep.",
        ],
        note: "No deals, companies or tasks are created. That's deliberate: contacts are reviewed, then imported into NetSuite (the **NetSuite review** field on the contact).",
      },
      {
        heading: "Checking it worked",
        bullets: [
          "Portal → **Marketing → Forms** → open the form. Each submission has a HubSpot badge; click it for every step and HubSpot's exact reply.",
          "**In HubSpot** — all good. **Sending…** — normal for up to a minute. **Stalled** — stuck over 5 minutes.",
          "**Note only** — the contact was saved but HubSpot's form record didn't land, so the answers went in as a note.",
          "**Failed** — HubSpot refused it; the badge says why. **Not sent** — HubSpot is switched off (the key is missing).",
          "Held (spammy-looking) submissions wait under **Needs review** and only go to HubSpot when released.",
        ],
      },
      {
        heading: "Changing who gets leads",
        bullets: [
          "By region: Portal → **Marketing → Territories**. **HubSpot leads go to** switches a region between the outside rep and inside sales.",
          "By form (fallback): Portal → **Marketing → Forms** → the form → **Who gets notified**.",
          "Every rep must be a HubSpot user. Anyone who isn't is skipped for ownership.",
          "New or edited forms need nothing in HubSpot. Saving the form creates its **(anchorp.com)** HubSpot form and a **website_…** property per question.",
        ],
      },
      {
        heading: "Report → fix",
        bullets: [
          "**Badge says Not sent** — HUBSPOT_PRIVATE_APP_TOKEN is missing in Vercel (anchorp-website). Re-add it and redeploy.",
          "**Failed with 401 / unauthorized** — the key was revoked or expired. Replace it (below).",
          "**Contacts arrive with no owner** — the private app lost its owners permission (this has happened when the key was reissued). HubSpot → Settings → Integrations → **Private Apps** → the website app → Scopes: tick crm.objects.owners.read, save, and put the new key in Vercel.",
          "**Contact arrived but the rep got no email** — HubSpot → Automation → **Workflows**: the (anchorp.com) rep-email workflow must be ON, and the rep must be the owner or the contact's **Website territory rep**.",
          "**Original Source says Offline Sources, no page history** — HUBSPOT_PORTAL_ID is missing in Vercel. Re-add it and redeploy.",
          "**Every submission from one form fails** — someone turned on reCAPTCHA on its (anchorp.com) form in HubSpot. Turn it off.",
          "**State or country missing on the contact** — HubSpot rejected the spelling and the contact was saved without it. Tell Lauren the value.",
        ],
      },
      {
        heading: "Replacing the key (Riley and Lauren together)",
        steps: [
          "HubSpot → Settings → Integrations → **Private Apps** → the website app.",
          "Check every scope is ticked: crm.objects.contacts.read, crm.objects.contacts.write, crm.schemas.contacts.read, crm.schemas.contacts.write, crm.objects.owners.read, forms, automation.",
          "Rotate the key and copy the new one.",
          "Vercel → anchorp-website → Settings → **Environment Variables** → HUBSPOT_PRIVATE_APP_TOKEN → paste → Save → **Redeploy**.",
          "Submit a test form on anchorp.com. The badge should say **In HubSpot** and the contact should have an owner.",
        ],
        note: "Keep the key only in the password manager and Vercel. Never in chat or email.",
      },
      {
        heading: "Don't touch in HubSpot",
        bullets: [
          "The **(anchorp.com)** forms' settings. reCAPTCHA stays off; **create new contact for new email** stays on.",
          "The (anchorp.com) rep-email workflow. The website's script rebuilds it and overwrites any edits.",
          "The properties lead_source (must keep the option **Website submission**), lead_source_other, netsuite_review, and anything starting website_.",
        ],
        note: "Developer detail and scripts: docs/hubspot-leads-go-live-and-inside-sales.md in the anchorp-website repo.",
      },
    ],
  },

  /* ───────────────────────────── Internal ───────────────────────────── */
  {
    id: "internal-dashboard",
    audience: "internal",
    title: "Dashboard and navigation",
    where: "/dashboard",
    href: "/dashboard",
    summary:
      "Anchor staff land on the Dashboard: a greeting, a search box, a green card for their most-used tool, and **Quick Actions** tiles.",
    blocks: [
      {
        heading: "Tiles internal staff see",
        bullets: [
          "**Resource Library**, **Open Copilot**, **Talk to a Rep or Request a Quote**, **Notable Project**, **Marketing Orders**.",
          "**Active Consults** — internal only.",
          "**Showcase Stop** — only for people assigned in Manage tools.",
          "**Rooftop Equipment Audit** — greyed out, \"Soon\".",
        ],
      },
      {
        heading: "Getting around",
        bullets: [
          "Desktop: the left sidebar. Phone: the bottom bar (Dashboard, the two most recent tools, Settings).",
          "Support, FAQ, the install guide and the page tour are in the floating **?** Help button.",
          "The sidebar shows **Commission Claim Form** to internal staff, but the form is for outside reps only and sends them back to the Dashboard.",
        ],
      },
    ],
  },
  {
    id: "active-consults",
    audience: "internal",
    title: "Active Consults",
    where: "/dashboard/opportunities",
    href: "/dashboard/opportunities",
    summary:
      "The triage list of consults and quote requests in the rep's own states. Which states a rep sees comes from their entry on Sales Reps.",
    blocks: [
      {
        heading: "Claim or assign one",
        steps: [
          "Filter by **REC only / Project Intake only** and **New / Assigned**.",
          "Click the company to open it.",
          "Pick a name in **Assigned to** → **Save assignment**. The status becomes Assigned.",
        ],
      },
    ],
  },
  {
    id: "internal-forms",
    audience: "internal",
    title: "Consults, quote requests and notable projects",
    where: "/dashboard/get-started",
    href: "/dashboard/get-started",
    summary:
      "**Talk to a Rep or Request a Quote** splits into two forms: **I'm new to Anchor → Start a consult** and **I already work with Anchor → Request a quote**. Internal staff and outside reps use the same forms.",
    blocks: [
      {
        heading: "Start a consult",
        steps: [
          "Fill **Project Name**, **Project Site Address** (choosing a suggestion fills city, state and ZIP), **Roof Type**, **Roof Brand** and **Project Timeline**.",
          "**+ Add a Solution** for each piece of equipment, with photos or video.",
          "Add notes and follow-up, then **Submit Consult**.",
        ],
        bullets: [
          "A draft is saved on the device — next time it offers **Resume draft**.",
          "It emails the reps covering the project's state and the **New consult** recipients.",
          "Don't tick **Also file my Anchor commission claim** as an internal rep — commission is for outside reps and that part will fail.",
          "Contractors added on the form aren't saved anywhere yet. Put them in the notes.",
        ],
      },
      {
        heading: "Request a quote (Project Intake)",
        steps: [
          "Fill **Customer & Project** (name, plus email or phone). The FM questions are here too.",
          "Fill any of the optional sections that apply, and add customer images.",
          "Click **Submit quote request**.",
        ],
        note: "Photos go through the server, so a very large batch can fail with \"Upload too large\". Send fewer or smaller photos.",
      },
      {
        heading: "Notable Project",
        steps: [
          "**Take Photos** first — the rest of the form appears after one photo.",
          "Fill **Project Name**, **Location**, **Description**, optional **Contact** → **Submit Project**.",
        ],
      },
    ],
  },
  {
    id: "internal-marketing",
    audience: "internal",
    title: "Marketing Orders (internal)",
    where: "/marketing-orders",
    href: "/marketing-orders",
    summary:
      "A store and cart: **Pizza box** (samples), **Swag**, **Printables**, **Tradeshow** (borrow and return, internal only) and **Product of the Month**. **My Orders** tracks what's been placed.",
    blocks: [
      {
        heading: "Place an order",
        steps: [
          "Open **Shop** and pick a tile.",
          "For samples, choose who it's for: **Customer order** (up to 10 samples, from stock) or **OEM order** (custom printed, for a partner or a big order).",
          "Pick the build (**Full box / Overlay / Anchor**) and quantity → **Add**.",
          "**Check Out**. OEM orders ask for the partner and artwork; tradeshow loans ask for the event and return date.",
          "Fill the shipping details and **Needed by** → **Place Order**.",
        ],
        bullets: [
          "Your own order is assigned to you. Outside reps' orders in your territory are assigned to you automatically.",
          "**My Orders** shows your orders, orders assigned to you and every outside rep's order in your territory.",
          "When it ships, tap **Mark as Received** on arrival.",
        ],
      },
      {
        heading: "Fulfilling (inside reps can)",
        bullets: [
          "Inside reps can open **Marketing Admin Center** and update orders in their territory, orders assigned to them and their own — same steps as the Admin section.",
          "Only admins can reassign or delete orders.",
        ],
      },
    ],
  },
  {
    id: "tradeshow",
    audience: "internal",
    title: "Tradeshow gear",
    where: "/marketing-inventory?cat=tradeshow",
    href: "/marketing-inventory?cat=tradeshow",
    summary:
      "Internal staff borrow tradeshow gear either from the store's **Tradeshow** tile or from the Marketing Inventory page. Nothing in the menu links to that page — share the address.",
    blocks: [
      {
        heading: "Borrow",
        steps: [
          "Find the item (it shows \"In stock\" and how many are out).",
          "**Check out** → **Event**, **Quantity**, **Back by**, **Notes** → **Check out**.",
        ],
        note: "Only marketing can check gear back in (Inventory → Checkouts → **Check in**). Remind people to hand it back in person.",
      },
    ],
  },
  {
    id: "showcase",
    audience: "internal",
    title: "Showcase Stop",
    where: "/dashboard/showcase",
    href: "/dashboard/showcase",
    summary:
      "For people running mobile-showcase truck stops. They log each stop and its photos; marketing reviews and publishes them on anchorp.com.",
    blocks: [
      {
        heading: "Give someone access",
        steps: [
          "Admin → **Manage tools** → **Showcase Stop** → **Assign people**.",
          "Make sure their email is also in **Portal Access**.",
        ],
      },
      {
        heading: "File a stop",
        steps: [
          "**+ Add a stop**.",
          "Fill **Date**, **City**, **Event**, an optional **Note**, and up to 10 photos.",
          "Wait for the photos to say **Uploaded**, then **File this stop**.",
        ],
        bullets: [
          "Stops show **Pending review**, **On the site** or **Declined**; marketing's reason shows as \"Marketing said: …\".",
          "Publishing happens on anchorp.com, not in this app. Nobody is notified automatically — tell marketing when stops are waiting.",
          "A keeper's edit to a live stop goes on the website straight away.",
        ],
      },
    ],
  },
  {
    id: "internal-library",
    audience: "internal",
    title: "Resource Library, internal documents and photos",
    where: "/assets",
    href: "/assets",
    summary:
      "The same library outside reps use, plus the **Internal assets** filter and internal-only tabs: **Test Reports**, **Pricebook** and **Archive**.",
    blocks: [
      {
        heading: "Everyday use",
        bullets: [
          "**Open →** opens the viewer, which has **Download**. **Share** (desktop) copies a link that never expires; internal files only open for signed-in staff.",
          "Search matches product names and SKUs, not the text inside documents.",
          "**Internal assets** holds rep agreements (**Add rep agreement**, PDF and Word both required) and internal contact lists (**Add contact**).",
        ],
      },
      {
        heading: "Submit a photo for a tackle box",
        steps: [
          "Open the tackle box → **Submit photos for review** → **Tap to select images**.",
          "Click **Submit for review**. An admin approves it in Asset Reviews.",
        ],
      },
    ],
  },
  {
    id: "internal-settings",
    audience: "internal",
    title: "Copilot, Support and Settings",
    summary: "The tools every signed-in person has.",
    blocks: [
      {
        heading: "Copilot (/chat)",
        bullets: [
          "Ask about Anchor products; answers include **Related Documents**.",
          "Internal staff can rate answers **Accurate** or **Needs correction** — those land in Admin → Knowledge.",
          "It won't give engineering calculations or pricing, and never links internal files.",
        ],
      },
      {
        heading: "Support (/dashboard/support)",
        bullets: ["**Subject**, **Message**, optional images → **Send request**. Replies come by email."],
      },
      {
        heading: "Settings (/dashboard/settings)",
        bullets: [
          "**Profile Information** — name, company, phone, **Service area** states (a ZIP if Texas) → **Save Changes**.",
          "**NetSuite sync** — Automatic or Manual (internal only).",
          "**Notifications** — **Enable notifications**, then **Send test**. Needed on each device.",
          "**Appearance** — Light / System / Dark.",
        ],
      },
    ],
  },

  /* ───────────────────────────── External ───────────────────────────── */
  {
    id: "external-access",
    audience: "external",
    title: "How an outside rep gets in",
    summary:
      "Anyone can sign in at the Anchor App with their own email — there's no invitation or approval. They start as External.",
    blocks: [
      {
        heading: "First visit",
        steps: [
          "Sign in with the emailed 8-digit code.",
          "A **Complete your profile** prompt asks for their name; a short tour runs once on the Dashboard.",
          "They should open **Settings** and add their **Service area** states (and ZIP for Texas).",
        ],
      },
      {
        heading: "What you set for them",
        bullets: [
          "**Anchor commission** in Users, if they may file commission claims.",
          "Nothing else — the rest works from their service states and the Sales Reps table.",
        ],
      },
    ],
  },
  {
    id: "external-dashboard",
    audience: "external",
    title: "Dashboard and tools",
    where: "/dashboard",
    href: "/dashboard",
    summary: "Outside reps see a smaller set of tools than Anchor staff, and no queues.",
    blocks: [
      {
        heading: "Tiles",
        bullets: [
          "**Resource Library**, **Open Copilot**, **Talk to a Rep or Request a Quote**, **Notable Project**, **Marketing Orders**.",
          "**Commission Claim Form** — only when **Anchor commission** is ticked on their user.",
          "**Rooftop Equipment Audit** — greyed out, \"Soon\".",
        ],
      },
      {
        heading: "The two round buttons",
        bullets: [
          "**Service State** — the states from their Settings.",
          "**Contact Your Rep** — the outside rep (Teams, Email) and inside rep for each of their states, from Sales Reps. \"No reps assigned yet\" means their states are missing or uncovered.",
        ],
      },
    ],
  },
  {
    id: "external-forms",
    audience: "external",
    title: "Consults, quote requests, commission claims",
    summary:
      "Outside reps use the same consult, quote and notable-project forms as internal staff (see the Internal tab). Once sent, they can't see their consults or quote requests again — that's by design.",
    blocks: [
      {
        heading: "Commission Claim Form (/dashboard/commission/new)",
        steps: [
          "Tick the certification, confirm the salesperson disclosure.",
          "Fill order date, job name, city/state, **U-Anchor(s) Ordered**, quantity, roof type, ship-to and a project description.",
          "**Submit Claim**. The **Commission claim** recipients get an email with a PDF.",
        ],
        note: "If the form sends them back to the Dashboard, **Anchor commission** isn't ticked on their user.",
      },
      {
        heading: "Where their submissions go",
        bullets: [
          "Consult → Active Consults for the project's state, plus the reps covering it.",
          "Quote request → Project Intake and Active Consults.",
          "Commission claim → Commission Claims. Notable project → Notable Projects.",
        ],
      },
    ],
  },
  {
    id: "external-marketing",
    audience: "external",
    title: "Marketing Orders (outside reps)",
    where: "/marketing-orders",
    href: "/marketing-orders",
    summary:
      "Outside reps get **Pizza box**, **Swag**, **Printables** and **Product of the Month**. No Tradeshow, and no OEM orders — theirs are always customer orders, 10 samples at most.",
    blocks: [
      {
        heading: "Place and track",
        steps: [
          "**Shop** → pick items → **Add**.",
          "**Check Out** → **Needed by**, recipient, address → **Place Order**.",
          "Track it in **My Orders**: New → Processing → Shipped → Fulfilled.",
          "Tap **Mark as Received** when it arrives.",
          "Use **Messages** on the order to talk to the team.",
        ],
        bullets: [
          "The order goes to the inside rep for their territory and that region's manager.",
          "They're emailed when it ships, is tagged custom, or the team messages them. Other status changes only show in the app.",
          "For more than 10 samples, they ask their inside rep to place an OEM order.",
        ],
      },
    ],
  },
  {
    id: "external-other",
    audience: "external",
    title: "Copilot, library, support and settings",
    summary: "Same as internal, with these differences.",
    blocks: [
      {
        heading: "Differences",
        bullets: [
          "Resource Library shows public documents only — no Test Reports, Pricebook, Archive or internal assets.",
          "The Copilot has no **Accurate / Needs correction** buttons for them; they correct it by replying.",
          "Settings has no NetSuite card.",
          "There's no language switch, even though some help text mentions one.",
        ],
      },
    ],
  },
  {
    id: "public-pages",
    audience: "external",
    title: "Public pages (no login)",
    summary: "Pages anyone can open without an account.",
    blocks: [
      {
        heading: "The pages",
        bullets: [
          "**Aisle QR pickup** (/grab/…) and the **pizza box scanner** — see the Admin tab, Marketing aisle QR.",
          "**Website document links** — anchorp.com's Resource Library links to /api/public/doc?path=…, which serves the current file. Only files under solutions/, anchor/u-anchors/ and spec/ are served.",
          "**Shared document links** from the library's **Share** button.",
        ],
        note: "If a website document button says \"Not found\", the file was renamed, moved or deleted in the bucket. Put it back at the old path, or repoint that Webflow button to the new one.",
      },
    ],
  },

  /* ─────────────────────────────── Fixes ─────────────────────────────── */
  {
    id: "fix-access",
    audience: "fixes",
    title: "Signing in and getting around",
    summary: "The calls you'll get most.",
    blocks: [
      {
        heading: "Report → fix",
        bullets: [
          "**\"It says install the app\"** — the install screen on phones. Install to the home screen (Safari on iPhone) or tap **Continue in browser**. Links opened inside Gmail or LinkedIn can't install; open them in Safari or Chrome.",
          "**\"I never got the code\" / \"Too many code requests\"** — check spam, wait a few minutes. A new code replaces the old one.",
          "**\"Reset password doesn't work\"** — there are no passwords. Use the emailed code.",
          "**\"You need access\" on the internal site** — outside reps belong on the Anchor App address; the internal site is behind a Vercel login.",
          "**\"I work at Anchor but I show as External\"** — their email domain isn't one of the three internal ones. Change the role in Users.",
          "**\"Signed in, but server cookies failed to sync\"** — refresh once.",
          "**\"The Admin Console disappeared\"** — View as is still set to a sales role. Tap the pill → **Admin**.",
          "**\"I can't find the forms\" (an admin)** — admins don't see them. Use View as.",
        ],
      },
    ],
  },
  {
    id: "fix-notify",
    audience: "fixes",
    title: "Notifications and routing",
    summary: "When someone wasn't told.",
    blocks: [
      {
        heading: "Report → fix",
        bullets: [
          "**\"Nobody got my submission\"** — Admin → Notifications: is anyone on that event? Empty means silent.",
          "**\"I get emails but no push\"** — push is per device. Install to the home screen (iPhone needs iOS 16.4+), then Settings → Notifications → **Enable notifications** → **Send test**. \"Blocked\" means allowing it in the phone's settings.",
          "**\"Nobody contacted my customer\"** — Sales Reps: does someone cover that state (and ZIP)? Is their email the same as their login?",
          "**\"Contact Your Rep is empty\"** — the rep hasn't added service states in Settings, or no Sales Reps entry covers them.",
          "**\"The Friday report didn't come\"** — check the Weekly analytics report recipients. If they're set, escalate.",
          "**\"I replied on support and nobody answered\"** — rep replies don't notify admins. Check the Support Queue.",
          "**\"An inside rep sees no consults\"** — they're not on Sales Reps, or their email there doesn't match their login.",
        ],
      },
    ],
  },
  {
    id: "fix-content",
    audience: "fixes",
    title: "Forms, files and stock",
    summary: "Everything else.",
    blocks: [
      {
        heading: "Report → fix",
        bullets: [
          "**\"The commission form sends me back\" / \"commission failed (Forbidden)\"** — tick **Anchor commission** on their user. Internal staff can never file claims.",
          "**\"My upload failed\"** — quote-request and notable-project photos have a total size limit (about 4.5 MB). Send fewer or smaller photos. The consult form doesn't have this limit.",
          "**\"My photo never showed up in the tackle box\"** — it's waiting in Asset Reviews.",
          "**\"The Copilot doesn't know about X\"** — the document isn't in the library, or a bad correction is on. Check Knowledge.",
          "**\"The QR says invalid or disabled\"** — the aisle is disabled or the token was rotated. Enable it, or reprint.",
          "**\"The shelf count is wrong\"** — orders were shipped without **Inventory used** filled in, or aisle pickups went unrecorded. Fix the count with − / + on the item.",
          "**\"A website document link is broken\"** — the file was renamed or moved. See Public pages.",
          "**\"A change is on one site but not the other\"** — a Vercel build was cancelled. Escalate to a developer.",
          "**\"Coming soon\" on Rooftop pages, greyed-out NetSuite panel** — expected, not a bug.",
        ],
      },
    ],
  },
];
