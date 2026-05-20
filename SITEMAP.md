# Anchor Sales Co-Pilot — Site Map

## Authentication / Public

| Route | Purpose |
|---|---|
| `/` | Login (OTP via Supabase) |
| `/signup` | New external rep signup |
| `/forgot` | Password reset request |
| `/reset` | Password reset completion |
| `/auth/callback` | Supabase auth callback |

---

## Roles

| Role | Sees |
|---|---|
| `external_rep` | Forms only — consults, commissions, notable projects |
| `anchor_rep` | Triage queue scoped to their assigned states |
| `admin` | Everything — all triage, analytics, asset reviews, knowledge |

---

## External Rep flow

| Route | Purpose |
|---|---|
| `/dashboard` | Quick actions (Copilot, Assets, Consult form, Commission, Notable Project) |
| `/dashboard/opportunities/new` | **Rooftop Equipment Consult** submission form |
| `/dashboard/commission/new` | Commission claim form |
| `/dashboard/notable-projects/new` | Notable project submission |
| `/chat` | Sales Copilot |
| `/assets` | Asset library home |
| `/assets/[id]` | Product Tackle Box (per-solution) |
| `/internal-assets/contacts/[productId]` | Per-product contacts |
| `/internal-assets/docs/[productId]` | Per-product internal docs |
| `/docs/view` | In-app document viewer with Back-to-Solution button |
| `/dashboard/settings` | User settings |

---

## Internal Rep flow (`anchor_rep`)

| Route | Purpose |
|---|---|
| `/dashboard` | Hero + Active Consults quick action |
| `/dashboard/opportunities` | **Consult Queue** — auto-scoped to the rep's assigned states |
| `/dashboard/opportunities/[id]` | Opportunity detail — status, rep assignment, meeting link, attachment previews, HubSpot card *(potential)* |
| `/chat`, `/assets`, `/dashboard/settings` | Same as external |

---

## Admin

| Route | Purpose |
|---|---|
| `/admin` | Admin hub (card grid) |
| `/admin/sales-reps` | Manage outside reps + assigned states |
| `/admin/asset-reviews` | Approve/reject photo submissions from internal reps |
| `/admin/knowledge` | Curate Copilot knowledge sources + corrections |
| `/admin/notable-projects` | All notable project submissions |
| `/admin/rooftop-reports` | **Rooftop equipment AUDIT** submissions (admin-only viewer) |
| `/dashboard/reports` | **User Activity** dashboard — hero stats, charts (30-day events + event-type mix), per-user breakdown with avatars, search/sort, region triage history |
| `/api/admin/learning/page.tsx` | Document allow-list + correction ticket console (unusual location, still functional) |

---

## API routes

### Auth
- `POST /api/auth/callback` — Supabase auth callback
- `POST /api/auth/sync` — sync session cookies after OTP verify

### Chat / Knowledge
- `POST /api/chat` — Copilot
- `POST /api/corrections` — per-message corrections (internal)
- `POST /api/feedback` — thumbs up/down on answers
- `GET /api/docs` — knowledge search (auth-guarded)
- `GET /api/doc-open` — signed-URL doc opener + writes `doc_opened` analytics event
- `POST /api/doc-event` — instrumentation hook (writes to `doc_events`)
- `GET /api/knowledge`, `/api/knowledge-counts`, `/api/knowledge-list` — knowledge listing

### Forms / Triage
- `POST /api/leads` — external rep consult submission
- `GET /api/leads` — internal triage list (auto-scoped to rep's states for `anchor_rep`, full for `admin`)
- `GET /api/leads/[id]` — opportunity detail + pre-signed attachment URLs
- `PATCH /api/leads/[id]` — update status / assignment / meeting link
- `POST /api/leads/[id]/hubspot-sync` — *(potential)* forwards to the HubSpot edge function
- `POST /api/commission` — commission claim
- `POST /api/notable-projects` — notable project submission

### Analytics
- `POST /api/user-events` — page views + key actions (login, app_open, chat_message_sent, lead_submitted, doc_opened, etc.)
- `GET /api/admin/user-activity` — admin aggregates: per-user counts + 30-day series + event-type mix
- `GET /api/reports/weekly` — Mon-15:00 UTC cron, prunes `user_events` older than 90 days

### Admin
- `GET/POST /api/admin/sales-reps` — rep + state assignment management
- `GET/POST /api/admin/asset-reviews` — photo review queue
- `POST /api/admin/assets/upload`, `/api/admin/assets/delete`, `/api/admin/assets/rename-sheets`
- `GET /api/admin/products` — product catalog for tackle boxes
- `GET /api/admin/rooftop-reports` — audit submissions
- `GET /api/admin/knowledge/library-docs`
- `POST /api/admin/learning/action`, `/api/admin/learning/summary`

### Misc
- `GET /api/health`, `/api/status` — monitoring
- `POST /api/assets/upload-images` — internal rep photo uploads
- `POST /api/internal/asset-reviews/upload` — submit photo for review
- `POST /api/internal-assets/rep-agreements/upload` — rep agreement upload
- `GET /api/sales-reps/by-state` — region lookup
- `GET /api/recent-docs` — admin recent doc activity

---

## Database (Supabase, `public` schema)

| Table | Owner | Notes |
|---|---|---|
| `profiles` | all users | `role`, `user_type`, contact fields |
| `conversations`, `messages` | Copilot | RLS by `user_id` |
| `leads` | consult flow | `region_code` drives internal triage |
| `sales_reps` | admin-managed | `outside_sales_email` → `states[]` |
| `sales_regions` | legacy mapping | `region_code` → `rep_user_id` |
| `commission_claims` | external submissions | |
| `notable_projects` | external submissions | |
| `assessment_reports` | rooftop AUDIT data | admin-only viewer |
| `user_events` | analytics | 90-day retention pruned by weekly cron |
| `doc_events` | legacy doc-open tracking | still readable by weekly report |

---

## External integrations

| Service | Status |
|---|---|
| **Supabase** | Database, auth, storage, edge functions |
| **OpenAI** | Copilot chat + embeddings |
| **Vercel** | Hosting + cron |
| **HubSpot** | *(potential — in progress)* CRM sync from consult triage |

---

## Supabase Edge Functions

| Function | Status |
|---|---|
| `hubspot-lead-sync` | *(potential)* — invoked from `/api/leads/[id]/hubspot-sync` to upsert Company + Contact + Deal in HubSpot CRM |
| `training-digest` | Active — knowledge training rollups |

---

## Storage buckets

| Bucket | Used by |
|---|---|
| `lead-uploads` | Consult form attachments (per-solution images / PDFs) |
| `knowledge` | Copilot doc store; signed via `/api/doc-open` |
| `internal-assets` | Per-product contacts / docs (rep agreements etc.) |
