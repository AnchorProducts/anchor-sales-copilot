# Anchor Sales Co-Pilot — Standard Operating Procedure

**For:** Riley (Admin / Operator)
**Version:** 1.0 — 2026-07-29
**Companion doc:** `SITEMAP.md` (the exhaustive technical inventory — routes, tables, every email). This SOP is the *how-to*; the sitemap is the *what-exists*.

> The last section (Page 14) is written for a software developer, not for you. Hand the whole document to anyone brought in to make large-scale changes to the site.

---

## Page 1 — What this app is

The Anchor Sales Co-Pilot is the internal + external web app Anchor Products uses to run the sales support motion. It does five jobs:

| Job | What happens |
|---|---|
| **Collect submissions** | Reps submit Rooftop Equipment Consults (RECs), commission claims, notable projects, marketing orders, and project intakes. |
| **Route them to a human** | Every submission emails and push-notifies whoever is assigned to that event category, plus the sales rep whose territory covers the project. |
| **Track them to done** | Consults, marketing orders, commission claims, intakes, and support tickets each have a status workflow an admin drives. |
| **Serve content** | A Resource Library of product docs, an AI "Copilot" chatbot that answers from those docs, and a marketing inventory catalog. |
| **Report** | OEM and per-user analytics, plus an automated Friday email report. |

### One codebase, two websites

There are **two live sites running the same code**:

- **Internal build** — for Anchor staff (`admin` and `anchor_rep` roles). Branded "Anchor Internal."
- **External build** — for outside partner reps (`external_rep`). Branded "Anchor App."

The app automatically bounces you to the right one. If an Anchor staff account tries to load a page on the external site, it redirects to the login page — and vice versa. **This is the single most common source of "the site is broken" reports.** See Page 12.

### It's also a phone app

Both sites are installable PWAs — a rep can "Add to Home Screen" on iOS/Android and it behaves like a native app, including push notifications. Nothing goes through an app store.

---

## Page 2 — Getting yourself set up

Do these once, in order.

**1. Get an account.**
Go to the login page and sign in with your `@anchorp.com` email. The app creates your profile automatically on first load. Anyone with an `@anchorp.com` address is created as `anchor_rep` (internal). Everyone else is created as `external_rep` (external partner).

**2. Get promoted to admin.**
A current admin must open **Admin Console → Users**, find you, and change your role to `admin`. You cannot do this for yourself. Until then you won't see `/admin` at all.

**3. Install it on your phone.**
Open the internal site in Safari (iOS) or Chrome (Android) → Share → Add to Home Screen. Open it from the home screen icon at least once.

**4. Turn on push notifications.**
In the app: **Settings → Notifications → Enable**. Accept the browser prompt. Push only works from the installed home-screen version on iOS — not from a Safari tab.

**5. Assign yourself to the notification categories you own.**
Go to **Admin Console → Notifications**. Add yourself as a *User* on every event you're responsible for. If you skip this, submissions come in silently. See Page 5 — this is the highest-consequence config in the app.

**6. Send yourself a test push.**
Settings → Notifications → Send test. If it doesn't arrive, the subscription didn't register — re-install the home-screen app and re-enable.

### Your three homes

| Where | What it's for |
|---|---|
| `/dashboard` | Your day-to-day home. Quick-action tiles and stat counts. |
| `/admin` | The Admin Console — every management tool, as a grid of tiles. |
| `/dashboard/opportunities` | Active Consults — the triage queue. You'll live here. |

---

## Page 3 — Roles, and the "View As" trap

There are exactly three roles.

| Role | Who | Sees |
|---|---|---|
| `external_rep` | Outside partner reps, OEM reps | Submission forms, Copilot, Resource Library, marketing orders. No queues, no admin. |
| `anchor_rep` | Anchor internal staff | Everything an external rep sees **plus** the Active Consults queue, Marketing Admin Center, and the Knowledge admin. |
| `admin` | You | Everything. |

**Change a role at:** Admin Console → **Users** → click the person → set Role → Save. It takes effect on their next page load; tell them to refresh or sign out and back in.

### The trap: as an admin, you cannot open the submission forms

An admin account has the forms deliberately hidden — no REC form, no commission form, no marketing order form on your dashboard. This is intentional (an admin submitting as themselves would corrupt the routing data), and it confuses every new admin.

**To test or submit a form, use View As.** As an admin you have a floating role pill on **every** page — top-center on mobile, bottom-right on desktop. Tap it and pick one of three:

| Option | What you see |
|---|---|
| **Admin** | Full admin view (the default). |
| **Internal sales** | The app as an Anchor rep sees it. |
| **External user** | The app as an outside rep sees it — this is the one with all the submission forms. |

When you're viewing as someone else the pill reads "Viewing as …", so you always know.

Two things to know about View As:
- It changes **what you see**, not **who you are**. Data you fetch and any action you take is still performed by your real admin account.
- It's remembered in your browser. **Set it back to Admin when you're done**, or you'll spend twenty minutes wondering where the Admin Console went.

---

## Page 4 — Your operating rhythm

### Every morning (10 minutes)

1. **Active Consults** (`/dashboard/opportunities`) — filter to status `new`. Every new REC needs an owner and a status move off `new` today.
2. **Marketing Admin Center → Orders** — anything sitting on `New` gets moved to `Processing` or gets a message to the rep.
3. **Support Queue** (`/admin/support`) — reply to anything `open`.
4. **Asset Reviews** (`/admin/asset-reviews`) — approve or reject any pending rep photos. These are invisible to everyone until you act.

### Weekly

- **Friday:** the automated analytics report emails itself at **17:00 UTC** (1:00 PM Eastern in summer / 12:00 PM in winter) to everyone assigned to the `weekly_report` category. Confirm it arrived. If it didn't, that's an escalation (Page 13).
- **Commission Claims** (`/admin/commission-claims`) — work the backlog. Each claim also emails a PDF at submission time.
- **Notable Projects** (`/admin/notable-projects`) — review and set status on new submissions.
- **Marketing Inventory** — scan for low stock. Items below their threshold fire a notification, but eyeball the list anyway.

### Monthly

- **Notifications** (`/admin/notifications`) — walk every event category and confirm the recipient list still matches who actually works here. This is the config most likely to silently rot.
- **Sales Reps** (`/admin/sales-reps`) — verify territory coverage. Every state should map to an outside rep and an inside rep.
- **Users** — remove or downgrade anyone who's left.
- **Knowledge** (`/admin/knowledge`) — review Copilot corrections and low-rated answers; retire stale documents.

### As it happens

- New employee → Users (set role) → Notifications (assign categories) → tell them to install the PWA and enable push.
- Person leaves → Users (downgrade/remove) → Notifications (remove from every category) → Sales Reps (reassign territory) → Portal Access (remove).

---

## Page 5 — Notifications (read this one twice)

This is the most important thing you own. If it's wrong, submissions arrive and no human is told.

### How it works

Every event in the app belongs to a **category** (the app calls them "tools"). Examples: *New consult*, *Marketing order placed*, *Commission claim*, *Support request*, *Weekly analytics*.

For each category you assign two kinds of recipients at **Admin Console → Notifications**:

| Type | Gets | Use for |
|---|---|---|
| **Users** | Email **and** push notification | Actual app accounts — staff. Push additionally requires *that person* to have enabled it on their own device. |
| **Emails** | Email only | Shared inboxes and people without app accounts (`marketing@anchorp.com`, `orders@anchorp.com`). |

### The two things that bite

**1. Nothing is pre-assigned.** Every category ships with an empty recipient list. When a list is empty, the app falls back to `reports@anchorp.com` so nothing is lost outright — but the person who actually needs to act is not told. An empty category is a silent failure, not a loud one.

**2. Assigning a User does not turn on their push.** You control *who* is on the list. They control whether push works on their phone (Settings → Notifications → Enable). If someone says "I get the emails but never the pushes," that's on their device, not your config.

### Consult routing is separate and automatic

New consults (RECs) go to **two** places:

- The people you assigned to the `new_consult` category, **and**
- The outside rep and inside rep whose territory covers the project's state or ZIP — resolved automatically from the territory roster.

That roster lives on the **Sales Reps** tile (the phone icon, toward the bottom of the Admin Console grid at `/admin`). Each person there gets a list of states and/or ZIP prefixes; that's what decides who hears about a new consult.

So if a rep in Ohio says "nobody contacted my customer," check *both* the notification category *and* the territory table.

### Marketing orders route by region

Marketing orders notify a **per-region manager**, not the inside rep directly. Each region has its own auto-created category named `marketing_order_region:<rep id>`. Assign the right manager to each one in the Notifications page. This is deliberate — orders from an outside rep flow to the manager who owns that region's fulfillment.

### Two notifications that don't go to a category

Both of these go to a *person* rather than a notification category, so there's nothing to assign — they work as soon as that person has an email address on their profile (and a subscribed device, for the push).

**Shipped → the rep who placed it.** Moving an order to **Shipped** emails and pushes the rep who submitted it, asking them to mark it received when it arrives. Their order then shows a **Mark as received** button, which is what closes the order out — nobody at Anchor can see the box land, so without that step the order sits in Shipped forever. Because reps now own the *fulfilled* step, the **Inventory used** picker appears when you move an order to **Shipped** as well as Fulfilled; record what left the shelf at whichever step you actually pack it.

**Needed by tomorrow → whoever the order is assigned to.** A job runs every morning (13:00 UTC / 9am ET) and nudges the assignee about orders due the next day, so a date doesn't pass unnoticed. Each order is nudged **once** — if it's already moved on, update its status and it won't come back. Orders that are already overdue (up to 30 days) get the same one-time nudge, so nothing slips through on a day the job doesn't run. An order with **nobody assigned** goes to the *Marketing order status* category instead, because otherwise no one would hear about it — which is the argument for assigning orders as they come in.

---

## Page 6 — Consults (RECs): the triage queue

**Where:** `/dashboard/opportunities` — also reachable as the *Projects* tile on the Admin Console.

A Rooftop Equipment Consult is the app's core lead object: a rep submits a customer, a location, a roof type, and what they need.

### Two states, and only two

| Status | What it means |
|---|---|
| **New** | Nobody owns it yet. This is your work queue. |
| **Assigned** | Somebody's name is on it. |

There is no separate status control, and nothing else to track. **The status follows the assignee automatically** — pick a person and it becomes Assigned; clear the person and it drops back to New. The two can't disagree because there's only one thing to set.

Project Intakes use the exact same two states, so the queue reads consistently whichever kind of row you're looking at.

### Working one

1. Open the queue, filter to **New**.
2. Click into the consult. You'll see the customer, project address, roof type/brand, requested solutions, timeline, and any attachments the rep uploaded.
3. In the **Assignment** panel, choose the owner from the dropdown and press **Save assignment**. Anyone with an Anchor account — admin or internal rep — can be picked.
4. If the rep asked for a video call, there's a meeting-link field — paste the Teams link there and it becomes visible to the submitter.

To hand something back to the queue, set Assigned to back to **Unassigned (New)** and save.

### Deleting a submission

Admins only — internal reps can work the queue but can't destroy anything.

At the bottom of the Assignment panel there's a **Danger zone**. Deleting removes the consult *and every file uploaded with it*, and asks you to confirm first. **There is no undo and no archive.** If you only want it out of your working list, assign it to someone instead.

This works the same way on Project Intakes.

### NetSuite sync — not live yet

You'll see a greyed-out **NetSuite** panel marked **Coming soon** — on both consults and Project Intakes. That's expected, not a bug. The push is built, but Anchor's NetSuite credentials haven't been connected, so the panel is deliberately inert — better than a Sync button that can only fail.

**Nothing you do in the admin console turns this on.** It switches itself on the moment a developer adds the six `NETSUITE_*` credentials to the environment. No flag to flip, no deploy needed beyond the config.

Once it's connected, here's what it will do: each consult can be pushed to NetSuite (creating the company, contact, and deal, and writing the resulting IDs back onto the consult). Each rep has a **sync mode** on their own settings page — `manual` or `automatic`. On manual, someone clicks Sync on the consult detail. On automatic, their consults sync on their own.

**Project Intakes are one step further behind.** Their panel shows the same status rows but has no Sync button even in principle — the push itself hasn't been wired for intakes, only for consults. Connecting the credentials lights up consults; intakes need a bit of development on top of that.

If a sync fails once it *is* live, the consult shows a sync status of `error` with the message. Common causes are credential expiry or a duplicate company. **Sync failures are a developer escalation** — you can't fix credentials from the admin UI.

### Region scoping

Anchor reps only see consults in their own territory. **You, as admin, see all of them.** If a rep says "my consult disappeared," they're probably scoped out of a region — check their territory in Sales Reps.

---

## Page 7 — Marketing: orders, inventory, and the QR pickup

**Where:** Admin Console → **Marketing Admin Center** (`/admin/marketing`). Tabs: **Orders**, **Inventory**, and — once "Site live" is on — **Submissions**.

### Orders

Statuses:

| Status | Meaning |
|---|---|
| `New` | Just submitted. |
| `Processing` | Marketing is pulling it. |
| `Shipped` | On its way. |
| `Fulfilled` | Delivered, done. |
| `Delayed` | Off-path. Requires a projected ship date **and** a reason — both are shown to the rep. |
| `Cancelled` | Off-path, terminal. |

**Every status change emails and pushes the rep automatically.** You don't need to send a separate note. Use `Delayed` rather than leaving something on `Processing` for two weeks — the rep sees the projected date and stops asking.

Each order has a **two-way message thread**. A message from you notifies the rep; a message from the rep notifies the `marketing_order` category. Unread counts show as badges. Attachments are allowed on both sides.

There's an **Active / Archived** split — archive fulfilled and cancelled orders so the working list stays short. And there's an **activity log** per order recording who changed what status when.

### Inventory

Tracks physical marketing material: name, SKU, storage location, photo, unit cost, quantity available, quantity out, and a **low-stock threshold**. When an item drops to its threshold, the `inventory_low_stock` category is notified. Set thresholds deliberately — an unset threshold means you'll only learn you're out when a rep complains.

**Tradeshow checkouts** log items loaned out for an event: event name, quantity, due-back date, and a returned/damaged count when they come back.

### Submissions

Only present when **Site live** is on (Page 10) — otherwise the tab isn't there at all.

This is the Pitch to Marketing review queue: marketing ideas pitched by anyone else in the company. It's the same queue as `/marketing/submissions`, surfaced here so you don't have to leave the Marketing Admin Center to work it.

Two filters — **Awaiting decision** (your actual to-do list) and **All pitches**. Open a pitch and you get three actions:

| Action | What happens |
|---|---|
| **Approve** | Asks for a timeline, then puts the idea on the Strategy Board under *Considering* and tells the submitter what to expect. |
| **Request info** | Asks the submitter a question. The pitch stays in the queue. |
| **Decline** | Asks for a reason. The submitter sees exactly what you write. |

Every pitch also has a two-way message thread, so you can go back and forth without leaving the queue.

**Access note — two separate requirements:**

1. **You must be on the internal site.** The Marketing Hub doesn't exist on the external build at all, so the tab won't even appear there.
2. **You must have a Portal Access entry** (Page 9) with level Admin or team Marketing. Your *app* role isn't enough on its own — membership comes from the shared list.

If either is missing you'll get a message telling you which, rather than the queue.

### The QR pickup flow

There's a public, no-login QR code (`/grab/<token>`) you can print and stick on a shelf. Someone scans it, enters their name and email once, sets quantities on any number of items, and takes them in one tap. The pickup **decrements stock automatically** and notifies the assigned recipient.

Three things must be true for it to work: the QR token must be generated, a notification recipient must be assigned, and it must be served from a domain that doesn't sit behind SSO — a login wall defeats the entire point.

**Pizza boxes.** There's one kit per anchor series — 2000, 3000 and 5000 (the 5000 hasn't launched, so nothing is set up for it yet). Any sample ticked as *Offer a pizza box at pickup* asks, once a quantity is set, whether these are **for a pizza box** — and if so, which pieces are needed: the box, the plastic overlay, the under-anchor insert, and the foldable over-anchor insert. All four start ticked (a complete box needs all of them); untick whatever they already have. Each ticked piece comes off that series' own count, so a 3400 sample can't quietly spend 2000 Series boxes. The anchor is the sample they're already taking.

A sample knows its series from the **Pizza box kit** field in the item editor, and the aisle uses it without asking. A sample with no kit set asks *which pizza box?* first, so it still can't guess.

Each piece is a normal inventory item tagged with a **pizza box kit** plus a **packaging stock role** in the item editor, which is what gives it a photo, a count and a low-stock alert. The **Pizza box kits** card at the top of the Items tab has a tab per series showing its four pieces side by side, with **+ / −** to add or subtract on the spot and **Edit** for the photo or an exact count. A piece showing *Not set up* isn't tagged yet — until it is, picking it at the aisle subtracts from nothing, and a kit with no pieces at all isn't offered at the aisle. That's how the 5000 Series turns on: set its pieces up here and it appears.

**Returns.** The same QR has a **Return items** tab. Someone enters the email they used, taps *Find what I have out*, and gets their pickups from the last six months with anything still outstanding. They set how many are coming back and untick any pizza-box pieces they used up — only ticked pieces go back, and only onto the series they came off. Returned units go straight back into stock, the pickup log shows how much of each pickup came back, and the return is announced on the same **Marketing aisle pickup** channel as a pickup (no extra recipient to assign).

---

## Page 8 — The other queues

Each of these is the same shape: a list, a status, and a notification that fired when it arrived.

### Commission Claims — `/admin/commission-claims`
External reps only, and only reps who have the **commission flag** turned on in their profile (Users page). Each submission emails a PDF of the claim. Review the rep info, certification, order details, and ship-to, then set status.

### Notable Projects — `/admin/notable-projects`
Reps submit installations with photos and a writeup. Review, then set status. Useful as marketing raw material.

### Project Intake / FM — `/admin/fm-intake`
The Universal Rooftop Equipment Intake — a longer quote-request form covering buildings, HVAC units, and pipe stacks, with attachments. Same two states as consults (**New** / **Assigned**), driven the same way by the **Assigned to** picker, plus a free-text review-notes field for your recommendation. Admins can delete an intake and its files from the same panel. There's also a **New intake** form on this page so you can key one in on someone's behalf.

Intakes carry the same greyed-out **NetSuite / Coming soon** panel as consults (Page 6). Expected, not a bug.

Intakes also appear in the Active Consults queue alongside RECs, so you can work both from one list.

### Support Queue — `/admin/support`
In-app help requests from any rep. Open a thread, reply (the requester is emailed and pushed), close when resolved. Note: an admin visiting `/dashboard/support` is redirected here — you see the whole queue, not just your own tickets.

### Asset Reviews — `/admin/asset-reviews`
Photos internal reps uploaded to a product "tackle box." Filter by `pending` / `approved` / `rejected`. **Pending photos are invisible to everyone** until you approve them. Approve or reject — don't let this queue sit.

---

## Page 9 — Content: the Copilot, the library, and users

### Knowledge / the Copilot — `/admin/knowledge`

The chatbot answers from indexed documents, not from general knowledge. Three levers:

1. **Which documents are indexed and allowed.** A document has to be both indexed *and* allow-listed to be used in answers. If the Copilot doesn't know something, the source document is usually missing or not allowed.
2. **Corrections.** When someone corrects a Copilot answer, that correction is stored and injected into future similar questions. Review these — a bad correction teaches the bot something wrong, permanently, until you deactivate it.
3. **Feedback.** Thumbs and 1–5 ratings on answers. Low-rated answers are your list of what to fix. A daily digest of corrections and low ratings emails automatically.

The Copilot's document catalog mirrors the 11-category solution structure. Adding a document to the library is what makes the Copilot able to cite it.

### Resource Library

Product "tackle boxes" — each product has documents, data sheets, and photos attached. Internal users additionally see an internal-assets section with per-product internal docs and manufacturer contacts.

**Replacing a document notifies people.** In the Knowledge admin you can replace a file *in place* — the path never changes, so every existing link (including the ones anchorp.com serves) keeps working and just resolves to the new version. When that happens, everyone assigned to the **Document replaced** category (Page 5) gets an email and a push naming the file and who replaced it.

That's the only document notification. There's no revision or version-label field to maintain — if the contents change, replace the file and the right people are told.

All files live in private storage. Nothing is publicly readable; every view goes through a short-lived signed link the server generates. There is one deliberate exception: a public document endpoint used by anchorp.com's Resource Library to serve a specific set of public files.

### Users — `/admin/users`

One page to edit every person: app users, OEM reps, tech reps, and consultants. Click anyone to change name, email, phone, role, OEM affiliation, or the commission flag.

### Portal Access — `/admin/portal-access` (only visible when "Site live" is on)

**This is not the same list as Users.** Users edits *this app's* login accounts. Portal Access edits the **shared authorized-email list that the Anchor Internal Portal also reads** — edit it here and it changes there, and vice versa. Each entry gets a level (Admin / Internal) and a team (Marketing, Sales, Operations, Leadership).

A person can exist in one list and not the other. When someone joins or leaves, handle **both**.

---

## Page 10 — Turning things on and off

**Where:** Admin Console → **Manage Tools** (`/admin/tools`).

### Two independent controls

**1. Admin Console tools.** Deactivate a tool and it stays visible to you, marked "Inactive," but is switched off. Use this to retire a tool without deleting it.

**2. Sales rep tools.** Deactivate a tool and it **disappears** from reps' dashboards. Internal and external reps are toggled separately — you can hide the commission form from internal reps while leaving it live for external ones.

### "Site live" — the master switch

At the top of Manage Tools there's a single **Site live** card. It gates an entire feature set that ships hidden from everyone — reps, marketing, and admins alike:

- **Pitch to Marketing** — any internal user pitches a marketing idea and tracks the decision
- **Submissions inbox** — the marketing review queue for those pitches, both at `/marketing/submissions` and as a third tab in the Marketing Admin Center (Page 7)
- **Email templates** — marketing writes and designs the pitch notification emails
- **All Documents** — a flat, searchable index over the whole resource library
- **Portal Access** — the shared authorized-emails manager (Page 9)

The card lists exactly what's about to become visible before you flip it. It is **off unless explicitly turned on** — unlike every other tool in the app, which is on by default.

**Flip it once, deliberately, when marketing is ready to run the pitch workflow.** Flipping it back to Hidden takes all five surfaces away again without losing any data.

### The pitch workflow (once Site live is on)

An internal user pitches an idea with a category (Campaign, Social, Email, Event/Tradeshow, Ad, Content, Partnership, Website, Other). Marketing reviews it in the Submissions inbox and sets a review status: **Pending review → Needs info / Approved / Declined**. There's a two-way comment thread, and each decision emails the submitter using the templates marketing controls.

---

## Page 11 — Onboarding and offboarding checklists

### Onboarding an Anchor employee

- [ ] They sign in once with their `@anchorp.com` email (creates the profile automatically as `anchor_rep`).
- [ ] Users → set the right role (`anchor_rep` or `admin`).
- [ ] Notifications → add them as a *User* to every category they own.
- [ ] Sales Reps → if they carry a territory, add states and/or ZIP prefixes and a Teams link.
- [ ] Portal Access → add their email with the right level and team.
- [ ] Tell them: install to home screen, then Settings → Notifications → Enable.
- [ ] Point them at the Walkthroughs — every page has a guided tour button.

### Onboarding an external partner rep

- [ ] They sign in once (creates the profile automatically as `external_rep`).
- [ ] Users → turn on the **commission flag** if they're eligible to file commission claims. Without it, the commission form doesn't exist for them.
- [ ] Confirm their territory state is covered in Sales Reps so their consults route to somebody.
- [ ] Tell them: install to home screen, enable push.

### Offboarding anyone

- [ ] Users → downgrade or remove.
- [ ] Notifications → remove from **every** category. A departed person on a recipient list is the most common cause of "why did that email bounce."
- [ ] Sales Reps → reassign their states and ZIP prefixes to somebody. **Do this first** — an uncovered state means consults silently route to the fallback address only.
- [ ] Portal Access → remove.
- [ ] Reassign their open consults, orders, and support threads.

---

## Page 12 — When someone says it's broken

Work down this list before escalating.

| Report | Likely cause | Fix |
|---|---|---|
| **"It logs me out / bounces me to the login page."** | They're on the wrong build. Anchor staff on the external site, or a partner rep on the internal site, get redirected. | Send them the correct URL for their role. This is #1 by a wide margin. |
| **"I can't find the REC / commission / marketing order form."** | They're signed in as admin — forms are hidden from admins on purpose. | Use **View As** and pick a sales role. |
| **"The Admin Console vanished."** | View As is still set to a sales role from last time — the floating pill will say "Viewing as …". | Tap the pill, set it back to Admin. |
| **"The commission form isn't there."** | The commission flag is off on their profile, or they're internal (external reps only). | Users → turn on the flag. |
| **"I never got notified."** | Empty recipient list on that category, or their push isn't enabled on their device. | Notifications → check the category. Then have them check Settings → Notifications. |
| **"I get emails but never pushes."** | Their device subscription. Push is per-device and per-install. | Re-install the home-screen app, re-enable push, send a test. |
| **"Nobody contacted my customer."** | Territory gap — no rep covers that state or ZIP. | Sales Reps → check coverage for that state. |
| **"My consult disappeared."** | Region scoping. Reps see only their own territory. | Look it up yourself — you see everything. |
| **"Upload failed" / "Failed to parse body as FormData."** | The file exceeded the hosting request-size cap on an older upload path. | Developer escalation. Note the exact file size and which screen. |
| **"The Copilot doesn't know about X."** | Document isn't indexed, or isn't allow-listed. | Knowledge → check both. |
| **"The Friday report didn't arrive."** | Either nobody is assigned to `weekly_report`, or the scheduled job failed. | Check the recipient list first. If it's populated, escalate. |
| **"A photo I uploaded never showed up."** | It's sitting in Asset Reviews awaiting approval. | Approve it. |
| **A page shows "Coming soon."** | Rooftop Reports and Rooftop Audit Logic are placeholders — not built yet. | Not a bug. |
| **The NetSuite panel is greyed out.** | NetSuite credentials aren't connected yet, so the panel is intentionally inert. | Not a bug. A developer adds the credentials; it turns itself on. |
| **"The Marketing Hub is limited to admins and the Marketing team" — but I am both.** | Almost always the wrong build: the Hub only runs on the internal site. Being an admin doesn't help on the external one. | Open the internal site. If it persists there, check your Portal Access entry. |

**Before escalating anything, capture:** who (email and role), what URL, what they clicked, the exact error text, whether it was phone or desktop, and whether it's reproducible.

---

## Page 13 — What you do not touch

These are outside the admin UI and need a developer. Don't attempt them from a database console.

- **Anything in the Supabase dashboard.** All admin tasks have a UI. If you find yourself in a SQL editor, stop.
- **NetSuite credentials and sync failures.**
- **Email deliverability** — bounces, domain/SPF issues, the sending service.
- **Push signing keys.**
- **Environment variables and deployment settings.**
- **The scheduled Friday job.**
- **Storage buckets directly.** Upload through the app, never through the storage console — the app records metadata the console won't.

**Escalate with:** what you were doing, the exact error, the affected person's email, a timestamp, and a screenshot.

---

\newpage

# Page 14 — For a developer taking this on

*Everything above is operator documentation. This section is for an engineer making structural changes. Read `SITEMAP.md` alongside it — that file is the exhaustive inventory of routes, tables, notifications, and integrations, and it is kept accurate.*

## Stack

Next.js 16 (App Router, React 19, TypeScript, Tailwind v4) on Vercel. Supabase for Postgres + auth + storage + edge functions + pgvector. OpenAI for chat and embeddings. Resend for all transactional email. `web-push` (VAPID) for push. `next-pwa` for the service worker. NetSuite via an OAuth 1.0 TBA RESTlet.

Build is pinned to webpack (`next build --webpack`), not Turbopack, because `next-pwa` doesn't cooperate with the Turbopack build.

## The five things that will surprise you

**1. There are two deployments off one repo and one branch.**
Two Vercel projects both build `AnchorProducts/anchor-sales-copilot` on `main`: `anchor-internal` (`NEXT_PUBLIC_APP_MODE=internal`) and `anchor-sales-copilot` (unset = external). Env vars are per-project. A single push to `main` ships both.

`src/middleware.ts` cross-redirects by an `anchor-role` cookie: on the internal build, `external_rep` is bounced to `/`; on the external build, `admin`/`anchor_rep` are bounced to `/`. This applies to UI routes only, never `/api/*`.

*Gotcha:* the Vercel team has **"Require Verified Commits"** enabled at the team level. Unsigned commits cause builds to be **silently cancelled** with a message about an unverified commit. It's disabled at the project level on both current projects (since 2026-05-12), but any new Vercel project for this repo inherits the team default and will appear to just not deploy.

**2. Middleware is not your authorization layer.**
Middleware enforces only session presence on a small set of paths (`/chat`, `/api/chat`, `/api/docs`) plus the deploy split. **Real authorization is client-side UI gating plus 403s inside each API route.** If you add a privileged route, the gate goes in the route handler — putting it in middleware alone is a hole.

Most writes go through service-role API routes that bypass RLS entirely. RLS exists and is meaningful for direct-from-browser reads, but do not assume a table's RLS policy is protecting a write path; check the route.

**3. Uploads must not go through API routes.**
Vercel caps serverless request bodies at ~4.5MB. `await req.formData()` on a multipart upload throws `"Failed to parse body as FormData"` the moment a real photo shows up.

The established pattern, already applied across the app, is a two-phase signed-URL flow:
1. Browser POSTs small JSON `{ phase: "sign", fileName, contentType }`; the server (service-role client) calls `createSignedUploadUrl(path, { upsert })` and returns `{ bucket, path, token, signedUrl }`.
2. Browser uploads bytes straight to Storage via `supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType })`. The token authorizes the write, so no service key is exposed client-side.
3. If DB rows are needed, browser POSTs `{ phase: "commit", path, ... }` and the server validates the path prefix before recording metadata.

`upsert` belongs on `createSignedUploadUrl`, **not** on `uploadToSignedUrl` (no effect there). Already converted: `api/assets/upload-images`, `api/internal/asset-reviews/upload`, `api/admin/assets/upload`, `api/inventory/[id]/image`. **Any new upload feature must follow this.**

**4. The database is shared with a second application.**
Supabase project `mytlsruwxujfakxzbvtp` is shared with the **Anchor Internal Portal** (`~/Desktop/dev/anchorp-website`, Next 15 + Payload). The `mkt_*` tables and `portal_invites` are read and written by both. A schema change here can break that app.

Two premises worth internalizing:
- **`profiles` is this app's user list; `portal_invites` is the portal's allow-list.** They are not the same set. `src/lib/portalAccess.ts` treats the portal level+team as an *overlay*: an invite row wins, otherwise it falls back `admin→admin`, `anchor_rep→internal`, `external_rep→no portal level`. `requireMarketingUser()` deliberately demands a real invite row, because the shared `mkt_*` tables are gated on the portal's `is_marketing()` which reads only `portal_invites` — without that stricter check an app admin passes the app gate and then sees an empty board.
- **The `assets` table is not the library.** The `knowledge` bucket holds ~332 files; `assets` indexed only 25. This app's Resource Library has always listed the bucket directly; the portal's Documents view reads `assets`. `/api/admin/library/backfill` (admin-only, dry-run by default) indexes bucket files into `assets` so both surfaces see everything. Pointing the app at `assets` alone would be a ~92% content loss.

*Watch out:* a **separate** Supabase project named "AnchorP Academy" also contains `manufacturer_contacts` and `profiles` with similar data. Running migrations against it does nothing for this app. Verify you're on `mytlsruwxujfakxzbvtp` — it has `manufacturer_contacts` but no `courses`/`quizzes`/`lessons`.

**5. Migrations are applied by hand, and the schema cache lies.**
67 SQL files in `supabase/migrations/`, applied through the Supabase dashboard SQL editor. There's no CI migration step.

After DDL, PostgREST — which is what the app actually talks to — keeps serving a stale schema. **`NOTIFY pgrst, 'reload schema';` does not work**; the transaction-mode pooler drops LISTEN/NOTIFY, so it reports success and reloads nothing. Reliable reloads: make the change through the **Table Editor UI**, save any option under **Settings → API**, or restart the project.

Error codes distinguish the two failure modes: `42703` (raw Postgres "column does not exist") means the column genuinely isn't there; `PGRST205` means the table isn't in the cache.

## Architectural notes

**Feature flags: `admin_tools`.** A key/active table driving both the Admin Console tiles and the sales-rep dashboard tiles. `src/app/admin/cards.tsx` is the single source of truth for the console catalog — **keys are permanent**; changing one orphans its saved state.

**`site_live` inverts the convention.** Everywhere else in `admin_tools`, a *missing row means active* so new tiles light up on deploy. `site_live` is the opposite: **missing means off**. It gates the entire App↔Portal reconciliation feature set (Pitch to Marketing, Submissions, Email templates, All Documents, Portal Access). Enforcement lives inside `requireInternalUser` / `requireMarketingUser` / `requireAdminUser` in `portalAccess.ts`, so new routes using those guards inherit it for free. Server-side reads (`src/lib/flags/server.ts`) **fail closed** — missing row, missing table, or read error all mean dark.

**Notifications are a registry, not scattered calls.** `src/lib/push/topics.ts` defines the category ("tool") keys. Recipients resolve from two tables: `notification_tool_assignments` (app users → email + push) and `notification_tool_emails` (raw addresses → email only). Empty list falls back to `reports@anchorp.com` or a tool-specific env var. Adding a notification means adding a topic key, not inventing a new recipient mechanism. Region-scoped marketing routing uses dynamic keys of the form `marketing_order_region:<repId>`.

**NetSuite is gated on its own credentials, not on a flag.** `src/lib/netsuite/config.ts` exports `isNetSuiteConfigured()`, true only when all six `NETSUITE_*` vars are present and non-empty. Both `GET /api/leads/[id]` and `GET /api/fm-intake/[id]` return that boolean as `netsuiteConfigured` (never the credentials). The shared `NetSuitePanel` renders greyed with a "Coming soon" badge when false, and the automatic-sync effect short-circuits. `POST /api/leads/[id]/netsuite-sync` returns **503** with the list of missing vars as a backstop. Populate the six vars and the feature appears — there is no flag to flip.

`fm_intake_submissions` carries the same five `netsuite_*` columns as `leads` (migration `20260729_000002`), so the panel can show real state once wired — but **the intake push itself does not exist yet**. The `netsuite-lead-sync` edge function takes a `lead_id` and only handles leads; intakes render the panel read-only (`NetSuitePanel` without `onSync`). Wiring them means extending that edge function and adding a sync route, not just adding credentials.

Note the actual OAuth 1.0 TBA call is made by the `netsuite-lead-sync` **edge function**, which reads these from Supabase secrets, not from the Next.js environment. So they must be set in three places: `.env.local`, both Vercel projects, and `supabase secrets set`. The UI gate can only see the first two.

**Lead routing is data, not code.** `sales_reps` maps people to `states[]` and `zip_prefixes[]`. It's seeded with 11 named reps and is the only place real humans are hardcoded. Territory changes are an admin task, not a deploy.

**All enums are `text` + CHECK constraints.** No native Postgres enums anywhere. Status values are mirrored in TypeScript constants (`src/lib/marketingOrders.ts` is the model — the comment there explains the intent). **Change both, or the DB check constraint rejects a value the UI happily offers.**

**Storage is private.** Two buckets, `knowledge` and `lead-uploads`, both private. Every read is a server-generated `createSignedUrl`. There is one intentional public path (`/api/public/doc`) used by anchorp.com's Resource Library, gated to a specific set of prefixes (`solutions/`, `anchor/u-anchors/`, `spec/`). Don't widen it casually.

**Background work** lives in three Supabase edge functions — `netsuite-lead-sync`, `revision-change-email` (target of a `pg_net` webhook on `assets` revision changes), `training-digest` — plus one Vercel cron (`vercel.json`, Fridays 17:00 UTC → `/api/reports/weekly`, guarded by `CRON_SECRET`).

**The document notification fires on replacement, in application code.** It used to hang off a QMS-style revision label: a text field on one obscure screen, wired through a DB trigger and the `revision-change-email` edge function. No asset ever had a revision set, so it never fired — but it would have, on the first person to type in that box. Migration `20260729_000003` retired that path:

- `trg_assets_notify_revision_change` and its function are **dropped**, which makes the `revision-change-email` edge function unreachable. It stays deployed but is dead; delete it when convenient.
- The topic key was renamed `document_revision` → `document_replaced`, and existing recipient rows were carried over so nobody silently stopped being notified.
- The notification is now sent from the commit phase of `POST /api/admin/assets/upload` when `replace === true`, so it fires exactly once per completed replace and can name the file and the person.
- The revision UI is gone (both the per-card editor and the rep-agreement upload field), and `/api/internal-assets/revision` — its only writer — was deleted.
- `assets.revision` is **not** dropped. It's unused and nothing reads or writes it, but the column is shared with the portal, so removing it is a separate, verified decision.

## If you're making large-scale changes

- **Read `SITEMAP.md` first.** It is current and comprehensive — routes, every API endpoint, every table with its columns and RLS posture, all 15 email types with their recipients, all 16 push types, buckets, edge functions, and env vars.
- **Grep before you rename.** Status strings and `admin_tools` keys are duplicated between TypeScript constants and SQL check constraints on purpose.
- **Test both deploys.** A change that works on internal can be invisible or broken on external because of the middleware split and `appMode.ts` branding. Test with all three roles, and test View-As.
- **Check the other app.** Before touching `mkt_*`, `portal_invites`, `assets`, or `profiles`, open the portal repo. Verify actual row counts in the shared project rather than trusting any spec's framing of what a table contains — both divergences documented above were invisible from either repo alone.
- **Ship risky work behind `site_live`** (or a new `admin_tools` key). The pattern exists and works: build it dark, flip it once.
- **`SITEMAP.md` is part of the deliverable.** If you change routes, tables, or notifications, update it in the same PR. It's the only reason this handoff is possible.

### Known gaps, honestly stated

- Rooftop Reports and Rooftop Audit Logic are `ComingSoon` placeholders with backing tables (`assessment_reports`, `rooftop_assessment_config`) but no UI.
- The learning admin page lives at a route under `/api/…` (`src/app/api/admin/learning/page.tsx`) with no inline role gate — a wart worth fixing.
- `notification_settings` (a single-row table) is largely superseded by the tool-assignment tables but still referenced. Consolidating them is a real cleanup.
- `sales_regions` is dead weight superseded by `sales_reps`.
- Several base tables predate the repo's migrations; their columns were reconstructed from later `ALTER`s and from code. `SITEMAP.md` marks these with ⚠.
- No automated test suite. Verification is manual, across two deploys and three roles.

## The complete site map

Everything below is generated from `SITEMAP.md` — routes by role, every API endpoint, every table with its columns and RLS posture, all 15 email types with their recipients, all 16 push types, storage buckets, edge functions, and env vars. Expand any section.

> **Currency note:** `SITEMAP.md` was last revised 2026-07-08 and does **not** yet cover the App↔Portal reconciliation work (the pitch-to-marketing routes, `/admin/portal-access`, `/assets/documents`, and the `mkt_*` tables). Treat those as documented in the sections above but absent from the inventory below, and update `SITEMAP.md` when that work merges.

<!--SITEMAP-->
