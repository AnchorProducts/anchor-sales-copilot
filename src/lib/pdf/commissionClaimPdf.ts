// Server-side PDF generator for commission claim emails. jsPDF works in
// Node — we output an ArrayBuffer and wrap it in a Buffer so Resend can
// attach it as a binary file.
import jsPDF from "jspdf";

export type CommissionClaimPdfData = {
  claimId: string;
  submittedAt: Date;
  repName: string | null;
  repCompany: string | null;
  repPhone: string | null;
  repEmail: string | null;
  certified: boolean;
  unawareOtherSalesperson: string | null;
  additionalSalespeople: string | null;
  estimatedOrderDate: string | null;
  jobName: string | null;
  companyPlacingOrder: string;
  orderCity: string | null;
  orderState: string | null;
  uAnchorsOrdered: string | null;
  qty: string | null;
  roofType: string | null;
  roofBrand: string | null;
  otherItems: string | null;
  shipToAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
  projectDescription: string | null;
};

function fmtDate(value: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtDateTime(value: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "claim";
}

export function generateCommissionClaimPdf(c: CommissionClaimPdfData): {
  buffer: Buffer;
  filename: string;
} {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 48;
  let y = MARGIN;

  function ensureSpace(rowHeight: number) {
    if (y + rowHeight > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function heading(text: string, size = 16, color: [number, number, number] = [17, 80, 15]) {
    ensureSpace(size + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(text, MARGIN, y);
    y += size + 6;
  }

  function body(text: string, opts: { color?: [number, number, number]; size?: number } = {}) {
    const size = opts.size ?? 10;
    ensureSpace(size + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const c2 = opts.color ?? [40, 40, 40];
    doc.setTextColor(c2[0], c2[1], c2[2]);
    const lines = doc.splitTextToSize(text, PAGE_W - MARGIN * 2);
    for (const line of lines) {
      ensureSpace(size + 2);
      doc.text(line, MARGIN, y);
      y += size + 2;
    }
  }

  function row(label: string, value: string | null | undefined) {
    ensureSpace(14);
    const v = value && value.trim() ? value : "—";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    // Right-align value at the right margin, but wrap if it's too long.
    const valueMaxWidth = PAGE_W - MARGIN * 2 - 160;
    const lines = doc.splitTextToSize(v, valueMaxWidth);
    let lineY = y;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const width = doc.getTextWidth(line);
      doc.text(line, PAGE_W - MARGIN - width, lineY);
      lineY += 12;
    }
    y = Math.max(y + 14, lineY + 2);
  }

  function divider() {
    ensureSpace(10);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 12;
  }

  function sectionHeading(text: string) {
    ensureSpace(20);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 80, 15);
    doc.text(text, MARGIN, y);
    y += 14;
  }

  // ── Title block ────────────────────────────────────────────────────────
  heading("Commission Claim", 22);
  body(`Claim ID: ${c.claimId}`, { color: [120, 120, 120] });
  body(`Submitted: ${fmtDateTime(c.submittedAt)}`, { color: [120, 120, 120] });
  y += 6;
  divider();

  // ── Rep ────────────────────────────────────────────────────────────────
  sectionHeading("Submitting representative");
  row("Name", c.repName);
  row("Company", c.repCompany);
  row("Phone", c.repPhone);
  row("Email", c.repEmail);
  y += 4;
  divider();

  // ── Certification ──────────────────────────────────────────────────────
  sectionHeading("Certification");
  row("Certified as independent salesperson", c.certified ? "Yes" : "No");
  row(
    "Sole salesperson",
    c.unawareOtherSalesperson === "yes"
      ? "Yes — sole salesperson on this sale"
      : c.unawareOtherSalesperson === "no"
      ? "No — other salespeople were involved"
      : null
  );
  if (c.additionalSalespeople) {
    row("Additional salespeople", c.additionalSalespeople);
  }
  y += 4;
  divider();

  // ── Order ──────────────────────────────────────────────────────────────
  sectionHeading("Order details");
  row("Job name", c.jobName);
  row("Company placing order", c.companyPlacingOrder);
  row("Estimated order date", c.estimatedOrderDate ? fmtDate(c.estimatedOrderDate) : null);
  row("Order city / state", [c.orderCity, c.orderState].filter(Boolean).join(", ") || null);
  row("U-Anchor(s) ordered", c.uAnchorsOrdered);
  row("Approximate quantity", c.qty);
  row("Roof type", c.roofType);
  row("Roof brand", c.roofBrand);
  row("Other items ordered", c.otherItems);
  y += 4;
  divider();

  // ── Ship to ────────────────────────────────────────────────────────────
  sectionHeading("Ship to");
  row("Address", c.shipToAddress);
  row(
    "City / State / Zip",
    [c.shipCity, c.shipState, c.shipZip].filter(Boolean).join(", ") || null
  );
  y += 4;
  divider();

  // ── Project description ────────────────────────────────────────────────
  if (c.projectDescription && c.projectDescription.trim()) {
    sectionHeading("Project description");
    body(c.projectDescription);
  }

  // ── Footer page numbers ────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Commission Claim · ${c.companyPlacingOrder} · page ${i} of ${pageCount}`,
      PAGE_W / 2,
      PAGE_H - 20,
      { align: "center" }
    );
  }

  const arrayBuffer = doc.output("arraybuffer");
  const buffer = Buffer.from(arrayBuffer);
  const dateStamp = c.submittedAt.toISOString().slice(0, 10);
  const filename = `commission-claim-${safeFilename(c.companyPlacingOrder)}-${dateStamp}.pdf`;

  return { buffer, filename };
}
