import type { AppState, OutboxEmail } from '../src/types';
import { STATE_VERSION } from '../src/data/seed';
import { nowIso, setBusinessTimezone, getNow } from '../src/utils/dates';
import { deriveReminders, queueDueEmails, queueWeeklyDigests, setPortalBase } from '../src/utils/reminders';
import { appOrigin } from './auth';
import { bucketOf, db, loadFullState } from './db';
import { json } from './http';
import { mailConfigured, sendMail } from './mail';
import { sliceFor } from './scope';
import { Env, HttpError, SessionUser } from './types';
import { timingSafeEqual } from './crypto';

const MAX_PER_RUN = 100;

/** Sends specific queued emails (by id) through Resend. Staff can only send mail they're allowed to see. */
export async function sendQueued(env: Env, request: Request, user: SessionUser, ids: string[]) {
  if (user.role === 'client') throw new HttpError(403, 'Not allowed.');
  if (!mailConfigured(env)) throw new HttpError(503, 'Email sending isn\'t set up on the server yet (RESEND_API_KEY and MAIL_FROM).');
  const b = bucketOf(env);
  const full = await loadFullState(b, STATE_VERSION);
  if (!full) throw new HttpError(503, 'Not set up yet.');
  const visible = new Set(sliceFor(full, user).outbox.map((o) => o.id));
  const known = new Set([...full.clients, ...full.staff].map((p) => p.email.toLowerCase()));
  const todo = full.outbox.filter((o) => ids.includes(o.id) && o.status === 'queued' && visible.has(o.id)).slice(0, MAX_PER_RUN);
  return deliver(env, full, todo, known, appOrigin(request, env));
}

async function deliver(env: Env, full: AppState, todo: OutboxEmail[], known: Set<string>, _origin: string) {
  const b = bucketOf(env);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const sent: string[] = [];
  for (const m of todo) {
    if (!known.has(m.toEmail.toLowerCase())) { results.push({ id: m.id, ok: false, error: 'Recipient is not a known client or team member.' }); continue; }
    try {
      await sendMail(env, { to: m.toEmail, subject: m.subject, text: m.body, replyTo: full.settings.supportEmail });
      sent.push(m.id);
      results.push({ id: m.id, ok: true });
    } catch (e) {
      results.push({ id: m.id, ok: false, error: e instanceof HttpError ? e.message : 'Could not send.' });
    }
  }
  if (sent.length) {
    await db.updateOutbox(b, (ob) => {
      for (const m of ob) if (sent.includes(m.id)) { m.status = 'sent'; m.sentAt = nowIso(); }
    });
  }
  return json({ ok: true, results });
}

/**
 * Scheduled run (call POST /api/cron/run with `Authorization: Bearer $CRON_SECRET` once an hour):
 * queues any reminder that has become due, queues the weekly digest on the configured weekday, and — only if the
 * admin turned on "send due reminders automatically" — emails everything the scan generated.
 */
export async function cron(request: Request, env: Env) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!env.CRON_SECRET || !timingSafeEqual(auth, `Bearer ${env.CRON_SECRET}`)) throw new HttpError(401, 'Unauthorized.');
  const b = bucketOf(env);
  const full = await loadFullState(b, STATE_VERSION);
  if (!full) return json({ ok: true, skipped: 'not set up' });
  setBusinessTimezone(full.settings.timezone);
  setPortalBase(appOrigin(request, env));
  const before = new Set(full.outbox.map((o) => o.id));
  queueDueEmails(full, deriveReminders(full));
  if (full.settings.weeklyDigestDay >= 0 && getNow().getDay() === full.settings.weeklyDigestDay) queueWeeklyDigests(full);
  const fresh = full.outbox.filter((o) => !before.has(o.id));
  if (fresh.length) {
    await db.updateOutbox(b, (ob) => {
      const keys = new Set(ob.map((o) => o.dedupeKey).filter(Boolean));
      for (const m of fresh.reverse()) if (!m.dedupeKey || !keys.has(m.dedupeKey)) ob.unshift(m);
    });
  }
  let sent = 0;
  if (full.settings.autoSendReminders && mailConfigured(env)) {
    const known = new Set([...full.clients, ...full.staff].map((p) => p.email.toLowerCase()));
    // Only machine-generated mail (it has a dedupe key); hand-written emails wait for a person to press Send
    const current = (await db.outbox(b)).data.filter((o) => o.status === 'queued' && o.dedupeKey).slice(0, MAX_PER_RUN);
    const res = await deliver(env, full, current, known, appOrigin(request, env));
    sent = ((await res.json()) as { results: Array<{ ok: boolean }> }).results.filter((r) => r.ok).length;
  }
  return json({ ok: true, queued: fresh.length, sent });
}
