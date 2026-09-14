# Anchor Sales Co-Pilot — Admin SOP

**For:** Anchor admins (`admin` role)
**Version:** 2.0 — 2026-09-08
**Scope:** every tool that is *switched on* right now. Anything currently deactivated is listed in Section 9 and nowhere else.
**Companions:** `SALES-SOP.md` (the internal sales team's version) · `SITEMAP.md` (exhaustive technical inventory) · `SOP.md` (v1.0 narrative handbook + developer handoff)

---

## 1 — How to read this

Section 2–5 is setup and the three things that break most often. Section 6 is one page per active admin tool: what it is, where it is, what you do in it, and what bites. Section 7–8 are the recurring rhythms and the people checklists.

**Active is a live setting, not a fact about this document.** Every tool below is on because a row in `admin_tools` says so (or because no row exists — see Section 5). If someone flips a switch in **Manage Tools**, this document goes stale in that one spot. Re-check `/admin/tools` before you trust a "this is active" claim here.

**Active as of 2026-09-08:** 14 of the 16 admin console tools are switched on, and 13 of them actually appear on the console — Portal Access is one of the 14 but stays hidden while `site_live` is off. Plus Manage Tools and Contacts, which are always reachable. On the rep side, 7 of the 8 sales tools offered to internal reps are on, and 5 of the 7 offered to external reps. One of those internal tools — **Showcase Stop** — is additionally restricted to a named list of people (Section 6.15).

---

## 2 — Getting yourself set up

Do these once, in order.

1. **Get an account.** Sign in at the login page with your `@anchorp.com` email. Your profile is created on first load. `@anchorp.com` → `anchor_rep`. Everyone else → `external_rep`.
2. **Get promoted.** A current admin opens **Admin Console → Users**, finds you, and sets Role to `admin`. You cannot do this for yourself, and until it happens `/admin` does not exist for you.
3. **Install it on your phone.** Open the internal site in Safari (iOS) or Chrome (Android) → Share → Add to Home Screen. Launch it from the icon at least once.
4. **Turn on push.** In the app: **Settings → Notifications → Enable**, then accept the browser prompt. On iOS push only works from the installed home-screen app — never from a Safari tab.
5. **Assign yourself to your notification categories.** `/admin/notifications`. Add yourself as a *User* on every event you own. Skip this and submissions arrive silently. This is the single highest-consequence configuration in the app — see Section 4.
6. **Send yourself a test push.** Settings → Notifications → Send test. Nothing arriving means the subscription never registered: delete the home-screen app, re-install, re-enable.

### Your three homes

| Where | What it's for |
|---|---|
| `/dashboard` | Day-to-day landing. Hero tile, quick actions, stat circles. |
| `/admin` | Admin Console — every active tool as a bento tile. |
| `/dashboard/opportunities` | Active Consults, the triage queue. You will live here. |

---

## 3 — Roles, and the View-As trap

Three roles, exactly.

| Role | Who | Sees |
|---|---|---|
| `external_rep` | Outside partner reps, OEM reps | Submission forms, Copilot, Resource Library, marketing orders. No queues, no admin. |
| `anchor_rep` | Anchor internal staff | Everything external sees, **plus** Active Consults, the Marketing Admin Center, Internal assets, and the Knowledge admin. |
| `admin` | You | Everything. |

Change a role at **Users → click the person → Role → Save**. It takes effect on their next page load; tell them to refresh or sign out and back in.

### The trap: as an admin you cannot open the submission forms

`useFormAccess` blocks admin-as-admin from every submission form and redirects to `/dashboard`. This is deliberate, not a bug — an admin's own submissions would pollute the queues they triage.

To see or test a form, use **View app as** and pick `anchor_rep` or `external_rep`. The override lives in your browser's local storage, survives reloads, and syncs across tabs.

> **Turn View-As off when you're done.** A forgotten override is the number one cause of "the Admin Console disappeared." Two forms are external-only, so previewing as internal will still bounce you: the Commission Claim and the Rooftop Equipment Consult identifier flow.

### One codebase, two sites

The internal build (Anchor staff) and the external build (partner reps) run the same code on different domains. The app bounces you to the correct one; an Anchor account loading an external-site page lands on the login screen, and vice versa. **This is the most common "the site is broken" report you will get.** Check which domain they're on before anything else.

Both builds are installable PWAs with push. Nothing goes through an app store.

---

## 4 — Notifications (read this one twice)

`/admin/notifications` is where you decide who hears about what.

### How it works

Each event is a "tool key." For every one you assign:

- **Users** — app users. They get an **email and a push**. Push additionally requires that person to have enabled it on their own device under Settings → Notifications.
- **Emails** — plain addresses that aren't app users (a shared inbox, a distribution list). **Email only, never push.**

### The events you can assign

| Key | Fires when |
|---|---|
| `new_consult` | A rep submits a consult / opportunity |
| `marketing_order` | A rep submits a marketing order |
| `marketing_order_status` | An order moves to processing, shipped, fulfilled, or cancelled |
| `commission_claim` | An external rep submits a commission claim |
| `notable_project` | A rep submits a notable installation with photos |
| `support_request` | A rep files an in-app help request |
| `asset_review` | An internal rep uploads a tackle-box photo for approval |
| `weekly_report` | The Friday analytics summary (email + push) |
| `document_replaced` | A library document is replaced — same link, new contents |
| `inventory_low_stock` | A marketing inventory item hits or drops below its threshold |
| `inventory_grab` | Someone scans the aisle QR and takes stock |
| `fm_intake` | A Rooftop Equipment Intake (FM form) is submitted |

Plus one **per-region marketing tool per inside rep**, generated automatically as `marketing_order_region:<rep id>`. These appear and disappear as you add and remove inside reps in Sales Reps.

### The two things that bite

1. **An unassigned event is a silent event.** There is no default recipient and no warning. Submissions land in the database and nobody is told. Audit this list monthly.
2. **A "User" with push disabled still gets the email.** So a quiet phone does not mean broken routing — check the inbox before you go debugging push.

### Routing that is automatic and separate

- **Consults** route by territory as well as category: the submitting rep's service state (and ZIP, in Texas) resolves to a sales rep, who is notified alongside the `new_consult` list.
- **Marketing orders route by region, never to the inside rep directly.** An order resolves to its inside rep, and that rep's `marketing_order_region:<id>` list — the *manager* you assigned — is what gets notified. Assign every region's manager or those orders go nowhere.
- **Large orders** (more than 10 units of any single type — samples, printables, swag, counted per type and never summed) get a line in the notification email pointing at NetSuite instead of marketing stock. Nothing is blocked or flagged automatically; whether it needs a custom run is the marketing admin's or inside rep's call.

---

## 5 — The activation model

Everything in `/admin/tools` writes to one table, `admin_tools`, keyed by a stable string.

**The convention: no row means active.** New tools light up the moment they deploy; only an explicit `active = false` row hides one. That is why the table has nine rows and the app has thirty-odd tools.

Three kinds of key live there:

| Key shape | Controls |
|---|---|
| `oem-analytics`, `users`, `knowledge`, … | One admin console tile |
| `sales:internal:<tool>` / `sales:external:<tool>` | One rep-facing dashboard tile, **per audience** — you can give internal reps a tool and withhold it from external reps |
| `site_live` | The master switch (below) |

Deactivating an admin tile **removes it from the console**; it is not shown greyed out. Deactivating a sales tool removes that dashboard tile for that audience, and also stops the dashboard hero from promoting it.

### The second gate: tools restricted to named people

A handful of tools are narrower than a whole audience. They live in a separate table, `tool_user_access`, and **both gates have to pass**: the audience switch decides whether the tool exists at all, and the named list decides who on that side of the app can see or open it.

In Manage Tools these carry an **Assigned** badge and a "Who can use it" section under the audience switches. Today exactly one tool works this way: **Showcase Stop**.

Two consequences worth holding on to:

- **An assigned tool with nobody on the list is invisible to everyone**, including you. That is a legitimate way to hold a finished tool back — the empty list is the dark switch — but it looks identical to a broken deploy if you've forgotten. The picker says so in as many words when the list is empty.
- **There is no admin bypass.** An admin who isn't on the list doesn't see the tile either. That's deliberate: it stops you concluding a tool works because your own view is special. Add yourself in one click when you need to test.

### `site_live` — the one key that inverts the rule

`site_live` is the only key where **a missing row means OFF**. The whole App ↔ Portal feature set ships dark and has to be switched on deliberately, exactly once.

It is currently **off**. Turning it on releases all five of these at the same time — there is no way to release them individually:

- **Pitch to Marketing** (`/dashboard/pitch`) — any internal user pitches a marketing idea and tracks the decision
- **Submissions inbox** (`/marketing/submissions`, and a third tab in the Marketing Admin Center) — the review queue for those pitches
- **Email templates** (`/marketing/email-templates`) — marketing writes and designs the pitch notification emails
- **All Documents** (`/assets/documents`) — a flat, searchable index over the shared resource library
- **Portal Access** (`/admin/portal-access`) — the shared authorized-emails list, which also writes through to the Anchor Internal Portal

> Do not flip `site_live` casually. It is visible to every user the moment it saves, and Portal Access edits reach a second product. Have the marketing owner ready before you turn it on.

---

## 6 — The active admin tools

Thirteen visible console tiles, plus Manage Tools and Contacts.

### 6.1 Analytics — `/admin/analytics`
*Badge: Analytics · featured tile*

One dashboard with three panels sharing a single search box and day window. The panel is in the URL, so any view is linkable.

| Panel | Shows |
|---|---|
| **Overview** | Activity totals for the window, top clicks by label and path, and a recent-events feed |
| **OEM matrix** | The adoption grid — which manufacturer accounts are actually using the app |
| **People** | One searchable directory of every person: app users, OEM reps, tech reps, consultants |

- The search answers "show me Carlisle" from whichever panel you're on — you don't have to switch first.
- **From a People row you can open that person's Copilot chat.** This is the fastest way to answer "what is this rep actually asking?" and to spot a knowledge gap worth fixing in the Knowledge tool.
- PDF export is available for the panels.
- **Contacts** in the navbar goes to `/admin/manufacturer-contacts` — manufacturer reps and independent consultants.
- The old `/admin/user-analytics` URL still resolves and lands you in this dashboard on the right panel.

**Weekly:** open Overview at 30 days, then People sorted by recent activity. Anyone provisioned more than two weeks ago with zero events is an onboarding failure, not a usage statistic.

### 6.2 Users — `/admin/users`
*Badge: Config*

One place to edit every person — app users, OEM reps, tech reps, and consultants. Click anyone to open the editor.

You can set: full name, email, phone, company, **role**, service states, Texas ZIP, OEM details, and the **commission flag**.

- **Service states drive routing.** A rep with no service state is invisible to territory resolution and their submissions route to nobody in particular. Fix this at provisioning time, not after the first complaint.
- **Texas is split by ZIP** between reps. A TX service area without a ZIP is an incomplete profile.
- **The commission flag (`anchor_commission`) is per-user and off by default.** An external rep cannot see or file a Commission Claim until you turn it on for them — the dashboard tile and the API both check it. This is the correct answer to "why can't I file a claim?"
- Role changes apply on the person's next page load.

### 6.3 Sales Reps — `/admin/sales-reps`
*Badge: Config*

Configure inside (internal) and outside (external) sales reps: regions and states, Teams links, and contact info.

This feeds three things at once:
1. The **Contact Your Rep** popup on every rep's dashboard (Teams link + email for outside reps, email for inside reps).
2. **Consult territory routing.**
3. **Marketing order region routing** — every inside rep you create generates a `marketing_order_region:<id>` entry in Notifications. **Creating the rep is only half the job; go assign that region's manager.**

Removing an inside rep orphans their region tool and its assignments. Reassign the region before you delete anyone.

### 6.4 Notifications — `/admin/notifications`
*Badge: Config*

Covered in full in Section 4. Audit monthly.

### 6.5 Support Queue — `/admin/support`
*Badge: Config*

In-app help requests from external and internal reps. Tabs: **Open**, **Closed**, **All**, with live counts on the first two.

Open a thread to read it, reply in-app, and close it. The rep sees your reply in the app and gets an email. Requests fire `support_request` to whoever you assigned.

**Daily:** clear Open. A support thread is a rep who is blocked right now.

### 6.6 Projects / Active Consults — `/dashboard/opportunities`
*Badge: Analytics · the tile is called Projects, the page is Active Consults*

Every Rooftop Equipment Consult submitted across all users and regions. This is your triage queue.

**Two states, and only two.** A consult is `New` or `Assigned`, and **status is derived from the assignee, never chosen independently** — the assignment panel *is* the status control. There is no status dropdown, and the badge can never contradict the assignment.

Working one:
1. Open it. Read company, site address, roof type and brand, solutions requested, timeline, and the photos or video attached to each solution.
2. Assign it to the right rep in the assignment panel. That flips it to Assigned and notifies them.
3. To hand it back to the pool, clear the assignee — it returns to New.

**NetSuite sync is displayed but not live.** A sync status appears on the detail view; treat it as informational. Nothing is being written to NetSuite.

### 6.7 Commission Claims — `/admin/commission-claims`
*Badge: Analytics*

Every commission claim filed by external reps. Rows expand in place to show rep information and order details.

Only external reps with the `anchor_commission` flag can file at all (Section 6.2). Claims fire `commission_claim`.

### 6.8 Notable Projects — `/admin/notable-projects`
*Badge: Analytics*

Submitted notable installations — photos plus a short writeup from the rep. This is the showcase pipeline; review it when marketing needs content. Fires `notable_project`.

### 6.9 Marketing Admin Center — `/admin/marketing`
*Badge: Config*

Two tabs today: **Orders** and **Inventory**. (A third, Submissions, appears only when `site_live` is on.) The tab is in the URL, so views are shareable.

#### Orders

The progress path is **new → processing → shipped → fulfilled**. **Cancelled** and **delayed** sit outside that path — a cancelled order stops, a delayed one is still moving but flagged.

Each order carries an activity trail and a chat thread, so the conversation with the requesting rep lives on the order instead of in email. Every status change fires `marketing_order_status`.

Orders route to the region manager, not the inside rep — Section 4.

#### Inventory

Five categories, shared with the order form: **Samples**, **Printables** (stored under the legacy key `brochures` — the label changed, nothing was re-filed), **Swag**, **Tradeshow**, and **Other**.

- **Location is a dropdown, not free text**, with a sensible default per category. Keep it that way; free-text locations made stock un-findable.
- **Low-stock threshold** per item. Crossing it fires `inventory_low_stock`.
- **Filters for "out on loan" and "picked up at the aisle"** answer the two questions you actually have when a count looks wrong.
- **Kits** (the pizza-box kits) list their component pieces as the individual items they are, so you can see which piece is the one that ran out.

#### Tradeshow stock is a loan, not an order

Tradeshow items are **not orderable**. That stock goes out for an event and comes back, so it moves through the checkout flow instead of an order that ships it away and decrements it permanently. A tradeshow item is always checkout-eligible regardless of the per-item flag.

**Inside reps check gear out from their own page** (`/marketing-inventory`) — they name the event, and marketing books it out and tracks the due-back date. A loan past its due-back date is **overdue**; chase those from the Inventory tab.

#### The aisle QR

A public, no-login QR at `/grab/<token>` lets anyone standing at the marketing aisle self-report what they took. It is a cart: name and email once, then a quantity on any number of items. The name and email are remembered on that device for next time.

Each pickup decrements stock automatically and fires `inventory_grab` with the person, item, and quantity.

> The QR needs a public, non-SSO domain to work. If scanning it lands people on a login screen, the token is fine — the domain is wrong.

### 6.10 Project Intake — `/admin/fm-intake`
*Badge: Config*

Submitted project intakes / quote requests from existing customers, including any FM details. There is also a **New intake** form here so you can enter one on someone's behalf.

**Two states, derived the same way as consults:** `New` until it has an assignee, `Assigned` once it does. Assigning is the only thing that writes status.

On each submission you review the attachments and the roof detail the rep supplied — deck type and thickness, coverboard type and thickness, whether it's an FM project, whether it's FM insured, and the FM Index-Record number — then leave **review notes / a recommendation**.

A NetSuite sync status is displayed. As with consults, it is informational only.

Submissions fire `fm_intake`.

### 6.11 Knowledge — `/admin/knowledge`
*Badge: Content*

Curate what the Copilot knows. Three tabs:

| Tab | What you do |
|---|---|
| **Feedback** | Read what users flagged on Copilot answers, filtered by status |
| **Corrections** | Review corrections users submitted against specific answers, and fold the good ones in |
| **Docs** | The indexed library, grouped by category → solution, using the CEO catalog labels |

Internal users see "✓ Accurate" and "Needs correction" under each Copilot answer while the model is in testing. **That stream is only worth having if somebody reads it.** Pair this with the People panel in Analytics: read a rep's actual chat, then fix the source doc.

### 6.12 Asset Reviews — `/admin/asset-reviews`
*Badge: Content*

Photos internal reps uploaded for solution tackle boxes, awaiting your approval. Filter by **pending**, **approved**, or **rejected**; approve or reject from the row.

Uploads fire `asset_review`. Nothing an internal rep submits appears in the library until it's approved here — a rep saying "I uploaded it and it's not there" almost always means it's sitting in pending.

### 6.13 Walkthroughs — `/admin/walkthroughs`
*Badge: Content*

Preview the guided page tours users get when they tap the walkthrough button on a page. Read-only preview — use it to check a tour still matches the page after a UI change.

### 6.14 Manage Tools — `/admin/tools`

The activation manager. Per-tool switches for the admin console, per-audience switches for the sales tools, per-user assignment for the tools that carry an **Assigned** badge, and the `site_live` master switch. Section 5 explains the model.

Saves are optimistic and roll back with an error banner if the write fails. If a tile doesn't change for a user, have them reload — the console reads activation and grants on page load.

### 6.15 Mobile showcase — who may file stops

*The tool itself is a rep-facing tile (`/dashboard/showcase`); the admin job is deciding who gets it.*

The mobile showcase is the truck that goes out to yards and events. Whoever is driving it photographs each stop and files it from their phone; **marketing publishes or declines it on anchorp.com**, and the public schedule only ever shows published stops. Nothing a rep files goes live on its own.

**Your job is the list.** Manage Tools → Sales rep tools → Showcase Stop → **Assign people**. Only the people you name there see the tile or can open the page, and the API refuses everyone else — knowing the URL is not enough.

Keep the list short. This is one or two people who are actually on the road, not a team.

What you do *not* do here: publishing, declining, and writing the decline reason all happen on the website, in **Marketing → Pages → Mobile showcase**. The reason you type there is what the rep sees back in the app, so write it for them.

**Who keeps the schedule.** Some people on the list also get a **Schedule** tab. It shows every stop, pending and declined included. From it they can fix a stop's date, city, event and note, attach a photo, or remove the stop. That tab is decided by the **website**, not here. A person keeps the schedule if their `portal_invites` row has the **Showcase** flag (anchorp.com → Marketing → Authorized users), **or** their role is `admin`, **or** their team is `marketing`. The website's own doc says only the flag counts, but that's wrong. The app asks the website when the page opens and shows the tab only if the website says yes, so the rule lives in one place. Keepers still have to be on this list to open the page at all.

Keepers can't publish, and there's no publish button anywhere in the app. Saving a published stop changes the website immediately. A photo they add waits for marketing, and a photo that's already live can't be replaced from the app.

> **Known gap:** when marketing declines *only the photo* on a stop that's already live, the person who filed it still sees **On the site** under My submissions. Nothing tells them the photo was turned down. Only the Schedule tab shows the photo back to missing, with the reason. Until the website reports photo declines to submitters, tell them directly.

> **HEIC:** the app converts every photo to JPEG before uploading, because the website publishes the file unchanged and Chrome, Firefox and Android can't show HEIC. Anything that uploads to the website some other way can still put a HEIC on the public page. The website should reject or convert HEIC itself.

> **Not usable until anchorp.com is cut over.** The endpoints the app calls live on the new website, which isn't serving that domain yet. Until it is, anyone assigned gets a plain "the showcase isn't live on anchorp.com yet" message rather than a confusing failure — but there is no point assigning anybody before then.

> **Second gate:** the person also has to be an authorized portal user for the website to accept their submission. See Portal Access — which is itself behind `site_live` (Section 5), so that list can't be managed in-app today.

### 6.16 Contacts — `/admin/manufacturer-contacts`

Manufacturer reps and independent consultants. Reachable from the Analytics navbar. This is where the commission tag on non-app contacts lives.

---

## 7 — Your operating rhythm

**Every morning (10 minutes)**
1. `/dashboard/opportunities` — assign every `New` consult.
2. `/admin/support` — clear the Open tab.
3. `/admin/marketing?tab=orders` — move anything stuck in `new`.
4. `/admin/asset-reviews` — clear pending photos.

**Weekly**
- Read the Friday analytics report when it lands.
- `/admin/fm-intake` — assign anything still `New`.
- `/admin/marketing?tab=inventory` — low stock, and overdue tradeshow loans.
- `/admin/knowledge` → Feedback and Corrections.

**Monthly**
- Audit `/admin/notifications` end to end. Every event has a recipient; every region has a manager; nobody who left is still on a list.
- Audit `/admin/users` for people with no service state.
- Skim `/admin/tools` and confirm the active set still matches what you think is live.

---

## 8 — Onboarding and offboarding

**Onboarding an Anchor employee**
1. They sign in once with their `@anchorp.com` address — this creates the profile as `anchor_rep`.
2. Users → set their service states (and TX ZIP if relevant).
3. Promote to `admin` only if they actually need it.
4. Sales Reps → add them as an inside or outside rep if they carry territory.
5. If they're a new inside rep: Notifications → assign the manager on their new region tool.
6. Walk them through installing the PWA and enabling push.
7. Hand them `SALES-SOP.md`.

**Onboarding an external partner rep**
1. They sign in with their own email — created as `external_rep`.
2. Users → set service states (and TX ZIP).
3. Turn on the **commission flag** if they're entitled to file claims.
4. Confirm they're on the **external** domain. Sending them the internal URL is the most common onboarding failure.

**Offboarding anyone**
1. Users → change their role or clear their access.
2. Notifications → remove them from every event and region tool. **Do this second and do not skip it** — an assignment on a departed user's account is a notification going nowhere.
3. Sales Reps → remove or replace them, and reassign their region's manager.
4. Manage Tools → take them off any **Assigned** tool (Showcase Stop) and name their replacement, or the truck goes out with nobody able to file a stop.
5. Reassign their open consults, intakes, and support threads.

---

## 9 — What is switched off right now

Do not document, demo, or train on any of these. Verify at `/admin/tools` before you act on this list.

| Off | Key | Why |
|---|---|---|
| **Rooftop Reports** | `rooftop-reports` | Deactivated *and* marked coming-soon |
| **Rooftop Audit Logic** | `rooftop-logic` | Deactivated *and* marked coming-soon |
| **Rooftop Equipment Audit** (rep tile) | `sales:internal:rooftop`, `sales:external:rooftop` | Off for both audiences |
| **Marketing Orders for external reps** | `sales:external:marketing-orders` | Internal reps keep it; external reps do not |
| **Portal Access** | behind `site_live` | Removed from the console entirely, not greyed out |
| **Pitch to Marketing** | behind `site_live` | |
| **Submissions inbox** | behind `site_live` | |
| **Email templates** | behind `site_live` | |
| **All Documents** | behind `site_live` | |

The whole OSHA rooftop audit feature — the rep-facing assessment, the reports queue, and the decision-tree editor — is off end to end. One loose thread: an admin's dashboard stat circle still links to `/admin/rooftop-reports`. It goes to a deactivated tool. Ignore it, or have it removed.

---

## 10 — When someone says it's broken

Work down this list in order. The first four cover most of it.

1. **Which domain are they on?** Internal account on the external site (or the reverse) bounces to login. This is the most common report by a distance.
2. **Do they have View-As on?** An admin missing the console has almost always left an override set.
3. **"I can't open the form."** Admins can't, by design. Check the role, then check View-As.
4. **"I can't file a commission claim."** The per-user commission flag is off. Users → turn it on.
5. **"Nobody got notified."** `/admin/notifications` — is the event assigned at all? For marketing orders, is the *region manager* assigned?
6. **"Push doesn't work."** iOS only pushes to the installed home-screen app. Re-install, re-enable, send a test. The email will have arrived either way.
7. **"My upload failed."** Large files must go browser → storage via a signed URL. A "Failed to parse body as FormData" error means something is routing through the API instead and hitting the ~4.5 MB body cap.
8. **"My photo isn't in the library."** It's in Asset Reviews, pending.
9. **"The QR sends me to a login page."** The QR is on the wrong (SSO) domain.
10. **"The tile disappeared."** `/admin/tools` — somebody deactivated it, or it's behind `site_live`.
11. **"I can't see Showcase Stop."** It's an assigned tool: they're not on the list. Manage Tools → Showcase Stop → Assign people. This applies to admins too — there's no bypass.

---

## 11 — What you do not touch

- **`site_live`**, unless you have decided to release all five surfaces at once and the marketing owner is ready.
- **Tool keys.** They are stable identifiers tying the UI to `admin_tools` rows. Change one and every saved activation for that tool orphans silently.
- **The `brochures` category key.** The label is "Printables"; the key stays `brochures` because every inventory item and recipient mapping references it.
- **Notification tool keys.** Same reason — renaming one orphans its assignments. `document_revision` was already renamed to `document_replaced` once, and recipients had to be carried over by hand.
- **The NetSuite sync fields.** They're display-only. Nothing is syncing.

---

*This SOP describes the active tool set as of 2026-09-08. Activation is a live setting — confirm at `/admin/tools`.*
