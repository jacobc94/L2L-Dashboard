import type { AppState } from '../src/types';
import { setBusinessTimezone, nowIso, todayIso, weekStart } from '../src/utils/dates';
import { db, bucketOf, listEngagementIds, readJson, writeJson } from './db';
import { removeUser, syncUser } from './auth';
import { Ctx, RuleError, applyDirectoryChanges, applyEngagementChanges, applyOutboxChanges, ID_RE } from './rules';
import { Change, Collection, DirectoryFile, EngagementFile, Env, HttpError, R2Bucket, SessionUser } from './types';

const ENGAGEMENT_COLLECTIONS: Collection[] = ['engagements', 'preTasks', 'contracts', 'sessions', 'checkIns', 'actions', 'messages'];
const DIRECTORY_COLLECTIONS: Collection[] = ['staff', 'orgs', 'clients', 'resources', 'settings'];
const MAX_CHANGES = 500;

function parseChanges(raw: unknown): Change[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CHANGES) throw new HttpError(400, 'Send between 1 and 500 changes.');
  return raw.map((c) => {
    const ch = c as Change;
    const known = [...ENGAGEMENT_COLLECTIONS, ...DIRECTORY_COLLECTIONS, 'outbox'];
    if (!ch || !known.includes(ch.c) || (ch.op !== 'upsert' && ch.op !== 'delete')) throw new HttpError(400, 'Unrecognised change.');
    if (ch.op === 'upsert' && (typeof ch.record !== 'object' || ch.record === null || Array.isArray(ch.record))) throw new HttpError(400, 'Missing record.');
    if (ch.op === 'delete' && typeof ch.id !== 'string') throw new HttpError(400, 'Missing id.');
    return ch;
  });
}

const engagementIdOf = (ch: Change): string => {
  const id = ch.c === 'engagements' ? (ch.record?.id ?? ch.id) : (ch.record?.engagementId ?? ch.engagementId);
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'A change is missing its engagement.');
  return id;
};

/**
 * Validates and applies a batch of record-level changes on behalf of `user`.
 *
 * Nothing is written unless every change in the batch is allowed. Writes are compare-and-swap per file, so two
 * people editing at once can't silently overwrite each other's different records.
 */
export async function applyChanges(env: Env, user: SessionUser, rawChanges: unknown): Promise<{ applied: number }> {
  const b = bucketOf(env);
  const changes = parseChanges(rawChanges);
  const dirV = await db.directory(b);
  if (!dirV.data) throw new HttpError(503, 'The portal has not been set up yet.');
  const dir = dirV.data;
  setBusinessTimezone(dir.settings.timezone);

  if (!(user.role === 'client' ? dir.clients : dir.staff).some((p) => p.id === user.id)) throw new HttpError(403, 'Your account no longer exists.');

  const base = (otherSessions: Ctx['otherSessions'], d: DirectoryFile = dir): Ctx => ({
    user, dir: d, today: todayIso(), nowIso: nowIso(), weekStart: weekStart(todayIso()), otherSessions,
  });

  // Group changes by target
  const byEngagement = new Map<string, Change[]>();
  const dirChanges: Change[] = [];
  const outboxChanges: Change[] = [];
  for (const ch of changes) {
    if (ENGAGEMENT_COLLECTIONS.includes(ch.c)) {
      const id = engagementIdOf(ch);
      byEngagement.set(id, [...(byEngagement.get(id) ?? []), ch]);
    } else if (ch.c === 'outbox') outboxChanges.push(ch);
    else dirChanges.push(ch);
  }

  // Everything other engagements contain that matters for double-booking and for staff-removal checks
  const ids = await listEngagementIds(b);
  const current = new Map<string, EngagementFile>();
  await Promise.all(ids.map(async (id) => {
    const f = (await readJson<EngagementFile | null>(b, db.engagementKey(id), null)).data;
    if (f) current.set(id, f);
  }));
  const sessionsExcept = (id: string) => [...current.entries()].filter(([k]) => k !== id).flatMap(([, f]) => f.sessions);

  try {
    // ── Phase 1: dry run everything ──
    // Directory first: new people must exist before engagements can reference them
    const dirResult = dirChanges.length ? applyDirectoryChanges(dir, dirChanges, base([])) : null;
    const dir2 = dirResult?.dir ?? dir;
    const next = new Map(current);
    for (const [id, chs] of byEngagement) {
      const res = applyEngagementChanges(current.get(id) ?? null, chs, base(sessionsExcept(id), dir2));
      if (res) next.set(id, res);
    }
    if (dirResult?.removals.length) {
      for (const f of next.values()) if (dirResult.removals.includes(f.engagement.coachId)) throw new RuleError('Reassign that person\'s clients before removing them.');
    }
    if (dirResult?.removedClients.length) {
      for (const f of next.values()) if (f.engagement.clientIds.some((id) => dirResult.removedClients.includes(id))) throw new RuleError('That client is part of a program. Remove them from it first.');
    }
    if (dirResult?.removedOrgs.length) {
      for (const f of next.values()) if (dirResult.removedOrgs.includes(f.engagement.orgId)) throw new RuleError('That organization still has a program.');
    }
    if (outboxChanges.length) applyOutboxChanges((await db.outbox(b)).data, outboxChanges, base([], dir2), allowedRecipients(dir2, user, next));

    // ── Phase 2: persist ──
    if (dirResult) {
      await db.updateDirectory(b, (d) => {
        const redo = applyDirectoryChanges(d, dirChanges, base([], d));
        Object.assign(d, redo.dir);
      });
      for (const u of dirResult.upserts) await syncUser(b, u);
      for (const id of dirResult.removals) await removeUser(b, id);
    }
    for (const [id, chs] of byEngagement) await writeEngagement(b, id, chs, (ids2) => base(sessionsExcept(id), ids2 ?? dir2), dir2);
    if (outboxChanges.length) {
      await db.updateOutbox(b, (ob) => {
        const next2 = applyOutboxChanges(ob, outboxChanges, base([], dir2), allowedRecipients(dir2, user, next));
        ob.splice(0, ob.length, ...next2);
      });
    }
  } catch (e) {
    if (e instanceof RuleError) throw new HttpError(403, e.message);
    throw e;
  }
  return { applied: changes.length };
}

async function writeEngagement(b: R2Bucket, id: string, chs: Change[], ctxFor: (dir?: DirectoryFile) => Ctx, dir: DirectoryFile) {
  const key = db.engagementKey(id);
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await readJson<EngagementFile | null>(b, key, null);
    const out = applyEngagementChanges(cur.data, chs, ctxFor(dir));
    if (!out) throw new HttpError(404, 'That engagement doesn\'t exist.');
    if (await writeJson(b, key, out, cur.etag)) return;
  }
  throw new HttpError(409, 'Someone else changed this at the same time. Please try again.');
}

/** Addresses this user may queue emails to. */
function allowedRecipients(dir: DirectoryFile, user: SessionUser, files: Map<string, EngagementFile>): Set<string> {
  const all = new Set([...dir.clients, ...dir.staff].map((p) => p.email.toLowerCase()));
  if (user.role === 'admin') return all;
  const out = new Set<string>([dir.staff.find((s) => s.id === user.id)?.email.toLowerCase() ?? '']);
  for (const f of files.values()) {
    if (f.engagement.coachId !== user.id) continue;
    for (const cid of f.engagement.clientIds) { const c = dir.clients.find((x) => x.id === cid); if (c) out.add(c.email.toLowerCase()); }
  }
  return out;
}

export type { AppState };
