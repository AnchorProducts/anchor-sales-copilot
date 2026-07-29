/* ============================================================================
 * Branded transactional email renderer — framework-free on purpose.
 *
 * No server-only import, so the Marketing Hub's template editor renders its
 * live preview with the EXACT function that sends the real email. What
 * marketing sees in the preview pane is what lands in the inbox.
 *
 * Built as a table-based layout with inline styles: Outlook and Gmail strip
 * <style> blocks and ignore flex/grid, so this is the portable subset.
 * ==========================================================================*/

export const BRAND = {
  deep: "#11500F",
  green: "#047835",
  mint: "#9CE2BB",
  gray: "#76777B",
  ink: "#1a1a1a",
  page: "#f4f6f4",
  border: "#e3e6e3",
} as const;

/** Escape text destined for an HTML context. */
export function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Substitute {{variable}} placeholders. Unknown names are left as-is so a
 *  typo in a template is visible rather than silently blanking the copy. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return String(template ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] ?? "" : match
  );
}

export type EmailContent = {
  subject: string;
  /** Big line at the top of the card. */
  heading: string;
  /** Body copy. Blank lines separate paragraphs; a line starting with "> "
   *  becomes a highlighted callout (used for timelines, reasons, questions). */
  body: string;
  buttonLabel: string;
  /** Destination for the button. Not marketing-editable — the app supplies it. */
  buttonUrl: string;
};

type Block = { kind: "p" | "callout"; text: string };

/** Split body copy into paragraphs and callouts. */
function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of String(body ?? "").split(/\n\s*\n/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(">")) {
      blocks.push({ kind: "callout", text: trimmed.replace(/^>\s?/gm, "").trim() });
    } else {
      blocks.push({ kind: "p", text: trimmed });
    }
  }
  return blocks;
}

/** The full HTML email. */
export function renderEmailHtml(content: EmailContent): string {
  const blocks = parseBlocks(content.body)
    .map((b) => {
      const safe = escapeHtml(b.text).replace(/\n/g, "<br />");
      if (b.kind === "callout") {
        return `<tr><td style="padding:0 0 16px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background-color:#f0f8f3;border-left:4px solid ${BRAND.green};border-radius:6px;padding:14px 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:${BRAND.deep};">${safe}</td></tr>
  </table>
</td></tr>`;
      }
      return `<tr><td style="padding:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">${safe}</td></tr>`;
    })
    .join("\n");

  const button =
    content.buttonLabel && content.buttonUrl
      ? `<tr><td style="padding:8px 0 0 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background-color:${BRAND.green};border-radius:8px;">
      <a href="${escapeHtml(content.buttonUrl)}" style="display:inline-block;padding:12px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(content.buttonLabel)}</a>
    </td></tr>
  </table>
</td></tr>`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.page};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
      <tr><td style="height:5px;background-color:${BRAND.green};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:26px 30px 6px 30px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:.09em;text-transform:uppercase;color:${BRAND.gray};">Anchor Products</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:bold;line-height:1.3;color:${BRAND.deep};padding-top:6px;">${escapeHtml(content.heading)}</div>
      </td></tr>
      <tr><td style="padding:18px 30px 26px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${blocks}
${button}
        </table>
      </td></tr>
      <tr><td style="border-top:1px solid ${BRAND.border};padding:16px 30px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.gray};">
        Sent by the Anchor internal app. You&#39;re getting this because it involves a marketing pitch you submitted or review.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative, for clients that refuse HTML. */
export function renderEmailText(content: EmailContent): string {
  const lines: string[] = [content.heading, ""];
  for (const b of parseBlocks(content.body)) {
    lines.push(b.kind === "callout" ? b.text.replace(/^/gm, "  ") : b.text);
    lines.push("");
  }
  if (content.buttonUrl) lines.push(`${content.buttonLabel || "Open"}: ${content.buttonUrl}`);
  return lines.join("\n").trim();
}
