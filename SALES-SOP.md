# Anchor Sales Co-Pilot — Internal Sales SOP

**For:** Anchor internal sales (`anchor_rep` role) — inside and outside reps on the Anchor Internal site
**Version:** 1.0 — 2026-09-08
**Scope:** every tool that is switched on for internal sales right now. Anything deactivated is in Section 10.
**Companion:** `ADMIN-SOP.md` (what your admin does with what you submit)

---

## 1 — What this app is for you

Six tools on your dashboard, plus four supporting pages. In one sentence each:

| Tool | You use it to |
|---|---|
| **Resource Library** | Find the spec sheet, tackle box, or internal doc you need in front of a customer |
| **Copilot (AI)** | Ask what solution fits a roof and get pointed at the right products and next step |
| **Talk to a Rep or Request a Quote** | Start a Rooftop Equipment Consult (new to Anchor) or a Project Intake quote (existing customer) |
| **Active Consults** | Triage the consults external reps submit in your region |
| **Notable Projects** | Log an installation worth showing off |
| **Marketing Orders** | Order samples, printables, swag, and collateral |
| **Showcase Stop** *(assigned only)* | File a mobile showcase stop from the road — where it went, what happened, a photo |

Plus: **Marketing Inventory** (see stock, check out tradeshow gear), **Support** (get help from an admin), **Settings** (your territory and notifications), and **FAQ**.

---

## 2 — Setting yourself up

Do this once. Twenty minutes, and it determines whether the app works for you at all.

1. **Sign in** with your `@anchorp.com` email on the **Anchor Internal** site. Your profile is created automatically as an internal rep.

   > **Use the internal URL.** The internal and external sites run the same app on different addresses. An Anchor account on the external site just bounces to a login screen. If the app "won't let you in," check the address bar first.

2. **Install it on your phone.** Safari (iOS) or Chrome (Android) → Share → **Add to Home Screen**. Open it from the icon at least once. It behaves like a real app from then on.

3. **Set your service area.** Settings → Service Area. **Add every state you cover** — each one connects you to that state's sales reps and puts the right consults in your queue. If you cover Texas, you must also enter your ZIP: Texas is split by ZIP between reps.

   > This is the field that quietly breaks everything else. No service state means no territory, which means consults don't reach you and the Contact Your Rep popup is empty.

4. **Turn on notifications.** Settings → Notifications → Enable, then accept the browser prompt. On iPhone, push only works from the home-screen app — not from a Safari tab.

5. **Fill in the rest of your profile** — name, company, phone. It appears on everything you submit.

### Finding your way around

- **`/dashboard`** — your home. A green hero tile promoting whatever you use most, then Quick Actions, then two stat circles.
- The **search bar** on the dashboard searches products directly. As an internal rep your results include the **Internal** section that external reps never see.
- **Contact Your Rep** (a stat circle) opens your assigned reps with a Teams link and email for outside reps, and email for inside reps. Filter by state if you cover several.
- Most pages have a **walkthrough button** that runs a guided tour of that page. Use it once per new tool.

---

## 3 — Resource Library — `/assets`

Browse solution tackle boxes, spec sheets, and Anchor assets. Three sections:

| Section | What's in it |
|---|---|
| **Solutions** | Solution tackle boxes — everything for one solution in one place |
| **Anchor** | Anchor product and corporate assets |
| **Internal** | Internal-only material — **internal reps only**. External partner reps cannot see this section at all. |

The Internal section holds three kinds of thing: **tackle boxes**, **document lists** (`/internal-assets/docs/<product>`), and **contacts lists** (`/internal-assets/contacts/<product>`).

### Two things to know

**Library links are stable.** Documents on anchorp.com's Resource Library point at the app through a redirect. When a document is replaced with a newer file, **the link doesn't change — the contents do.** So a link you sent a customer last quarter serves today's version. Don't re-send links assuming they went stale, and don't assume the PDF on your desktop is current.

**You can contribute photos.** Internal reps can upload photos to solution tackle boxes. They go into a review queue and **appear in the library only once an admin approves them.** If your photo isn't showing up, it's pending approval — not lost.

---

## 4 — Copilot (AI) — `/chat`

Your Anchor Products sales expert. Tell it what you're securing and it points you to the right solution.

**What it's good at:** narrowing to a solution from a description of the roof and the equipment, telling you what to look at next, and surfacing the documents behind its answer.

**What it hands off:** engineering questions — spacing, loads, code compliance — get routed to the Anchor Products team rather than answered. That's the correct behavior. Don't argue it into a number.

### Your conversations persist

Chats are saved per conversation, and the app returns you to your last active one instead of the most recent. You can switch between conversations. Ask a question on your laptop in the morning and pick it up on your phone at the job site.

> Assume your chats are readable. Admins can open a person's Copilot chat from the People panel in Analytics — that's how knowledge gaps get found and fixed. It's a coaching tool, not surveillance, but write accordingly.

### Rate the answers — this is part of your job

Under each answer, internal users get **"✓ Accurate"** and **"Needs correction."**

- Right answer → tap **✓ Accurate**.
- Wrong answer → tap **Needs correction** and say what's right. Or just reply in the thread and correct it.

Both land in the Knowledge admin, where an admin folds them into the source documents. The Copilot only gets better at your job if the people doing that job tell it when it's wrong. **Rate the wrong answers especially** — a silent bad answer is one another rep will hit next week.

---

## 5 — Talk to a Rep or Request a Quote — `/dashboard/get-started`

One tile fronting two different forms. The chooser asks which situation you're in:

| Choose | Goes to | When |
|---|---|---|
| **I'm new to Anchor** | Rooftop Equipment Consult (REC) | A customer who doesn't work with Anchor yet |
| **I already work with Anchor** | Project Intake (quote request) | An existing customer who needs a quote |

Pick correctly — they land in different queues, in front of different people.

### 5.1 The Rooftop Equipment Consult

Required on every REC:

- **Project name**
- **Project site address** — street, city, state, ZIP, country (US, Canada, or Mexico)
- **Roof type** and **roof brand**
- **Timeline** — immediate, 2–4 weeks, 2–3 months, 3–6 months, 6–12 months, or over a year
- **Solutions** — pick from the catalog, or "Other" and name it

**Every solution you list needs at least one photo or video.** The form will not submit without one, and it says which solution is missing. This is not bureaucracy: the person triaging it is deciding what to recommend from your photos, and a consult without them goes back to you as a question.

Once submitted it routes to whoever handles new consults, plus the sales rep whose territory covers the site.

### 5.2 The Project Intake (quote request)

For existing customers. Beyond the basics it asks for the roof detail an engineer needs: **roof deck type and thickness**, **coverboard type and thickness**, whether it's an **FM project**, whether it's **FM insured**, and the **FM Index-Record #** if so. Attachments are supported.

An admin reviews it, assigns it, and writes back a **recommendation**. Check back on the intake for that recommendation — it isn't emailed as a decision.

---

## 6 — Active Consults — `/dashboard/opportunities`

**Internal reps only.** External partner reps submit consults; you triage them.

The queue shows Rooftop Equipment Consults submitted by external reps in your region.

**Two states, and only two: `New` and `Assigned`.** There is no status dropdown — **assigning a consult is what makes it Assigned**, and clearing the assignee sends it back to New. The badge can't disagree with reality.

### Working one

1. Open it and read the whole thing: company, site address, roof type and brand, requested solutions, timeline, and the photos or video on each solution.
2. If it's yours, assign it to yourself. If it belongs to someone else's territory, assign it to them.
3. Contact the rep and the customer.
4. Hand it back to the pool by clearing the assignee if it turns out not to be yours.

**Don't leave consults sitting in New.** New means nobody has picked it up, and it's the state an admin chases every morning.

The detail view shows a NetSuite sync status. It's informational — nothing is being written to NetSuite yet.

---

## 7 — Notable Projects — `/dashboard/notable-projects/new`

Submit a notable rooftop installation with photos and a short writeup. It feeds the showcase and gives marketing something real to work with.

Good candidates: an unusual roof, a large job, a clean install worth photographing, a solution used in a way people don't expect. Take the photos while you're on the roof — nobody goes back for them.

Submissions notify whoever owns the notable-project queue.

---

## 8 — Marketing: orders, inventory, and the aisle

### 8.1 Marketing Orders — `/marketing-orders`

Order samples, printables, swag, and collateral. Four orderable categories:

| Category | What |
|---|---|
| **Samples** | Product samples and demo units |
| **Printables** | Spec sheets, catalogs, printed collateral |
| **Swag** | Branded apparel, giveaways, promotional items |
| **Other** | Anything else — describe it |

**Tradeshow is not orderable** — booth kit, displays, and banners are borrowed and returned. See 8.3.

Filling the form: pick a category, search the catalog, and set quantities. There's a free-text box for anything that isn't in the catalog at all ("a roof membrane sample, custom signage").

**Required:** a **needed-by date**, and a full shipping address — recipient name, street, city, state, ZIP. There's a notes box for the deadline, the event name, or anything the marketing team should know. **Use it.** "For the Denver show on the 14th" prevents most of the back-and-forth.

**Where your order goes:** to the marketing manager for your region — routed automatically through your inside rep's territory, not to the inside rep personally. You don't pick a recipient.

**Ordering more than 10 units of a single type** (samples, printables, or swag — counted per type, never added together) flags the order as large. Marketing may route it to a custom run through NetSuite instead of pulling it from stock. Nothing is blocked; it's a judgment call on their end. If you know it's a big ask, say why in the notes.

**Tracking it:** orders move **new → processing → shipped → fulfilled**. **Cancelled** and **delayed** sit outside that path — delayed means it's still coming, just late. Each order has an activity trail and a **chat thread**: ask about your order there, not by email, so the answer lives on the order.

### 8.2 Marketing Inventory — `/marketing-inventory`

What's actually in stock right now. Search it, browse by category, and see quantity available — including how many units are **out on loan**.

Check here before you order. Kits list their component pieces individually, so you can see which piece of a kit is the one that's short.

### 8.3 Tradeshow gear is a loan, not an order

Booth kit, displays, and banners go out for an event and come back. **You check them out yourself, from the Inventory page** — you don't file a marketing order for them.

1. Find the item on `/marketing-inventory`.
2. Tap **Check out**.
3. Name the event and confirm.

Marketing books it out and tracks the due-back date. **Return it on time.** A loan past its due-back date shows as overdue and someone will come asking — usually while trying to send the same kit to the next show.

### 8.4 The aisle QR

There's a QR code at the marketing aisle. Scan it, and you can self-report what you're taking without logging in — enter your name and email once, then set a quantity on anything you're grabbing. Your name and email are remembered on your phone for next time.

**Scan it every time you take something off the shelf.** It's the only thing keeping stock counts honest, it decrements automatically, and it notifies marketing. Thirty seconds at the aisle beats a week of nobody knowing the swag is gone.

---

### 8.5 Showcase Stop — only if you're assigned

**This tile is a named list, not a role.** An admin assigns specific people to it in Manage Tools, and if you're not one of them you won't see it at all — that's normal, not a fault. It's for whoever is actually on the road with the mobile showcase.

If you are on the list, `/dashboard/showcase` is where you file a stop:

- **Date** — defaults to today, because most stops are filed the day they happen
- **City** and **Event** — both required
- **Note** — optional, up to 1000 characters
- **One photo** — optional, from the camera or camera roll

Then tap **File this stop**.

**Filing is not publishing.** Every stop is filed *pending*. Marketing publishes or declines it on anchorp.com, and the public schedule only ever shows published stops — so nothing you file appears on the website on its own, and you can't make it.

**What you've filed** sits under the form with each stop's status — **pending**, **published**, or **declined** — and, when a stop is declined, the reason marketing gave. Read the reason: it's usually something you can fix by filing again with a better photo or a clearer note. You can't edit a stop after filing; file a new one and marketing declines the first.

### Filing from a yard with one bar

The screen is built for exactly that. **The photo uploads the moment you choose it**, not when you submit — so by the time you hit File, the slow part is already done. If the submit itself fails, the photo stays uploaded: tap File again and it re-sends the form only. You never upload the same picture twice.

One photo per stop. If you shot five, pick the one that shows the crowd or the truck.

> **Not live yet.** Until anchorp.com is switched over to the new site, filing a stop returns "The showcase isn't live on anchorp.com yet." Nothing is broken and nothing is lost — the feature simply isn't reachable until that cutover happens.

---

## 9 — Support, settings, and the FAQ

### Support — `/dashboard/support`

File an in-app help request. Anchor admins read every one; you get a reply in the app and an email. Your own threads show as **open** or **closed** on the same page.

Use it for anything about the app itself — a tile that vanished, a form that won't submit, a document that's wrong. Faster than finding the right person.

### Settings — `/dashboard/settings`

- **Profile** — name, company, phone
- **Service Area** — every state you cover, plus your ZIP if you cover Texas
- **Notifications** — enable push and send yourself a test

Revisit Service Area whenever your territory changes. It's what routes work to you.

### FAQ — `/dashboard/faq`

Short answers to the common questions. Check it before filing a support request.

---

## 10 — What you don't have, and why

Not on your dashboard — don't go looking, and don't promise it to a customer.

| Not available | Why |
|---|---|
| **Rooftop Equipment Audit** (the OSHA-guided assessment) | Switched off for everyone. The tile may show as "Coming soon." |
| **Commission Claim** | External partner reps only, and only when an admin has enabled it per-person. Internal Anchor sales don't file these. |
| **Showcase Stop**, if it isn't on your dashboard | It's assigned per person. If you're taking the showcase out, ask an admin to add you in Manage Tools. |
| **Pitch to Marketing** | Built but not released yet |
| **All Documents** (the flat library index) | Built but not released yet |

If a tool you expect is missing, an admin can check its switch in Manage Tools. Ask through Support.

---

## 11 — Quick troubleshooting

| Symptom | First thing to check |
|---|---|
| "It won't let me log in" | Are you on the **internal** site? An Anchor account on the external site bounces to login. |
| "No consults are reaching me" | Settings → Service Area. No states means no territory. Covering TX? You need the ZIP too. |
| "My photo isn't in the library" | It's pending admin approval in Asset Reviews. |
| "Nobody responded to my marketing order" | Check the order's chat thread. If it's still `new` after a couple of days, file a Support request — the region manager may not be assigned. |
| "Push notifications don't arrive" | On iPhone, push only works from the home-screen app. Re-install it, re-enable in Settings, send a test. Emails arrive either way. |
| "My upload fails on a big file" | Large files can fail on upload. File a Support request with the file size. |
| "The link I sent shows different content" | That's correct — library links are stable and serve the current version of a replaced document. |
| "I don't see the Showcase Stop tile" | It's assigned per person. Ask an admin to add you — admins don't see it by default either. |
| "The Copilot gave me a bad answer" | Tap **Needs correction** and say what's right. That's the fix, and it's on you to report it. |

---

## 12 — The habits that make this work

1. **Keep your service states current.** Everything routes off them.
2. **Photograph every solution on a consult.** The form requires one; the person triaging needs more.
3. **Assign consults out of New the day they land.**
4. **Rate Copilot answers — especially the wrong ones.**
5. **Scan the aisle QR every single time you take stock.**
6. **Return tradeshow gear by its due-back date.**
7. **Put the deadline and the event in the marketing order notes.**
8. **Use the order chat thread instead of email**, so the answer stays with the order.

---

*This SOP describes the tools active for internal sales as of 2026-09-08. Tool availability is a live setting an admin controls — if something here isn't on your dashboard, ask through Support.*
