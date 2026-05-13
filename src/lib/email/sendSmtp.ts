// Thin SMTP-send helper used by transactional emails (consult queue,
// commission, notable projects, weekly report). Provider-agnostic — set
// SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE / SMTP_FROM
// in env to point at Microsoft 365, Google Workspace, or any other SMTP
// server. No third-party email service required.

import nodemailer, { type Transporter } from "nodemailer";

type SendArgs = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
};

let cachedTransporter: Transporter | null = null;

function bool(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in env."
    );
  }

  // SMTP_SECURE defaults: true for port 465 (implicit TLS), false otherwise
  // (STARTTLS on 587/25). Override with SMTP_SECURE=true|false if needed.
  const secure = bool(process.env.SMTP_SECURE, port === 465);

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cachedTransporter;
}

export async function sendSmtpEmail(args: SendArgs) {
  const from = args.from || (process.env.SMTP_FROM || "").trim();
  if (!from) {
    throw new Error("SMTP_FROM env is missing (used as the sender address).");
  }

  const to = Array.isArray(args.to) ? args.to.filter(Boolean) : [args.to].filter(Boolean);
  if (to.length === 0) {
    throw new Error("sendSmtpEmail: at least one recipient is required.");
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from,
    to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });

  return { messageId: info.messageId ?? null };
}
