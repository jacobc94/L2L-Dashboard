import { STATE_VERSION } from '../src/data/seed';
import { nowIso, setBusinessTimezone } from '../src/utils/dates';
import { changePasscode, bootstrap, getSession, invite, join, login, logout, requireUser, status } from './auth';
import { sha256 } from './crypto';
import { bucketOf, db, loadFullState } from './db';
import { cron, sendQueued } from './email';
import { assertSameOriginWrite, errorResponse, json, readBody } from './http';
import { sliceFor } from './scope';
import { applyChanges } from './write';
import { Env, HttpError } from './types';

/** One entry point for every /api/* request. Pages Functions and tests both call this. */
export async function handle(request: Request, env: Env): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
    const m = request.method;
    const need = (method: string) => { if (m !== method) throw new HttpError(405, 'Method not allowed.'); };

    switch (path) {
      case 'auth/status': need('GET'); return await status(request, env);
      case 'auth/bootstrap': need('POST'); return await bootstrap(request, env);
      case 'auth/login': need('POST'); return await login(request, env);
      case 'auth/logout': need('POST'); return await logout(request);
      case 'auth/join': need('POST'); return await join(request, env);
      case 'auth/invite': need('POST'); return await invite(request, env, await requireUser(request, env));
      case 'auth/change-passcode': need('POST'); return await changePasscode(request, env, await requireUser(request, env));
      case 'cron/run': need('POST'); return await cron(request, env);

      case 'state': {
        need('GET');
        const user = await requireUser(request, env);
        const full = await loadFullState(bucketOf(env), STATE_VERSION);
        if (!full) throw new HttpError(503, 'The portal has not been set up yet.');
        const slice = sliceFor(full, user);
        if (user.role === 'admin') {
          // Let admins see who still needs an invite (never any credential material)
          const users = (await db.users(bucketOf(env))).data;
          slice.staff = slice.staff.map((s) => ({ ...s, joined: !!users[s.id]?.hash }));
          slice.clients = slice.clients.map((c) => ({ ...c, joined: !!users[c.id]?.hash }));
        }
        const body = JSON.stringify({ state: slice, user });
        const etag = `"${(await sha256(body)).slice(0, 24)}"`;
        if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-store' } });
        return new Response(body, { headers: { 'Content-Type': 'application/json', ETag: etag, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }

      case 'mutate': {
        need('POST');
        assertSameOriginWrite(request);
        const user = await requireUser(request, env);
        const body = await readBody<{ changes?: unknown }>(request, 1_500_000);
        return json(await applyChanges(env, user, body.changes));
      }

      case 'email/send': {
        need('POST');
        assertSameOriginWrite(request);
        const user = await requireUser(request, env);
        const body = await readBody<{ ids?: unknown }>(request, 100_000);
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
        if (!ids.length) throw new HttpError(400, 'Choose at least one email.');
        return await sendQueued(env, request, user, ids);
      }

      case 'export': {
        need('GET');
        const user = await requireUser(request, env);
        if (user.role !== 'admin') throw new HttpError(403, 'Only admins can export everything.');
        const full = await loadFullState(bucketOf(env), STATE_VERSION);
        setBusinessTimezone(full?.settings.timezone ?? null);
        return new Response(JSON.stringify(full, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="l2l-backup-${nowIso().slice(0, 10)}.json"` },
        });
      }

      default:
        throw new HttpError(404, 'Not found.');
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export { getSession };
