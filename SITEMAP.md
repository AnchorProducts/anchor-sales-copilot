# Anchor Sales Co-Pilot — Comprehensive Site Map

_Last updated: 2026-07-08. Covers routes (external / internal / admin), API surface, notifications (emails + push, with recipients & names), database tables, storage buckets, and integrations._

---

## 1. Roles & access model

Roles live on `profiles` (`role` + `user_type`). Profiles auto-create on first dashboard/chat load: `@anchorp.com` emails → `anchor_rep`/`internal`, everyone else → `external_rep`/`external`.

| Role | user_type | Sees |
|---|---|---|
| `external_rep` | external | Submission forms only — consult (REC), commission, notable project, marketing orders, marketing inventory |
| `anchor_rep` | internal | Consult triage queue + shared tools + some admin pages (inventory, marketing-orders, knowledge) |
| `admin` | internal | Everything — all triage, analytics, reviews, knowledge, notifications config |

**View-As** (`src/lib/role/viewAs.ts`): admins preview the app as any role via a `localStorage` override. UI gating uses the *effective* role; data fetches/sign-out use the *real* session. Admin-as-admin cannot open submission forms — must View-As a sales role.

**Two-deploy split** (`src/lib/appMode.ts` + `src/middleware.ts`): `NEXT_PUBLIC_APP_MODE=internal` = internal build, unset = external build. Middleware cross-redirects by the `anchor-role` cookie (external reps kept out of internal build; Anchor staff kept out of external build). Middleware only enforces auth presence + the deploy split — page-level role gating is client-side + API 403s.

---

## 2. Public / Auth routes

| Route | Purpose |
|---|---|
| `/` | Login (Supabase) + redirect already-authed users |
| `/forgot` | Request password reset |
| `/reset` | Set new password |
| `/signup` | Listed in middleware `PUBLIC_PATHS` — no `page.tsx` (handled on `/`) |
| `/auth/callback` | Magic-link / OAuth callback (route handler) |

---

## 3. Shared routes (all authenticated roles)

| Route | Purpose |
|---|---|
| `/dashboard` | Role-aware home hub — hero + quick-action cards + stat tiles |
| `/chat` | AI Sales Copilot (RAG over knowledge base) |
| `/assets` | Resource Library browser (internal users also see internal-assets section) |
| `/assets/[id]` | Product "Tackle Box" detail |
| `/docs/view` | Full-screen document viewer |
| `/dashboard/settings` | Profile / service-state / NetSuite-sync-mode settings |
| `/dashboard/faq` | FAQ |
| `/dashboard/support` | Personal support-thread list (admins redirect → `/admin/support`) |
| `/dashboard/support/[id]` | Support thread detail |

---

## 4. External Rep routes (`external_rep`)

| Route | Purpose | Gate |
|---|---|---|
| `/dashboard/opportunities/new` | **Rooftop Equipment Consult (REC)** submission | `sales` audience (ext + anchor) |
| `/dashboard/notable-projects/new` | Notable Project submission (photos) | `sales` |
| `/marketing-orders` | Order samples / brochures / swag | `sales` |
| `/marketing-inventory` | Browse marketing inventory | `sales` |
| `/dashboard/commission/new` | Commission Claim form | **external_rep only** + `anchor_commission` flag |
| `/rooftop` | Rooftop Audit — `ComingSoon` placeholder | `sales` |

---

## 5. Internal / Anchor Rep routes (`anchor_rep`)

Anchor reps see all shared + sales-form routes, plus:

| Route | Purpose | Gate |
|---|---|---|
| `/dashboard/opportunities` | **Active Consults** triage queue (region-scoped) | internal (admin + anchor_rep) |
| `/dashboard/opportunities/[id]` | Consult detail — status, assignment, meeting link, attachments, NetSuite sync | internal |
| `/internal-assets/docs/[productId]` | Per-product internal docs | internal content |
| `/internal-assets/contacts/[productId]` | Per-product manufacturer contacts | internal content |

Three "admin" pages also admit `anchor_rep`: `/admin/inventory`, `/admin/marketing-orders`, `/admin/knowledge`.

---

## 6. Admin routes (`admin`)

Hub `/admin` renders tiles from `src/app/admin/cards.tsx`.

| Route | Purpose | Gate |
|---|---|---|
| `/admin` | Admin console hub | admin |
| `/admin/analytics` | OEM analytics | admin |
| `/admin/user-analytics` | Per-user activity analytics | admin |
| `/dashboard/reports` | "What every Anchor employee is doing" activity report | admin (via API 403) |
| `/admin/users` | User management (roles, `anchor_commission` toggle) | admin |
| `/admin/sales-reps` | Sales-rep territory (state / ZIP) assignment | admin |
| `/admin/notifications` | Notification recipient config (who gets emailed/pushed) | admin |
| `/admin/support` + `/admin/support/[id]` | Support queue + thread | admin |
| `/admin/commission-claims` | Review commission claims | admin |
| `/admin/notable-projects` | Review notable projects | admin |
| `/admin/marketing` | Marketing Admin Center | admin |
| `/admin/marketing-orders` | Marketing order fulfillment queue | admin + anchor_rep |
| `/admin/inventory` | Marketing inventory management | admin + anchor_rep |
| `/admin/fm-intake` | Rooftop Equipment Intake (FM form) review | admin |
| `/admin/knowledge` | Knowledge base / doc library management | admin + anchor_rep |
| `/admin/asset-reviews` | Approve/reject rep photo uploads | admin |
| `/admin/manufacturer-contacts` | Manage OEM/consultant contact directory | admin |
| `/admin/walkthroughs` | Trigger in-app page tutorials | admin (via hub) |
| `/admin/tools` | Activate/deactivate tool tiles (`admin_tools`) | admin |
| `/admin/rooftop-reports` | Assessment reports — `ComingSoon` | admin |
| `/admin/rooftop-logic` | Rooftop audit logic — `ComingSoon` | admin |
| `/api/admin/learning/page.tsx` | Learning admin (doc allow-list + correction console; page under an `/api/…` path) | no inline gate |

---

## 7. Navigation surfaces

- **Desktop sidebar** (`AppSidebar.tsx`): Dashboard, Copilot, Assets, Support, Settings, Sign out for all. Sales roles add REC / Notable / Marketing Orders / Commission. `anchor_rep` adds Active Consults. `admin` adds Admin + Reports.
- **Mobile bottom nav** (`MobileBottomNav.tsx`): Dashboard + 2 recents + Settings, recents filtered per role.
- **Dashboard quick-action cards** (`dashboard/page.tsx`): sales personas see form cards; admin sees Copilot/Assets/Active Consults/Admin Console/Assessment Reports (forms hidden — must View-As). Deactivated `admin_tools` are stripped from sales viewers' hero + cards.

---

## 8. API routes

### Auth
- `POST /api/auth/callback`, `POST /api/auth/sync`

### Chat / Knowledge / Learning
- `POST /api/chat` — Copilot (OpenAI + RAG, injects matched corrections)
- `POST /api/corrections` — per-message corrections (teaches copilot)
- `POST /api/feedback` — thumbs / rating on answers
- `GET /api/docs`, `GET /api/doc-open` (signed URL + `doc_opened` event), `POST /api/doc-event`
- `GET /api/knowledge-counts`, `/api/knowledge-list`
- `GET /api/public/doc`, `/api/public/library` — signed public doc access
- `POST /api/admin/learning/action`, `/api/admin/learning/summary`
- `GET /api/admin/knowledge/library-docs`

### Forms / Triage
- `POST /api/leads` (submit consult) · `GET /api/leads` (triage, region-scoped) · `GET/PATCH /api/leads/[id]` · `POST /api/leads/[id]/netsuite-sync`
- `POST /api/commission`
- `POST /api/notable-projects`
- `GET/POST /api/marketing-orders` · `PATCH` (status) · `/api/marketing-orders/[id]/messages` · `/[id]/activity` · `/unread`
- `POST /api/fm-intake` · `GET /api/fm-intake/[id]`
- `POST /api/support` · `/api/support/[id]` (reply)
- `POST /api/rooftop` — Rooftop Equipment Audit (service-role, config-driven prompt)

### Inventory
- `GET/POST /api/inventory` · `/api/inventory/[id]/image` · `/api/inventory/checkouts`

### Assets / Uploads
- `POST /api/assets/upload-images`, `/api/internal/asset-reviews/upload`, `/api/internal-assets/rep-agreements/upload`, `/api/internal-assets/revision`
- Admin: `/api/admin/assets/upload|delete|rename-sheets`, `/api/admin/products`, `/api/admin/asset-reviews`, `/api/admin/oem-matrix`

### Admin config
- `GET/POST /api/admin/sales-reps`, `/api/admin/users`, `/api/admin/manufacturer-contacts[/[id]]`, `/api/admin/rooftop-logic`, `/api/admin/rooftop-reports`, `/api/admin/commission-claims`, `/api/admin/tools`, `/api/admin/user-activity`, `/api/admin/user-events`
- `GET/PUT /api/admin/notification-settings`, `GET/PUT /api/admin/notification-tools`

### Push
- `POST /api/push/subscribe`, `/api/push/unsubscribe`, `GET /api/push/status`, `POST /api/push/test`

### Analytics / System
- `POST /api/user-events`, `GET /api/user-events/most-used`
- `GET /api/reports/weekly` — Friday cron (Resend + prune), guarded by `CRON_SECRET`
- `GET /api/sales-reps/by-state`, `/api/health`, `/api/status`

---

## 9. Notifications

Two channels, unified by a **"tool" (event category)** registry (`src/lib/push/topics.ts`). Recipients per tool come from two tables — `notification_tool_assignments` (app users → **email + push**) and `notification_tool_emails` (raw addresses → **email only**). Managed at **`/admin/notifications`**.

- **Email** via **Resend**. Default from: **`Anchor Co-Pilot <reports@anchorp.com>`** (override `LEAD_NOTIFICATIONS_FROM`).
- **Push** via **web-push** (VAPID). Subject `mailto:notifications@anchorp.com`. Requires a `push_subscriptions` row per device.
- **Recipient tables are NOT seeded** — every tool ships with zero recipients; admins configure them. When empty, code falls back to `reports@anchorp.com` (or the tool-specific env var).

### Notification tools (event categories)

| Tool key | Label | Fires on |
|---|---|---|
| `new_consult` | New consult | REC / opportunity submitted |
| `marketing_order` | Marketing order placed | Marketing order submitted |
| `marketing_order_status` | Order status change | Order phase changes |
| `commission_claim` | Commission claim | Commission claim submitted |
| `notable_project` | Notable project | Notable install submitted |
| `support_request` | Support request | Support ticket filed |
| `asset_review` | Photo for review | Rep uploads tackle-box photo |
| `weekly_report` | Weekly analytics | Friday summary (email + push) |
| `document_revision` | Document revision change | `assets.revision` label updated (QMS) |
| `inventory_low_stock` | Inventory low stock | Item hits low-stock threshold |
| `fm_intake` | Rooftop Equipment Intake (FM) | FM intake submitted |
| `marketing_order_region:<repId>` | Per-region marketing (dynamic) | Outside-rep order routed to region's inside rep/manager |

### Emails sent

| # | Event | Recipients | Subject |
|---|---|---|---|
| E1 | New consult (REC) | Region-resolved reps (see roster below) **+** `new_consult` tool | `New Opportunity Assigned - {company} ({id8})` / `New consult — …` |
| E2 | Commission claim | `commission_claim` tool → fallback `reports@anchorp.com` (PDF attached) | `Commission Claim - {company} ({id8})` |
| E3 | Marketing order placed | `marketing_order` tool | `Marketing Order - {category} ({id8})` |
| E4 | Marketing order — confirmation | Submitting rep | `We got your marketing order - …` |
| E5 | Marketing order — regional manager | `marketing_order_region:{repId}` tool | `Marketing order from {who} — …` |
| E6 | Marketing order status change | `marketing_order_status` tool (branded HTML) | `Marketing order updated — {status}` |
| E7 | Marketing order chat | Team→rep: order submitter · Rep→team: `marketing_order` tool | `New message about your marketing order …` / `New message on marketing order …` |
| E8 | Notable project | `notable_project` tool | `Notable Project - {name} ({id8})` |
| E9 | Support request (new) | `support_request` tool | `Support — {subject} ({id8})` |
| E10 | Support reply | Ticket requester | `Re: {subject}` |
| E11 | FM intake | `fm_intake` tool | `Rooftop Equipment Intake — {name} ({id8})` |
| E12 | Inventory low stock | `inventory_low_stock` tool | `Low stock — {item}` |
| E13 | Weekly analytics (cron) | `weekly_report` tool / `WEEKLY_REPORT_TO` (2 PDFs) | `Anchor Sales Co-Pilot — Weekly Analytics …` |
| E14 | Document revision change | `document_revision` tool (via `assets` DB webhook → `revision-change-email` edge fn) | `Revision update: {doc} → {rev}` |
| E15 | Training digest (daily edge fn) | env `ADMIN_ALERT_EMAILS`; from `onboarding@resend.dev` | `Anchor Co-Pilot digest: {N} corrections, {M} low ratings` |

_NetSuite lead sync sends no notification — it only writes sync status back to the lead._

### Push notifications

`new_consult` (P1), region reps (P2), `commission_claim` (P3), `marketing_order` (P4), order creator confirm (P5), regional manager (P6), `marketing_order_status` (P7), order chat both directions (P8/P9), `notable_project` (P10), `support_request` (P11), `fm_intake` (P12), `asset_review` (P13), `inventory_low_stock` (P14), `weekly_report` (P15), self-test (P16). `document_revision` is email-only (no push).

### Seeded lead-routing roster (`sales_reps`) — the only hardcoded human recipients

**External / outside reps:**
| Name | Email | Territory |
|---|---|---|
| George Varney | george.varney@anchorp.com | Northeast (ME NH VT MA RI CT NY NJ) |
| Robert J. Alvarez | robert@anchorp.com | South Central (TX OK NM CO KS MO AR LA) |
| Justin Smith | justin@anchorp.com | West + Upper Midwest |
| Harley Coleman | harley.coleman@anchorp.com | Southeast (AL FL GA MS NC SC TN) |
| Brandon Reynolds | brandon.reynolds@anchorp.com | Mid-Atlantic / OH Valley (PA OH WV KY VA MD DE DC) |
| Daymon Vargas | daymon@anchorp.com | Greater Houston & TX Gulf (ZIP 770-777, 779) |

**Internal / inside reps** (also anchor the per-region marketing tools):
| Name | Email | Region |
|---|---|---|
| Crystal Serrano | c.serrano@anchorp.com | West + Upper Midwest + Mid-Atlantic |
| Nora Menendez | nora.mendez@anchorp.com | South Central (TX etc.) |
| Katerina Little | katerina.little@anchorp.com | Southeast + Northeast |
| Merry Garcia | merry.garcia@anchorp.com | Houston / Gulf TX |

_(Scott Carpenter, OEM director — intentionally not seeded.)_ Role/system addresses referenced in code: `reports@anchorp.com`, `notifications@anchorp.com`, `marketing@anchorp.com`, `samples@anchorp.com`, `swag@anchorp.com`, `orders@anchorp.com`, `onboarding@resend.dev`.

---

## 10. Database (Supabase Postgres, `public` schema)

Roles in RLS: `admin`, `anchor_rep`, `external_rep`. Most writes go through service-role API routes (bypass RLS). Base tables marked ⚠ predate the repo's migrations (columns reconstructed from ALTERs + code).

### Profiles / Auth
- **`profiles`** ⚠ — 1:1 with `auth.users`. `role`, `email`, `full_name`, `company`, `phone`, `manufacturer_contact_id` FK, `anchor_commission` bool, `service_zip`, `service_state`, `service_states[]`, `netsuite_sync_mode` (`manual`|`automatic`).

### Leads / Consults
- **`leads`** — REC submissions (largest table). `customer_company`, `details`, `location_text`, `region_code`, `created_by` FK, `attachments` jsonb, `status` (`new|assigned|contacted|qualified|closed_won|closed_lost`), `assigned_rep_user_id` FK, meeting fields (`wants_video_call`, `meeting_link`, `meeting_request_type`), NetSuite sync (`netsuite_company_id/contact_id/deal_id`, `netsuite_sync_status`, `netsuite_sync_error`), project fields (`project_address`, `state`, `roof_type`, `roof_brand`, `needed_month/year`, `solution_requests` jsonb, `project_timeline`), contact prefs, inside/outside assignment, submitter snapshot. _(hubspot_* → netsuite_* renamed.)_ RLS: ext insert/select/update own (update gated `status='new'`); internal all.
- **`sales_regions`** — `region_code` PK → `rep_user_id` FK (early routing, superseded by `sales_reps`).

### Sales Reps / Contacts
- **`sales_reps`** — per-person routing roster. `kind` (`internal|external`), `name`, `email`, `teams_link`, `states[]`, `zip_prefixes[]`. Seeded with 11 named reps.
- **`manufacturer_contacts`** — OEM rep + consultant directory (94KB seed). `manufacturer`, `contact_type`, `company`, `rep_kind` (`sales|tech`), `anchor_commission`, name/email/phone/cell/title/territory/region, `raw` jsonb.
- **`manufacturer_contact_manufacturers`** — M2M contact ↔ OEMs.
- **`profile_manufacturers`** — M2M profile ↔ OEMs.
- _(`consultant_contacts` + `profiles.consultant_contact_id` — dropped, merged into manufacturer_contacts.)_

### Commission
- **`commission_claims`** — `created_by` FK, rep snapshot, certification fields, order details (`company_placing_order`, `u_anchors_ordered`, `qty`, `roof_brand`, `job_name`, `roof_type`), ship-to, `status`. RLS: ext insert/select own; internal all + update.

### Notable Projects
- **`notable_projects`** — `created_by` FK, submitter snapshot, `name`, `location`, `description`, `photos` jsonb (in `lead-uploads`), `status`. RLS: ext own; internal all + update.

### Assessment / Rooftop
- **`assessment_reports`** — `user_id` FK, `contractor_name`, `company_name`, `access_type` (`ladder-audit|ladder-recommendation|hatch-audit|stairs-audit`), `flags_count`, `file_url`.
- **`rooftop_assessment_config`** — single row `id=1`, `system_prompt` override for the audit.

### FM Intake
- **`fm_intake_submissions`** — Universal Rooftop Equipment Intake. Contact/project fields, `equipment[]`, `payload` jsonb (buildings, HVAC, pipe stacks), `attachments` jsonb (in `knowledge`), review workflow (`status` `new|in_review|recommended|closed`, `review_notes`, `reviewed_by/at`). RLS: admin read.

### Marketing Orders
- **`marketing_orders`** — `created_by` FK, submitter snapshot, `categories[]`, `items`, `quantity`, `ship_to`, `needed_by`, `status` (`new|processing|shipped|fulfilled|delayed|cancelled`), `projected_ship_date`, `delay_notes`, `updated_by`, `last_message_at`.
- **`marketing_order_messages`** — per-order chat. `order_id` FK, `author_id`, `author_role`, `body`, `attachments` jsonb (in `knowledge`). Trigger bumps parent `last_message_at`.
- **`marketing_order_reads`** — per-user read state (unread badge).
- **`marketing_order_activity`** — attributed status-change audit log (admin/anchor_rep read).

### Inventory
- **`marketing_inventory_items`** — `name`, `sku`, `location`, `image_path` (in `lead-uploads`), `unit_cost`, `quantity_available/out`, `low_stock_threshold`.
- **`marketing_item_checkouts`** — tradeshow loan log. `item_id` FK, `event_name`, `quantity`, `due_back_date`, `status` (`out|returned`), damaged/returned counts.
- **`marketing_order_item_usage`** — bridge: which inventory items a fulfilled order consumed.

### Resource Library — Products / Assets
- **`products`** ⚠ — tackle boxes. `name`, `section`, `series`, `active`, `hidden`, `solution_group`.
- **`assets`** ⚠ — files on a product (bytes in `knowledge`). `product_id` FK, `title`, `type`, `category_key`, `path`, `visibility`, `revision` (QMS label), `last_updated`, `updated_by`. Triggers: touch `last_updated`; notify revision change (pg_net webhook).
- **`pending_uploads`** — rep photo review queue. `product_id` FK, uploader snapshot, `storage_path` (`pending/…`), `status` (`pending|approved|rejected`), review fields.

### Knowledge / Learning (RAG)
- **`knowledge_documents`** ⚠ — `title`, `status`, `allowed`, `audience`, `content`, `metadata`, `source_path`.
- **`knowledge_chunks`** ⚠ — `document_id` FK, `content`, `embedding` vector(1536), `product_tags[]`, `token_count`.
- **`knowledge_corrections`** ⚠ — teaching corrections. `correction`, `user_message`, `assistant_message`, `embedding` vector(1536), `active`. RPC `match_knowledge_corrections()`.
- **`knowledge_feedback`** ⚠ — thumbs/ratings. `rating` (1–5), `note`, message context.

### Support
- **`support_requests`** — `created_by` FK, submitter snapshot, `subject`, `status` (`open|closed`), `last_message_at`.
- **`support_messages`** — `request_id` FK, `author_id`, `author_role`, `body`, `attachments` jsonb (in `knowledge`). Trigger bumps parent.

### Notifications & Settings
- **`notification_settings`** — single row `id=1`. `commission_recipient_email`, `weekly_report_emails[]`, `marketing_orders_recipients` jsonb, `notable_project_emails[]`, `support_emails[]`. _(Largely superseded by the tool system.)_
- **`notification_tool_assignments`** — `(tool_key, user_id)` → email + push. Admin-only.
- **`notification_tool_emails`** — `(tool_key, email)` → email only. Admin-only.
- **`admin_tools`** — feature flags. `key` PK, `active` bool. Authenticated read, admin write.

### Push
- **`push_subscriptions`** — one row per device. `user_id` FK, `endpoint` UNIQUE, `p256dh`, `auth`, `user_agent`. Own-row RLS.

### Analytics
- **`user_events`** — `user_id` FK, `event_type`, `page_path`, `metadata` jsonb (indexed on `oem` / `state`). 90-day retention via cron. Own insert/read; admin read all.

### Enums (all `text` + CHECK, no native enums)
`leads.status`, `leads.meeting_request_type`, `leads.preferred_contact_method`, `leads.netsuite_sync_status`, `assessment_reports.access_type`, `manufacturer_contacts.rep_kind`, `sales_reps.kind`, `marketing_orders.status`, `marketing_item_checkouts.status`, `support_requests.status`, `fm_intake_submissions.status`, `pending_uploads.status`, `profiles.netsuite_sync_mode`. Extensions: `vector`, `pg_net`.

### Triggers / functions
- `bump_support_request_activity()`, `bump_marketing_order_activity()` — bump `last_message_at`.
- `assets_touch_last_updated()`, `assets_notify_revision_change()` (pg_net webhook → `revision-change-email`).
- RPC `match_knowledge_corrections(query_embedding, match_count)` — vector retrieval.

---

## 11. Storage buckets (Supabase Storage — both private, signed access only)

| Bucket | Stores | Paths |
|---|---|---|
| **`knowledge`** | Product docs / data sheets, library docs, FM-intake photos & sheets, support attachments, marketing-order chat images, rep agreements, asset-review uploads, pending uploads | `fm-intake/<id>/`, `support/<id>/`, `marketing-orders/<id>/`, `internal-assets/rep-agreements/`, `pending/<product-id>/`, `solutions/` |
| **`lead-uploads`** | Notable-project photos, marketing-inventory images | `notable-projects/<id>/`, `inventory/<id>/` |

No public buckets — all access via server-side `createSignedUrl` / `download` with the admin service client.

---

## 12. External integrations & background jobs

| Service | Use |
|---|---|
| **Supabase** | Postgres, auth, storage, edge functions, pgvector |
| **OpenAI** | Copilot chat + `text-embedding-3-small` embeddings |
| **Resend** | All transactional email |
| **web-push (VAPID)** | Browser push notifications |
| **NetSuite** | CRM sync (OAuth 1.0 TBA RESTlet) — per-rep manual/automatic |
| **Vercel** | Hosting + cron (Friday 17:00 UTC → `/api/reports/weekly`), two deploys (internal/external) |
| **PWA** | `next-pwa` service worker (`public/sw.js`), separate internal/external icons + manifest |

### Supabase edge functions
| Function | Role |
|---|---|
| `netsuite-lead-sync` | Push leads to NetSuite (writes sync status back; no notification) |
| `revision-change-email` | Target of the `assets` revision webhook → Resend email to `document_revision` tool |
| `training-digest` | Daily digest of corrections + low ratings (email to `ADMIN_ALERT_EMAILS`); also 90-day `user_events` prune / weekly report support. Guarded by `CRON_SECRET` |

### Notable env vars
`RESEND_API_KEY`, `LEAD_NOTIFICATIONS_FROM`, `*_NOTIFICATIONS_EMAIL` (commission/marketing/notable/support/fm-intake fallbacks), `WEEKLY_REPORT_TO`, `REVISION_NOTIFICATION_EMAIL`, `ADMIN_ALERT_EMAILS`, `CRON_SECRET`, `REVISION_WEBHOOK_SECRET`, VAPID keys, `OPENAI_API_KEY`/`OPENAI_MODEL`, `NEXT_PUBLIC_APP_MODE`, NetSuite creds.
