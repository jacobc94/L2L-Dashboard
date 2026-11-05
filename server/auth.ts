import type { Role } from '../src/types';
import { DEFAULT_RESOURCES, DEFAULT_SETTINGS } from '../src/data/defaults';
import { db, bucketOf } from './db';
import { hashSecret, inviteCode, normalizeCode, sha256, signToken, timingSafeEqual, verifySecret, verifyToken } from './crypto';
import { assertSameOriginWrite, clientIp, json, readBody } from './http';
import { mailConfigured, sendMail } from './mail';
import { Env, HttpError, R2Bucket, SessionUser, UserCred } from './types';

export const COOKIE = 'l2l_session';
const SESSION_DAYS = 7;
const INVITE_DAYS = 7;
const WINDOW_MS = 15 * 60_000;
const LIMITS = { u: 5, ip: 30 };

const GENERIC_LOGIN_ERROR = "That email and passcode don't match.";
// Real PBKDF2 hash of a throwaway value, verified when the email is unknown so response time doesn't reveal which emails exist
const DUMMY = { hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', salt: 'AAAAAAAAAAAAAAAAAAAAAA', iters: 100_000 };

const secretOf = (env: Env) => {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 24) throw new HttpError(503, 'Server is not configured: SESSION_SECRET is missing or too short.');
  return env.SESSION_SECRET;
};

export const appOrigin = (request: Request, env: Env) => (env.APP_URL || new URL(request.url).origin).replace(/\/+$/, '');

// ── Rate limiting (stored in R2; best-effort, pair with a Cloudflare WAF rate-limit rule) ──
interface Attempts { count: number; windowStart: number }
async function attemptsKey(kind: 'u' | 'ip', id: string) {
  return `attempts/${kind}-${(await sha256(id.toLowerCase())).slice(0, 32)}.json`;
}
async function lockedFor(b: R2Bucket, kind: 'u' | 'ip', id: string): Promise<number> {
  const obj = await b.get(await attemptsKey(kind, id));
  if (!obj) return 0;
  const a = JSON.parse(await obj.text()) as Attempts;
  if (Date.now() - a.windowStart > WINDOW_MS) return 0;
  return a.count >= LIMITS[kind] ? Math.ceil((a.windowStart + WINDOW_MS - Date.now()) / 60_000) : 0;
}
async function recordFailure(b: R2Bucket, kind: 'u' | 'ip', id: string) {
  const key = await attemptsKey(kind, id);
  const obj = await b.get(key);
  let a: Attempts = obj ? (JSON.parse(await obj.text()) as Attempts) : { count: 0, windowStart: Date.now() };
  if (Date.now() - a.windowStart > WINDOW_MS) a = { count: 0, windowStart: Date.now() };
  a.count++;
  await b.put(key, JSON.stringify(a));
}
async function clearFailures(b: R2Bucket, kind: 'u' | 'ip', id: string) {
  await b.delete(await attemptsKey(kind, id));
}
async function assertNotLocked(b: R2Bucket, request: Request, email: string) {
  const mins = Math.max(await lockedFor(b, 'u', email), await lockedFor(b, 'ip', clientIp(request)));
  if (mins > 0) throw new HttpError(429, `Too many attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`);
}

// ── Sessions ──
async function setSessionCookie(request: Request, env: Env, user: UserCred): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const token = await signToken({ u: user.id, sv: user.sv, exp }, secretOf(env));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
const clearCookie = (request: Request) =>
  `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;

const readCookie = (request: Request, name: string) =>
  (request.headers.get('Cookie') ?? '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.slice(1).join('=');

/** The signed-in user, or null. Role always comes from the server's user file, never from the cookie. */
export async function getSession(request: Request, env: Env): Promise<SessionUser | null> {
  const token = readCookie(request, COOKIE);
  if (!token || !env.SESSION_SECRET || !env.L2L_BUCKET) return null;
  const p = await verifyToken<{ u: string; sv: number; exp: number }>(token, env.SESSION_SECRET);
  if (!p || p.exp < Date.now() / 1000) return null;
  const user = (await db.users(env.L2L_BUCKET)).data[p.u];
  if (!user || user.sv !== p.sv || !user.hash) return null;
  return { id: user.id, role: user.role };
}

export async function requireUser(request: Request, env: Env): Promise<SessionUser> {
  const u = await getSession(request, env);
  if (!u) throw new HttpError(401, 'Please sign in.');
  return u;
}

// ── Passcode policy ──
export function checkPasscode(passcode: unknown, email: string): string {
  if (typeof passcode !== 'string') throw new HttpError(400, 'Choose a passcode.');
  if (passcode.length < 10) throw new HttpError(400, 'Use at least 10 characters for your passcode.');
  if (passcode.length > 200) throw new HttpError(400, 'That passcode is too long.');
  if (/^(.)\1+$/.test(passcode) || passcode.toLowerCase() === email.toLowerCase()) throw new HttpError(400, 'Choose a less guessable passcode.');
  return passcode;
}

// ── Handlers ──
export async function status(request: Request, env: Env) {
  const problems: string[] = [];
  if (!env.L2L_BUCKET) problems.push('R2 binding L2L_BUCKET is missing');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 24) problems.push('SESSION_SECRET is missing or too short');
  if (problems.length) return json({ mode: 'cloud', configured: false, problems, needsBootstrap: false });
  const users = (await db.users(env.L2L_BUCKET!)).data;
  const needsBootstrap = !Object.values(users).some((u) => u.role === 'admin');
  const user = await getSession(request, env);
  return json({ mode: 'cloud', configured: true, needsBootstrap, user, canEmail: mailConfigured(env) });
}

/** Creates the very first admin. Only works while no admin exists, and only with the BOOTSTRAP_KEY secret. */
export async function bootstrap(request: Request, env: Env) {
  assertSameOriginWrite(request);
  const b = bucketOf(env);
  secretOf(env);
  const body = await readBody<{ key?: string; name?: string; email?: string; passcode?: string }>(request);
  if (!env.BOOTSTRAP_KEY) throw new HttpError(503, 'BOOTSTRAP_KEY is not set on the server.');
  await assertNotLocked(b, request, 'bootstrap');
  if (typeof body.key !== 'string' || !timingSafeEqual(body.key, env.BOOTSTRAP_KEY)) {
    await recordFailure(b, 'ip', clientIp(request));
    await recordFailure(b, 'u', 'bootstrap');
    throw new HttpError(403, 'That setup key is not correct.');
  }
  const name = String(body.name ?? '').trim().slice(0, 120);
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter your name and a valid email.');
  const passcode = checkPasscode(body.passcode, email);
  const id = 'st_' + (await sha256(email)).slice(0, 8);
  const pw = await hashSecret(passcode);

  const created = await db.updateUsers(b, (users) => {
    if (Object.values(users).some((u) => u.role === 'admin')) return null;
    users[id] = { id, role: 'admin', email, hash: pw.hash, salt: pw.salt, iters: pw.iters, sv: 1, createdAt: new Date().toISOString() };
    return users[id];
  });
  if (!created) throw new HttpError(409, 'Setup has already been completed.');

  await b.put('directory.json', JSON.stringify({
    settings: DEFAULT_SETTINGS,
    staff: [{ id, name, title: 'Admin', email, role: 'admin', availability: [], timezone: 'Pacific Time' }],
    orgs: [], clients: [], resources: DEFAULT_RESOURCES,
  }), { httpMetadata: { contentType: 'application/json' }, onlyIf: { etagDoesNotMatch: '*' } });
  return json({ ok: true, user: { id, role: 'admin' } }, 200, { 'Set-Cookie': await setSessionCookie(request, env, created) });
}

export async function login(request: Request, env: Env) {
  assertSameOriginWrite(request);
  const b = bucketOf(env);
  secretOf(env);
  const body = await readBody<{ email?: string; passcode?: string }>(request, 10_000);
  const email = String(body.email ?? '').trim().toLowerCase();
  const passcode = String(body.passcode ?? '');
  if (!email || !passcode || passcode.length > 200) throw new HttpError(400, 'Enter your email and passcode.');
  await assertNotLocked(b, request, email);
  const users = (await db.users(b)).data;
  const user = Object.values(users).find((u) => u.email.toLowerCase() === email);
  let ok = false;
  if (user?.hash && user.salt && user.iters) ok = await verifySecret(passcode, { hash: user.hash, salt: user.salt, iters: user.iters });
  else await verifySecret(passcode, DUMMY).catch(() => false);
  if (!ok || !user) {
    await recordFailure(b, 'u', email);
    await recordFailure(b, 'ip', clientIp(request));
    throw new HttpError(401, GENERIC_LOGIN_ERROR);
  }
  await clearFailures(b, 'u', email);
  return json({ ok: true, user: { id: user.id, role: user.role } }, 200, { 'Set-Cookie': await setSessionCookie(request, env, user) });
}

export async function logout(request: Request) {
  assertSameOriginWrite(request);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(request) });
}

/** Admin creates a one-time invite (also used to reset a forgotten passcode). */
export async function invite(request: Request, env: Env, actor: SessionUser) {
  assertSameOriginWrite(request);
  if (actor.role !== 'admin') throw new HttpError(403, 'Only admins can send invites.');
  const b = bucketOf(env);
  const body = await readBody<{ userId?: string; sendEmail?: boolean }>(request, 10_000);
  const code = inviteCode();
  const h = await hashSecret(normalizeCode(code));
  const expires = new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString();
  const target = await db.updateUsers(b, (users) => {
    const u = users[String(body.userId)];
    if (!u) return null;
    u.invite = { hash: h.hash, salt: h.salt, iters: h.iters, expires };
    return { ...u };
  });
  if (!target) throw new HttpError(404, 'That person does not exist.');
  const link = `${appOrigin(request, env)}/#/join?email=${encodeURIComponent(target.email)}&code=${encodeURIComponent(code)}`;
  let emailed = false;
  if (body.sendEmail) {
    const dir = (await db.directory(b)).data;
    await sendMail(env, {
      to: target.email,
      subject: `You're invited to the ${dir?.settings.orgName ?? 'L2L'} coaching portal`,
      text: `Hello,\n\nYou've been invited to the ${dir?.settings.orgName ?? 'L2L Consulting Team'} coaching portal.\n\nSet your passcode here (the link works once and expires in ${INVITE_DAYS} days):\n${link}\n\nOr open ${appOrigin(request, env)} and choose "Join with invite code". Your invite code is: ${code}\n\nIf you weren't expecting this, you can ignore this email.`,
      replyTo: dir?.settings.supportEmail,
    });
    emailed = true;
  }
  return json({ ok: true, code, link, expires, emailed, email: target.email });
}

export async function join(request: Request, env: Env) {
  assertSameOriginWrite(request);
  const b = bucketOf(env);
  secretOf(env);
  const body = await readBody<{ email?: string; code?: string; passcode?: string }>(request, 10_000);
  const email = String(body.email ?? '').trim().toLowerCase();
  const code = normalizeCode(String(body.code ?? ''));
  if (!email || !code) throw new HttpError(400, 'Enter your email and invite code.');
  await assertNotLocked(b, request, email);
  const users = (await db.users(b)).data;
  const user = Object.values(users).find((u) => u.email.toLowerCase() === email);
  const bad = async () => {
    await recordFailure(b, 'u', email);
    await recordFailure(b, 'ip', clientIp(request));
    throw new HttpError(401, 'That invite code is not valid or has expired. Ask your coach for a new one.');
  };
  if (!user?.invite) { await verifySecret(code, DUMMY).catch(() => false); return bad(); }
  const okCode = await verifySecret(code, user.invite);
  if (!okCode || new Date(user.invite.expires).getTime() < Date.now()) return bad();
  const passcode = checkPasscode(body.passcode, email);
  const pw = await hashSecret(passcode);
  const updated = await db.updateUsers(b, (all) => {
    const u = all[user.id];
    if (!u?.invite || !timingSafeEqual(u.invite.hash, user.invite!.hash)) return null; // already used
    u.hash = pw.hash; u.salt = pw.salt; u.iters = pw.iters; u.sv = (u.sv ?? 0) + 1; delete u.invite;
    return { ...u };
  });
  if (!updated) return bad();
  await clearFailures(b, 'u', email);
  return json({ ok: true, user: { id: updated.id, role: updated.role } }, 200, { 'Set-Cookie': await setSessionCookie(request, env, updated) });
}

export async function changePasscode(request: Request, env: Env, actor: SessionUser) {
  assertSameOriginWrite(request);
  const b = bucketOf(env);
  const body = await readBody<{ current?: string; next?: string }>(request, 10_000);
  const users = (await db.users(b)).data;
  const me = users[actor.id];
  if (!me?.hash || !me.salt || !me.iters) throw new HttpError(400, 'No passcode set.');
  await assertNotLocked(b, request, me.email);
  if (!(await verifySecret(String(body.current ?? ''), { hash: me.hash, salt: me.salt, iters: me.iters }))) {
    await recordFailure(b, 'u', me.email);
    throw new HttpError(401, 'Your current passcode is not correct.');
  }
  const next = checkPasscode(body.next, me.email);
  const pw = await hashSecret(next);
  const updated = await db.updateUsers(b, (all) => {
    const u = all[actor.id];
    u.hash = pw.hash; u.salt = pw.salt; u.iters = pw.iters; u.sv++;
    return { ...u };
  });
  return json({ ok: true }, 200, { 'Set-Cookie': await setSessionCookie(request, env, updated) });
}

/** Keeps the credential file in step with staff/client records (never touches passcodes). */
export async function syncUser(b: R2Bucket, rec: { id: string; role: Role; email: string }) {
  await db.updateUsers(b, (users) => {
    const u = users[rec.id];
    if (u) {
      // A role change invalidates existing sessions so the new permissions apply immediately
      if (u.role !== rec.role) u.sv++;
      u.role = rec.role;
      u.email = rec.email.toLowerCase();
    }
    else users[rec.id] = { id: rec.id, role: rec.role, email: rec.email.toLowerCase(), sv: 1, createdAt: new Date().toISOString() };
  });
}
export async function removeUser(b: R2Bucket, id: string) {
  await db.updateUsers(b, (users) => { delete users[id]; });
}
