#!/usr/bin/env node
/* ============================================================================
 * build-docs.mjs — renders SOP.md + SITEMAP.md into a single GitHub Pages site.
 *
 *   node scripts/build-docs.mjs
 *   → docs/index.html
 *
 * SOP.md and SITEMAP.md stay the source of truth. Edit those, re-run this.
 *
 * Screenshots are declared in the SHOTS table below and anchored to an exact
 * substring of SOP.md. Each one renders as a slot: if `docs/images/<file>` is
 * present the image shows, otherwise a dashed "screenshot needed" card shows
 * with the filename, the URL to visit, and what to capture. Drop a PNG in and
 * it upgrades itself — no rebuild required.
 *
 * If an anchor stops matching (because SOP.md was edited), the build FAILS and
 * names the anchor rather than silently dropping the slot.
 * ==========================================================================*/

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs");
const IMG_DIR = join(OUT_DIR, "images");

/* ── Screenshot slots ──────────────────────────────────────────────────────
 * after: an exact substring of the SOP.md block the slot should follow.
 * file:  filename to save into docs/images/.
 * where: the URL or UI location to capture it from.
 * what:  what the shot needs to show.
 * ------------------------------------------------------------------------*/
const SHOTS = [
  // Page 1 — orientation
  { after: "Branded \"Anchor App.\"", file: "01-two-builds.png",
    caption: "The two builds, side by side",
    where: "Both login pages", what: "The internal and external sign-in screens next to each other, so the branding difference is obvious." },
  { after: "### It's also a phone app", file: "02-pwa-home-screen.png",
    caption: "Installed on a phone home screen",
    where: "Your phone home screen", what: "The installed app icon alongside your other apps." },

  // Page 2 — setup
  { after: "Go to the login page and sign in with your `@anchorp.com` email.", file: "03-login.png",
    caption: "The sign-in screen",
    where: "/", what: "The sign-in card with the email field and Send code button." },
  { after: "A current admin must open **Admin Console → Users**", file: "04-users-set-role.png",
    caption: "Changing someone's role",
    where: "/admin/users → click a person", what: "The person editor with the Role dropdown open. Use a test account, not a real one." },
  { after: "Open the internal site in Safari (iOS) or Chrome (Android)", file: "05-add-to-home-screen.png",
    caption: "Add to Home Screen",
    where: "Phone browser share sheet", what: "The share sheet with Add to Home Screen highlighted." },
  { after: "In the app: **Settings → Notifications → Enable**", file: "06-enable-push.png",
    caption: "Enabling push on your device",
    where: "/dashboard/settings", what: "The Notifications section with the Enable control and the browser permission prompt." },
  { after: "Go to **Admin Console → Notifications**. Add yourself as a *User*", file: "07-assign-self.png",
    caption: "Assigning yourself to a category",
    where: "/admin/notifications", what: "One category expanded with a person being added to the Users list." },

  // Page 3 — roles and View As
  { after: "floating role pill on **every** page", file: "08-viewas-pill.png",
    caption: "The View As pill",
    where: "Any page, as admin", what: "The floating pill — top-center on mobile, bottom-right on desktop. Crop tight." },
  { after: "the pill reads \"Viewing as …\"", file: "09-viewas-menu.png",
    caption: "The View As menu open",
    where: "Tap the pill", what: "All three options visible: Admin, Internal sales, External user." },

  // Page 4 — rhythm
  { after: "## Page 4 — Your operating rhythm", file: "10-admin-console.png",
    caption: "The Admin Console",
    where: "/admin", what: "The full tile grid. This is the launchpad for everything in Pages 5–10." },

  // Page 5 — notifications
  { after: "For each category you assign two kinds of recipients", file: "11-notifications-page.png",
    caption: "The Notifications page",
    where: "/admin/notifications", what: "The full list of event categories, collapsed." },
  { after: "**1. Nothing is pre-assigned.**", file: "12-notifications-empty.png",
    caption: "An empty category — the silent failure",
    where: "/admin/notifications", what: "A category with no recipients assigned, so Riley knows what the failure state looks like." },
  { after: "That roster lives on the **Sales Reps** tile", file: "13-sales-reps.png",
    caption: "Territory routing",
    where: "/admin/sales-reps", what: "The rep table showing states and ZIP prefixes. Blur email addresses." },
  { after: "Each region has its own auto-created category named", file: "14-region-category.png",
    caption: "A per-region marketing category",
    where: "/admin/notifications", what: "One of the marketing_order_region entries with its assigned manager." },

  // Page 6 — consults
  { after: "### Two states, and only two", file: "15-consults-queue.png",
    caption: "The Active Consults queue",
    where: "/dashboard/opportunities", what: "The queue with the status filter open, showing just New and Assigned. Blur customer names." },
  { after: "### Working one", file: "16-consult-detail.png",
    caption: "A consult detail view",
    where: "/dashboard/opportunities/[id]", what: "The detail page — customer, address, roof type, requested solutions. Blur identifying data." },
  { after: "choose the owner from the dropdown and press", file: "17-consult-assign.png",
    caption: "Assigning a rep",
    where: "Consult detail", what: "The Assignment panel with the Assigned to dropdown open, listing internal people." },
  { after: "### Deleting a submission", file: "18a-delete-danger-zone.png",
    caption: "The admin-only Danger zone",
    where: "Consult detail → Assignment panel", what: "The Danger zone with its confirm step showing. Admins only \u2014 internal reps don't see it." },
  { after: "### NetSuite sync — not live yet", file: "18-consult-netsuite.png",
    caption: "The NetSuite panel, greyed out until it's connected",
    where: "Consult detail", what: "The greyed NetSuite card with its \"Coming soon\" badge — so Riley recognises it as expected, not broken." },

  // Page 7 — marketing
  { after: "### Orders", file: "19-marketing-orders.png",
    caption: "The Orders tab",
    where: "/admin/marketing?tab=orders", what: "The order list with the Active/Archived tabs visible." },
  { after: "**Every status change emails and pushes the rep automatically.**", file: "20-order-status.png",
    caption: "Changing an order status",
    where: "Marketing Admin Center → an order", what: "The status selector open, showing all six statuses." },
  { after: "Each order has a **two-way message thread**", file: "21-order-thread.png",
    caption: "The order message thread",
    where: "An order detail", what: "A thread with messages from both sides and the unread badge." },
  { after: "### Inventory", file: "22-inventory.png",
    caption: "The Inventory tab",
    where: "/admin/marketing?tab=inventory", what: "The item list with quantities and any low-stock indicator." },
  { after: "**Tradeshow checkouts** log items loaned out", file: "23-checkouts.png",
    caption: "Tradeshow checkouts",
    where: "Inventory tab", what: "The checkout log — event name, quantity, due-back date." },
  { after: "### The QR pickup flow", file: "24-grab-qr.png",
    caption: "The public QR pickup page",
    where: "/grab/<token>", what: "The scan-to-pick-up page as someone at the shelf sees it, plus the printed QR if you have one." },

  { after: "### Submissions", file: "24a-marketing-submissions-tab.png",
    caption: "The Submissions tab in the Marketing Admin Center",
    where: "/admin/marketing?tab=submissions", what: "The three tabs with Submissions selected, showing the pitch queue and its Awaiting decision / All pitches filters." },

  // Page 8 — the other queues
  { after: "### Commission Claims — `/admin/commission-claims`", file: "25-commission-claims.png",
    caption: "Commission Claims",
    where: "/admin/commission-claims", what: "The claim list. Blur rep names and order details." },
  { after: "### Notable Projects — `/admin/notable-projects`", file: "26-notable-projects.png",
    caption: "Notable Projects",
    where: "/admin/notable-projects", what: "The submission list with photo thumbnails." },
  { after: "### Project Intake / FM — `/admin/fm-intake`", file: "27-fm-intake.png",
    caption: "Project Intake",
    where: "/admin/fm-intake", what: "The intake list and the status control. Blur company names." },
  { after: "### Support Queue — `/admin/support`", file: "28-support-queue.png",
    caption: "The Support Queue",
    where: "/admin/support", what: "The thread list plus one thread open with the reply box." },
  { after: "### Asset Reviews — `/admin/asset-reviews`", file: "29-asset-reviews.png",
    caption: "Asset Reviews",
    where: "/admin/asset-reviews", what: "The pending filter with Approve and Reject buttons visible." },

  // Page 9 — content
  { after: "### Knowledge / the Copilot — `/admin/knowledge`", file: "30-knowledge.png",
    caption: "The Knowledge admin",
    where: "/admin/knowledge", what: "The document list showing indexed and allow-listed state." },
  { after: "When someone corrects a Copilot answer", file: "31-corrections.png",
    caption: "Copilot corrections",
    where: "/admin/knowledge → corrections", what: "The correction console with an active correction." },
  { after: "### Resource Library", file: "32-resource-library.png",
    caption: "The Resource Library",
    where: "/assets", what: "The product tackle-box browser." },
  { after: "### Users — `/admin/users`", file: "34-users-page.png",
    caption: "The Users page",
    where: "/admin/users", what: "The people list. Blur emails and phone numbers." },
  { after: "### Portal Access — `/admin/portal-access`", file: "35-portal-access.png",
    caption: "Portal Access",
    where: "/admin/portal-access", what: "The shared authorized-email list with level and team badges. Blur addresses." },

  // Page 10 — flags
  { after: "**1. Admin Console tools.**", file: "36-manage-tools.png",
    caption: "Manage Tools",
    where: "/admin/tools", what: "The Admin Console tools section with one tool toggled off and marked Inactive." },
  { after: "**2. Sales rep tools.**", file: "37-rep-tools.png",
    caption: "Sales rep tool toggles",
    where: "/admin/tools", what: "The rep tools section showing the separate internal and external toggles." },
  { after: "### \"Site live\" — the master switch", file: "38-site-live.png",
    caption: "The Site live switch",
    where: "/admin/tools (top card)", what: "The Site live card with its five listed surfaces and the Go live button." },
  { after: "### The pitch workflow (once Site live is on)", file: "39-pitch-submissions.png",
    caption: "The pitch Submissions inbox",
    where: "/marketing/submissions", what: "The review queue with the four review statuses." },

  // Page 12 — troubleshooting
  { after: "Work down this list before escalating.", file: "40-wrong-build.png",
    caption: "The wrong-build redirect",
    where: "Wrong build for your role", what: "The bounce back to the login screen — the single most-reported 'bug'." },
];

/* ── Tiny markdown renderer ────────────────────────────────────────────────
 * Deliberately supports only what SOP.md and SITEMAP.md actually use.
 * ------------------------------------------------------------------------*/
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(src) {
  const codes = [];
  // Protect code spans first so their contents aren't re-formatted.
  let s = src.replace(/`([^`]+)`/g, (_, c) => `\u0001${codes.push(c) - 1}\u0001`);
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // Underscore italics (SITEMAP.md uses these). The leading-boundary requirement
  // keeps it off snake_case identifiers that appear outside backticks.
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:)])/g, "$1<em>$2</em>");
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

function slug(s) {
  return s.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
}

/** Split markdown into raw blocks (paragraph / table / list / fence / heading). */
function toBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  let buf = [];
  const flush = () => { if (buf.length) { blocks.push(buf.join("\n")); buf = []; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flush();
      const fence = [line];
      while (++i < lines.length) { fence.push(lines[i]); if (lines[i].startsWith("```")) break; }
      blocks.push(fence.join("\n"));
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (/^#{1,6}\s/.test(line)) { flush(); blocks.push(line); continue; }
    if (/^(---|\*\*\*)\s*$/.test(line)) { flush(); blocks.push("---"); continue; }
    if (line.trim() === "\\newpage") { flush(); blocks.push("\\newpage"); continue; }
    buf.push(line);
  }
  flush();
  return blocks;
}

function renderTable(rows) {
  const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  let h = "<div class='table-wrap'><table><thead><tr>";
  h += head.map((c) => `<th>${inline(c)}</th>`).join("");
  h += "</tr></thead><tbody>";
  for (const r of body) {
    h += "<tr>" + head.map((_, i) => `<td>${inline(r[i] ?? "")}</td>`).join("") + "</tr>";
  }
  return h + "</tbody></table></div>";
}

function renderBlock(raw, headings) {
  const lines = raw.split("\n");

  if (raw === "---") return "<hr>";
  if (raw === "\\newpage") return "<div class='pagebreak'></div>";
  // Raw HTML / comment blocks (e.g. the <!--SITEMAP--> splice point) pass through
  // untouched — wrapping them in <p> would nest block elements illegally.
  if (/^<(!--|\/?[a-zA-Z])/.test(raw.trim())) return raw;

  if (raw.startsWith("```")) {
    return `<pre><code>${esc(lines.slice(1, -1).join("\n"))}</code></pre>`;
  }

  const head = raw.match(/^(#{1,6})\s+(.*)$/);
  if (head) {
    const level = head[1].length;
    const text = head[2].trim();
    const id = slug(text);
    if (headings && level <= 3) headings.push({ level, text, id });
    return `<h${level} id="${id}">${inline(text)}</h${level}>`;
  }

  if (lines[0].trim().startsWith("|") && lines[1] && /^\s*\|[\s:|-]+\|\s*$/.test(lines[1])) {
    return renderTable(lines.filter((l) => l.trim().startsWith("|")));
  }

  if (lines.every((l) => /^\s*>/.test(l))) {
    const inner = lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
    return `<blockquote>${renderBlock(inner, null)}</blockquote>`;
  }

  // Checklists render as real disabled checkboxes so they read as a checklist.
  if (lines.every((l) => /^\s*-\s\[[ xX]\]\s/.test(l))) {
    const items = lines.map((l) => {
      const m = l.match(/^\s*-\s\[([ xX])\]\s(.*)$/);
      const on = m[1].toLowerCase() === "x" ? " checked" : "";
      return `<li><input type="checkbox" disabled${on}> <span>${inline(m[2])}</span></li>`;
    });
    return `<ul class="checklist">${items.join("")}</ul>`;
  }

  if (/^\s*[-*]\s/.test(lines[0])) {
    const items = [];
    for (const l of lines) {
      if (/^\s*[-*]\s/.test(l)) items.push(l.replace(/^\s*[-*]\s/, ""));
      else if (items.length) items[items.length - 1] += " " + l.trim();
    }
    return `<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`;
  }

  if (/^\s*\d+\.\s/.test(lines[0])) {
    const items = [];
    for (const l of lines) {
      if (/^\s*\d+\.\s/.test(l)) items.push(l.replace(/^\s*\d+\.\s/, ""));
      else if (items.length) items[items.length - 1] += " " + l.trim();
    }
    return `<ol>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`;
  }

  return `<p>${inline(lines.join(" ").trim())}</p>`;
}

function shotHtml(shot, n) {
  const have = existsSync(join(IMG_DIR, shot.file));
  return `
<figure class="shot${have ? "" : " is-missing"}" id="shot-${slug(shot.file)}">
  <img src="images/${shot.file}" alt="${esc(shot.caption)}" loading="lazy"
       onerror="this.closest('.shot').classList.add('is-missing')"
       onload="this.closest('.shot').classList.remove('is-missing')">
  <figcaption><span class="shot-n">Fig. ${n}</span> ${inline(shot.caption)}</figcaption>
  <div class="shot-todo">
    <div class="shot-todo-h"><span class="shot-n">Fig. ${n}</span> Screenshot needed</div>
    <dl>
      <dt>Save as</dt><dd><code>docs/images/${shot.file}</code></dd>
      <dt>Where</dt><dd><code>${esc(shot.where)}</code></dd>
      <dt>Capture</dt><dd>${inline(shot.what)}</dd>
    </dl>
  </div>
</figure>`;
}

/* ── Render the SOP, injecting shots ──────────────────────────────────────*/
function renderSop(md) {
  const blocks = toBlocks(md);
  const headings = [];
  const used = new Set();
  let n = 0;
  let html = "";

  for (const raw of blocks) {
    html += renderBlock(raw, headings) + "\n";
    for (const shot of SHOTS) {
      if (used.has(shot.file)) continue;
      if (raw.includes(shot.after)) {
        used.add(shot.file);
        html += shotHtml(shot, ++n) + "\n";
      }
    }
  }

  const missed = SHOTS.filter((s) => !used.has(s.file));
  if (missed.length) {
    console.error("\n✗ These screenshot anchors no longer match anything in SOP.md:\n");
    for (const m of missed) console.error(`   ${m.file}\n     after: ${JSON.stringify(m.after)}`);
    console.error("\nFix the `after:` strings in scripts/build-docs.mjs, then rebuild.\n");
    process.exit(1);
  }
  return { html, headings };
}

/* ── Render the sitemap as collapsible sections ───────────────────────────*/
function renderSitemap(md) {
  const body = md.replace(/^#\s+.*$/m, "");
  const parts = body.split(/\n(?=##\s)/);
  let html = "";

  const intro = parts[0].split("\n").filter((l) => l.trim() && l.trim() !== "---").join("\n");
  if (intro.trim()) {
    html += `<div class="sitemap-intro">${toBlocks(intro).map((b) => renderBlock(b, null)).join("")}</div>`;
  }

  for (const part of parts.slice(1)) {
    const lines = part.split("\n");
    const title = lines[0].replace(/^##\s+/, "").trim();
    const rest = lines.slice(1).join("\n").replace(/\n---\s*$/, "");
    const inner = toBlocks(rest).map((b) => renderBlock(b, null)).join("\n");
    html += `<details class="sm"><summary>${inline(title)}</summary><div class="sm-body">${inner}</div></details>\n`;
  }
  return html;
}

/* ── Build ────────────────────────────────────────────────────────────────*/
const sopMd = readFileSync(join(ROOT, "SOP.md"), "utf8");
const siteMd = readFileSync(join(ROOT, "SITEMAP.md"), "utf8");

const { html: sopHtml, headings } = renderSop(sopMd);
const sitemapHtml = renderSitemap(siteMd);

// The developer section is the last top-level heading; splice the sitemap in.
const DEV_MARKER = "<!--SITEMAP-->";
const sopWithSitemap = sopHtml.includes(DEV_MARKER)
  ? sopHtml.replace(DEV_MARKER, `<div class="sitemap">${sitemapHtml}</div>`)
  : sopHtml +
    `\n<h2 id="the-complete-site-map">The complete site map</h2>
     <p>The full technical inventory, generated from <code>SITEMAP.md</code>. Expand any section.</p>
     <div class="sitemap">${sitemapHtml}</div>\n`;

const nav = headings
  .filter((h) => h.level <= 2)
  .map((h) => `<a href="#${h.id}" class="nav-l${h.level}">${esc(h.text)}</a>`)
  .join("\n      ");

const checklist = SHOTS.map((s, i) => `
  <tr>
    <td>${i + 1}</td>
    <td><code>${s.file}</code></td>
    <td><code>${esc(s.where)}</code></td>
    <td>${inline(s.what)}</td>
  </tr>`).join("");

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anchor Sales Co-Pilot — Admin SOP</title>
<meta name="description" content="Standard operating procedure for administering the Anchor Sales Co-Pilot, plus a developer handoff and the complete site map.">
<style>
:root{
  --bg:#ffffff; --fg:#16211c; --muted:#5d6b64; --line:#e2e8e4;
  --soft:#f5f8f6; --accent:#0b5d2e; --accent-soft:#e7f2ea;
  --warn:#8a6d3b; --warn-soft:#fdf3e2; --code:#f0f3f1;
  --max:56rem;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0f1512; --fg:#e6ece8; --muted:#9aa8a1; --line:#26302b;
    --soft:#161d19; --accent:#4ba86f; --accent-soft:#16261c;
    --warn:#d7b06a; --warn-soft:#241d10; --code:#1a221d;
  }
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:1.5rem}
body{
  margin:0;background:var(--bg);color:var(--fg);
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
  -webkit-text-size-adjust:100%;
}
.layout{display:grid;grid-template-columns:17rem minmax(0,1fr);gap:0;max-width:82rem;margin:0 auto}
@media (max-width:900px){.layout{grid-template-columns:1fr}}

/* Sidebar */
.side{
  position:sticky;top:0;align-self:start;height:100vh;overflow-y:auto;
  border-right:1px solid var(--line);padding:1.75rem 1.25rem 3rem;background:var(--soft);
}
@media (max-width:900px){
  .side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
}
.brand{font-weight:800;letter-spacing:-.02em;font-size:1.05rem;line-height:1.3}
.brand span{display:block;font-weight:500;font-size:.8rem;color:var(--muted);margin-top:.2rem}
.side nav{display:flex;flex-direction:column;margin-top:1.5rem;gap:1px}
.side nav a{
  color:var(--muted);text-decoration:none;font-size:.855rem;padding:.4rem .55rem;
  border-radius:.4rem;border-left:2px solid transparent;
}
.side nav a:hover{color:var(--fg);background:var(--bg)}
.side nav a.nav-l1{font-weight:700;color:var(--fg);margin-top:.6rem}
.side-note{
  margin-top:1.75rem;padding:.7rem .8rem;border-radius:.5rem;font-size:.78rem;
  background:var(--warn-soft);color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 25%,transparent);
}

/* Content */
main{padding:2.5rem 2.25rem 6rem;max-width:var(--max);min-width:0}
@media (max-width:900px){main{padding:1.75rem 1.15rem 4rem}}
h1{font-size:2rem;letter-spacing:-.025em;line-height:1.2;margin:0 0 .4rem}
h2{
  font-size:1.45rem;letter-spacing:-.02em;line-height:1.25;
  margin:3.25rem 0 .9rem;padding-top:1.5rem;border-top:1px solid var(--line);
}
h1+h2,h2:first-of-type{border-top:0;padding-top:0;margin-top:2rem}
h3{font-size:1.08rem;margin:2rem 0 .6rem;letter-spacing:-.01em}
p,ul,ol{margin:0 0 1rem}
li{margin:.3rem 0}
a{color:var(--accent)}
code{
  font:.87em/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  background:var(--code);padding:.12em .38em;border-radius:.3em;
}
pre{background:var(--code);padding:1rem;border-radius:.6rem;overflow-x:auto}
pre code{background:none;padding:0}
hr{border:0;border-top:1px solid var(--line);margin:2.25rem 0}
blockquote{
  margin:1.25rem 0;padding:.85rem 1.1rem;border-left:3px solid var(--accent);
  background:var(--accent-soft);border-radius:0 .5rem .5rem 0;
}
blockquote p{margin:0}
strong{font-weight:680}

/* Tables scroll inside their own box so the page never scrolls sideways. */
.table-wrap{overflow-x:auto;margin:0 0 1.4rem;border:1px solid var(--line);border-radius:.6rem}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:.6rem .8rem;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--soft);font-weight:680;white-space:nowrap}
tr:last-child td{border-bottom:0}

ul.checklist{list-style:none;padding-left:0}
ul.checklist li{display:flex;gap:.55rem;align-items:flex-start}
ul.checklist input{margin-top:.42rem;flex:none}

/* Screenshot slots */
.shot{margin:1.5rem 0 2rem;padding:0}
.shot img{
  display:block;width:100%;height:auto;border:1px solid var(--line);
  border-radius:.6rem;background:var(--soft);
}
.shot figcaption{font-size:.83rem;color:var(--muted);margin-top:.5rem}
.shot-n{
  display:inline-block;font-weight:700;color:var(--accent);
  font-size:.76rem;letter-spacing:.04em;text-transform:uppercase;margin-right:.4rem;
}
.shot-todo{display:none}
.shot.is-missing img,.shot.is-missing figcaption{display:none}
.shot.is-missing .shot-todo{
  display:block;border:1.5px dashed color-mix(in srgb,var(--accent) 45%,var(--line));
  border-radius:.6rem;padding:1rem 1.15rem;background:var(--soft);
}
.shot-todo-h{font-size:.83rem;font-weight:700;color:var(--muted);margin-bottom:.6rem}
.shot-todo dl{display:grid;grid-template-columns:5.5rem 1fr;gap:.3rem .8rem;margin:0;font-size:.85rem}
.shot-todo dt{color:var(--muted);font-weight:600}
.shot-todo dd{margin:0}

/* Sitemap accordions */
.sitemap{margin:1.25rem 0 2rem}
details.sm{border:1px solid var(--line);border-radius:.6rem;margin-bottom:.55rem;background:var(--soft)}
details.sm summary{
  cursor:pointer;padding:.7rem 1rem;font-weight:650;font-size:.94rem;
  list-style:none;display:flex;align-items:center;gap:.55rem;
}
details.sm summary::-webkit-details-marker{display:none}
details.sm summary::before{content:"▸";color:var(--accent);font-size:.85rem;transition:transform .12s}
details.sm[open] summary::before{transform:rotate(90deg)}
details.sm summary:hover{color:var(--accent)}
.sm-body{padding:.25rem 1rem 1rem;border-top:1px solid var(--line);background:var(--bg);
  border-radius:0 0 .55rem .55rem;font-size:.92rem}
.sm-body h3{font-size:1rem;margin:1.35rem 0 .5rem}
.sitemap-intro{font-size:.9rem;color:var(--muted);margin-bottom:1rem}
.sm-tools{display:flex;gap:.5rem;margin:0 0 .9rem}
.sm-tools button{
  font:inherit;font-size:.82rem;padding:.35rem .75rem;border-radius:.4rem;cursor:pointer;
  border:1px solid var(--line);background:var(--bg);color:var(--fg);
}
.sm-tools button:hover{border-color:var(--accent);color:var(--accent)}

.pagebreak{break-before:page;height:0}
.dev-banner{
  margin:1.25rem 0 2rem;padding:.9rem 1.1rem;border-radius:.6rem;
  background:var(--warn-soft);color:var(--warn);font-size:.9rem;
  border:1px solid color-mix(in srgb,var(--warn) 25%,transparent);
}

/* Print */
@media print{
  .side,.sm-tools{display:none}
  .layout{display:block;max-width:none}
  main{padding:0;max-width:none}
  h2{break-before:page;border-top:0;padding-top:0}
  h1+h2,h2:first-of-type{break-before:auto}
  h2,h3{break-after:avoid}
  .shot,.table-wrap,blockquote{break-inside:avoid}
  details.sm{break-inside:avoid}
  details.sm summary{list-style:none}
  details.sm:not([open]) .sm-body{display:block}
  a{color:inherit;text-decoration:none}
  body{font-size:11pt}
}
</style>
</head>
<body>
<div class="layout">
  <aside class="side">
    <div class="brand">Anchor Sales Co-Pilot<span>Admin SOP &amp; developer handoff</span></div>
    <nav>
      ${nav}
      <a href="#screenshot-checklist" class="nav-l1">Appendix — Screenshot checklist</a>
    </nav>
    <div class="side-note">Screenshot slots marked <strong>“Screenshot needed”</strong> are placeholders. Drop a PNG into <code>docs/images/</code> with the listed filename and it replaces the slot automatically.</div>
  </aside>

  <main>
${sopWithSitemap}

<h2 id="screenshot-checklist">Appendix — Screenshot checklist</h2>
<p>Every image slot in this document, in order. Save each as a PNG into <code>docs/images/</code> using the exact filename. No rebuild is needed — the page picks them up on next load.</p>
<blockquote><p><strong>Before you shoot:</strong> the queue pages show live customer names, rep emails, and claim details. If this site is published to a public GitHub Pages URL, blur or crop that data, or capture with a test account.</p></blockquote>
<div class="table-wrap"><table>
<thead><tr><th>#</th><th>Filename</th><th>Where</th><th>What to capture</th></tr></thead>
<tbody>${checklist}</tbody>
</table></div>

<hr>
<p style="font-size:.83rem;color:var(--muted)">
Generated from <code>SOP.md</code> and <code>SITEMAP.md</code> by <code>scripts/build-docs.mjs</code>.
Edit the markdown and re-run <code>node scripts/build-docs.mjs</code> — do not hand-edit this file.
</p>
  </main>
</div>
<script>
// Expand/collapse helpers for the site map, injected next to the first accordion.
(function () {
  var first = document.querySelector('details.sm');
  if (!first) return;
  var bar = document.createElement('div');
  bar.className = 'sm-tools';
  bar.innerHTML = '<button type="button" data-all="1">Expand all</button>' +
                  '<button type="button" data-all="0">Collapse all</button>';
  first.parentNode.insertBefore(bar, first);
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var open = b.dataset.all === '1';
    document.querySelectorAll('details.sm').forEach(function (d) { d.open = open; });
  });
  // Deep links into a collapsed section should open it.
  function openTarget() {
    if (!location.hash) return;
    var el = document.querySelector(location.hash);
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
  }
  window.addEventListener('hashchange', openTarget);
  openTarget();
})();
</script>
</body>
</html>
`;

mkdirSync(IMG_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "index.html"), doc);
writeFileSync(join(OUT_DIR, ".nojekyll"), "");
// Manifest for the .docx builder (scripts/build_docx.py), so the figure list
// and their anchors stay defined in exactly one place.
writeFileSync(join(OUT_DIR, "shots.json"), JSON.stringify(SHOTS, null, 2));

const have = SHOTS.filter((s) => existsSync(join(IMG_DIR, s.file))).length;
console.log(`✓ docs/index.html`);
console.log(`  ${headings.filter((h) => h.level <= 2).length} sections · ${SHOTS.length} screenshot slots (${have} filled, ${SHOTS.length - have} pending)`);
