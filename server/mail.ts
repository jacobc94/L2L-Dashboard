import { Env, HttpError } from './types';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export const mailConfigured = (env: Env) => !!(env.RESEND_API_KEY && env.MAIL_FROM);

/** Sends one plain-text email through Resend. Throws HttpError(502) with a short reason on failure. */
export async function sendMail(env: Env, m: MailInput, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!mailConfigured(env)) throw new HttpError(503, 'Email sending is not configured (RESEND_API_KEY / MAIL_FROM).');
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { message?: string }).message ?? ''; } catch { /* ignore */ }
    throw new HttpError(502, `Email provider rejected the message (${res.status})${detail ? ': ' + detail.slice(0, 160) : ''}`);
  }
}
