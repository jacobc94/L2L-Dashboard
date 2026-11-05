import type { AppState, OutboxEmail, Role } from '../src/types';

// Minimal R2 surface we use (works with Cloudflare's binding and with the in-memory fake used in tests)
export interface R2Body {
  etag: string;
  text(): Promise<string>;
}
export interface R2Bucket {
  get(key: string): Promise<R2Body | null>;
  /** Returns null when an `onlyIf` precondition fails */
  put(
    key: string,
    value: string,
    options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string }; httpMetadata?: { contentType?: string } }
  ): Promise<R2Body | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated?: boolean; cursor?: string }>;
}

export interface Env {
  L2L_BUCKET?: R2Bucket;
  /** Secret: signs session cookies (32+ random bytes) */
  SESSION_SECRET?: string;
  /** Secret: lets the very first admin be created on an empty bucket */
  BOOTSTRAP_KEY?: string;
  /** Secret: bearer token for POST /api/cron/run */
  CRON_SECRET?: string;
  /** Secret: Resend API key */
  RESEND_API_KEY?: string;
  /** e.g. "L2L Coaching <coaching@l2lconsultingteam.com>" (must be a verified Resend sender) */
  MAIL_FROM?: string;
  /** Public URL of the app, used in email links, e.g. https://coaching.l2lconsultingteam.com */
  APP_URL?: string;
}

export type StaffRole = 'admin' | 'coach';

/** Credentials live only on the server and are never sent to a browser. */
export interface UserCred {
  id: string;
  role: Role;
  email: string;
  /** PBKDF2 hash of the passcode (base64url), with its salt and iteration count */
  hash?: string;
  salt?: string;
  iters?: number;
  /** One-time invite code (hashed) */
  invite?: { hash: string; salt: string; iters: number; expires: string };
  /** Bumped on passcode change so older cookies stop working */
  sv: number;
  createdAt: string;
}
export type UsersFile = Record<string, UserCred>;

export interface DirectoryFile {
  settings: AppState['settings'];
  staff: AppState['staff'];
  orgs: AppState['orgs'];
  clients: AppState['clients'];
  resources: AppState['resources'];
}

export interface EngagementFile {
  engagement: AppState['engagements'][number];
  preTasks: AppState['preTasks'];
  contracts: AppState['contracts'];
  sessions: AppState['sessions'];
  checkIns: AppState['checkIns'];
  actions: AppState['actions'];
  messages: AppState['messages'];
}

export type OutboxFile = OutboxEmail[];

export interface SessionUser {
  id: string;
  role: Role;
}

export type Collection =
  | 'staff' | 'orgs' | 'clients' | 'resources' | 'settings' | 'outbox'
  | 'engagements' | 'preTasks' | 'contracts' | 'sessions' | 'checkIns' | 'actions' | 'messages';

export interface Change {
  c: Collection;
  op: 'upsert' | 'delete';
  /** For upserts */
  record?: Record<string, unknown>;
  /** For deletes */
  id?: string;
  /** For deletes of engagement children */
  engagementId?: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
