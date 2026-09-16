import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Outgoing email via SMTP (Gmail with an app password is the assumed setup).
 * Env:
 *   SMTP_HOST        e.g. smtp.gmail.com
 *   SMTP_PORT        e.g. 587
 *   SMTP_USER        e.g. shiftly-briefings@gmail.com
 *   SMTP_PASS        Gmail app password (NOT the account password)
 *   SMTP_FROM        optional, defaults to the user
 * When unconfigured every send is a no-op log line — the app still runs.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string
): Promise<{ delivered: boolean }> {
  const t = getTransporter();
  if (!t) {
    console.warn(`[email] SMTP not configured — would send to ${to}: ${subject}`);
    return { delivered: false };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, html });
  return { delivered: true };
}
