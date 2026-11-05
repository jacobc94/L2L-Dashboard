import type { AppState, OutboxEmail } from '../src/types';
import { DirectoryFile, EngagementFile, Env, HttpError, OutboxFile, R2Bucket, UsersFile } from './types';

const KEYS = {
  users: 'users.json',
  directory: 'directory.json',
  outbox: 'outbox.json',
  engagement: (id: string) => `engagements/${id}.json`,
  attempts: (k: string) => `attempts/${k}.json`,
};
export const ENGAGEMENT_PREFIX = 'engagements/';
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function bucketOf(env: Env): R2Bucket {
  if (!env.L2L_BUCKET) throw new HttpError(503, 'Storage is not configured (R2 binding L2L_BUCKET is missing).');
  return env.L2L_BUCKET;
}

export interface Versioned<T> {
  data: T;
  /** null = object does not exist yet */
  etag: string | null;
}

export async function readJson<T>(b: R2Bucket, key: string, fallback: T): Promise<Versioned<T>> {
  const obj = await b.get(key);
  if (!obj) return { data: fallback, etag: null };
  return { data: JSON.parse(await obj.text()) as T, etag: obj.etag };
}

/** Compare-and-swap write. Returns false if someone else wrote first. */
export async function writeJson<T>(b: R2Bucket, key: string, data: T, etag: string | null): Promise<boolean> {
  const res = await b.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
  });
  return res !== null;
}

/** Read-modify-write with retries on write conflicts. `fn` may be called more than once. */
export async function update<T, R>(
  b: R2Bucket,
  key: string,
  fallback: () => T,
  fn: (data: T) => R,
  attempts = 5
): Promise<R> {
  for (let i = 0; i < attempts; i++) {
    const cur = await readJson<T | null>(b, key, null);
    // `fallback` is only evaluated when the object doesn't exist (it may throw to mean "must already exist")
    const draft = cur.data === null ? fallback() : structuredClone(cur.data);
    const result = fn(draft);
    if (await writeJson(b, key, draft, cur.etag)) return result;
  }
  throw new HttpError(409, 'Someone else changed this at the same time. Please try again.');
}

export const db = {
  users: (b: R2Bucket) => readJson<UsersFile>(b, KEYS.users, {}),
  updateUsers: <R>(b: R2Bucket, fn: (u: UsersFile) => R) => update<UsersFile, R>(b, KEYS.users, () => ({}), fn),
  directory: (b: R2Bucket) => readJson<DirectoryFile | null>(b, KEYS.directory, null),
  updateDirectory: <R>(b: R2Bucket, fn: (d: DirectoryFile) => R) =>
    update<DirectoryFile, R>(b, KEYS.directory, () => { throw new HttpError(503, 'Not set up yet.'); }, fn),
  outbox: (b: R2Bucket) => readJson<OutboxFile>(b, KEYS.outbox, []),
  updateOutbox: <R>(b: R2Bucket, fn: (o: OutboxEmail[]) => R) => update<OutboxFile, R>(b, KEYS.outbox, () => [], fn),
  engagementKey: KEYS.engagement,
  attemptsKey: KEYS.attempts,
};

export async function listEngagementIds(b: R2Bucket): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await b.list({ prefix: ENGAGEMENT_PREFIX, cursor });
    for (const o of page.objects) ids.push(o.key.slice(ENGAGEMENT_PREFIX.length).replace(/\.json$/, ''));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

export async function loadEngagements(b: R2Bucket): Promise<EngagementFile[]> {
  const ids = await listEngagementIds(b);
  const files = await Promise.all(ids.map((id) => readJson<EngagementFile | null>(b, KEYS.engagement(id), null)));
  return files.map((f) => f.data).filter((f): f is EngagementFile => !!f);
}

/** The complete, unscoped app state (admin view). Server-internal only. */
export async function loadFullState(b: R2Bucket, version: number): Promise<AppState | null> {
  const dir = (await db.directory(b)).data;
  if (!dir) return null;
  const files = await loadEngagements(b);
  const outbox = (await db.outbox(b)).data;
  return {
    version,
    settings: dir.settings,
    staff: dir.staff,
    orgs: dir.orgs,
    clients: dir.clients,
    resources: dir.resources,
    engagements: files.map((f) => f.engagement),
    preTasks: files.flatMap((f) => f.preTasks),
    contracts: files.flatMap((f) => f.contracts),
    sessions: files.flatMap((f) => f.sessions),
    checkIns: files.flatMap((f) => f.checkIns),
    actions: files.flatMap((f) => f.actions),
    messages: files.flatMap((f) => f.messages),
    outbox,
  };
}
