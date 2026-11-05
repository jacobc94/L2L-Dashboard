// Pure write rules: given the current data, who is asking and what they want to change, decide what is allowed.
// No I/O here so every rule is unit-testable. Throwing/collecting errors never leaves partial results behind:
// callers apply to a copy and only persist if there were no errors.
import type { Client, Engagement, Session, Staff } from '../src/types';
import { openSlots } from '../src/utils/slots';
import { getNow } from '../src/utils/dates';
import type { Change, DirectoryFile, EngagementFile, SessionUser } from './types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// `joined` is a read-only flag the server adds for admins; it is never stored or compared
const changedKeys = (a: Record<string, unknown> | undefined, b: Record<string, unknown>) =>
  [...new Set([...Object.keys(a ?? {}), ...Object.keys(b)])].filter((k) => k !== 'joined' && !same(a?.[k], b[k]));

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class RuleError extends Error {}
const fail = (msg: string): never => {
  throw new RuleError(msg);
};
const str = (v: unknown, name: string, max = 5000, required = false): string => {
  if (v === undefined || v === null || v === '') { if (required) fail(`${name} is required.`); return ''; }
  if (typeof v !== 'string') return fail(`${name} must be text.`);
  if (v.length > max) return fail(`${name} is too long.`);
  return v;
};
const num = (v: unknown, name: string, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return fail(`${name} must be a number between ${min} and ${max}.`);
  return v;
};

export interface Ctx {
  user: SessionUser;
  dir: DirectoryFile;
  today: string;
  nowIso: string;
  weekStart: string;
  /** Every session in other engagements (for cross-engagement double-booking checks) */
  otherSessions: Session[];
}

const isAdmin = (c: Ctx) => c.user.role === 'admin';
const isCoach = (c: Ctx) => c.user.role === 'coach';
const isClientRole = (c: Ctx) => c.user.role === 'client';
export const canManage = (c: Ctx, e: Engagement) => isAdmin(c) || (isCoach(c) && e.coachId === c.user.id);
const isParticipant = (c: Ctx, e: Engagement) => isClientRole(c) && e.clientIds.includes(c.user.id);

// ───────────────────────── engagement + children ─────────────────────────

const ENG_TYPES = ['Executive Coaching', 'Team Coaching', 'Leadership Cohort'];
const ENG_STATUS = ['Pre-program', 'Active', 'Paused', 'Completed'];
const PHASES = ['Identify', 'Assess & Plan', 'Connect', 'Evolve'];
const SESSION_TYPES = ['Kickoff', 'Coaching Session', 'Check-in Call', 'Team Session', 'Debrief', 'Wrap-up', 'Consultation'];
const CLIENT_SESSION_TYPES = ['Kickoff', 'Coaching Session', 'Check-in Call', 'Consultation'];
const MODES = ['Zoom', 'Phone', 'On-site'];
const SESSION_STATUS = ['requested', 'scheduled', 'completed', 'cancelled', 'no-show'];

function checkEngagementShape(e: Record<string, unknown>, ctx: Ctx): Engagement {
  const out = clone(e) as unknown as Engagement;
  if (!ID_RE.test(String(out.id))) fail('Invalid engagement id.');
  str(out.title, 'Title', 200, true);
  if (!ENG_TYPES.includes(out.type)) fail('Unknown program type.');
  if (!ENG_STATUS.includes(out.status)) fail('Unknown status.');
  if (!PHASES.includes(out.phase)) fail('Unknown phase.');
  if (!DATE_RE.test(out.startDate) || !DATE_RE.test(out.endDate)) fail('Dates must be YYYY-MM-DD.');
  if (out.endDate < out.startDate) fail('The end date must be after the start date.');
  num(out.contractedHours, 'Contracted hours', 0, 10000);
  num(out.checkInDay, 'Check-in day', 0, 6);
  if (!Array.isArray(out.clientIds) || out.clientIds.length < 1 || out.clientIds.length > 50) fail('An engagement needs at least one participant.');
  for (const id of out.clientIds) if (!ctx.dir.clients.some((c) => c.id === id)) fail('Unknown participant.');
  if (!ctx.dir.orgs.some((o) => o.id === out.orgId)) fail('Unknown organization.');
  if (!ctx.dir.staff.some((s) => s.id === out.coachId)) fail('Unknown coach.');
  if (!Array.isArray(out.goals) || out.goals.length > 30) fail('Invalid goals.');
  for (const g of out.goals) { str(g.text, 'Goal', 500, true); num(g.progress, 'Goal progress', 0, 100); if (!ID_RE.test(String(g.id))) fail('Invalid goal id.'); }
  return out;
}

function upsertEngagement(f: EngagementFile | null, rec: Record<string, unknown>, ctx: Ctx): EngagementFile {
  if (!f) {
    // creation
    if (isClientRole(ctx)) fail('Clients can\'t create engagements.');
    const e = checkEngagementShape(rec, ctx);
    if (isCoach(ctx) && e.coachId !== ctx.user.id) fail('Coaches can only create engagements for themselves.');
    if (e.status !== 'Pre-program') fail('New engagements start in Pre-program.');
    if (e.closeout) fail('A new engagement can\'t have feedback yet.');
    return { engagement: e, preTasks: [], contracts: [], sessions: [], checkIns: [], actions: [], messages: [] };
  }
  const old = f.engagement;
  if (rec.id !== old.id) fail('Engagement id mismatch.');
  if (isClientRole(ctx)) {
    if (!isParticipant(ctx, old)) fail('You don\'t have access to this engagement.');
    const keys = changedKeys(old as unknown as Record<string, unknown>, rec);
    if (keys.length === 0) return f;
    if (keys.length !== 1 || keys[0] !== 'closeout') fail('Clients can only submit program feedback.');
    const c = rec.closeout as Record<string, unknown> | undefined;
    if (old.status !== 'Completed' || old.closeout || !c) fail('Feedback can only be submitted once the program is complete.');
    if (c!.clientId !== ctx.user.id) fail('Feedback must be submitted as yourself.');
    num(c!.overall, 'Overall rating', 1, 5); num(c!.goalsMet, 'Goals rating', 1, 5); num(c!.wouldRecommend, 'Recommendation', 0, 10);
    str(c!.highlight, 'Highlight', 2000); str(c!.improve, 'Improvement', 2000);
    f.engagement = { ...old, closeout: { ...(c as unknown as NonNullable<Engagement['closeout']>), submittedAt: ctx.nowIso } };
    return f;
  }
  if (!canManage(ctx, old)) fail('You can\'t change another coach\'s engagement.');
  const next = checkEngagementShape(rec, ctx);
  if (!isAdmin(ctx)) {
    for (const k of ['coachId', 'clientIds', 'orgId', 'type'] as const) if (!same(old[k], next[k])) fail('Only an admin can change the coach, participants, organization or program type.');
  }
  if (!same(old.closeout, next.closeout)) fail('Program feedback can only be submitted by the client.');
  f.engagement = next;
  return f;
}

function upsertTask(f: EngagementFile, rec: Record<string, unknown>, ctx: Ctx) {
  const e = f.engagement;
  if (rec.engagementId !== e.id || !ID_RE.test(String(rec.id))) fail('Invalid step.');
  const i = f.preTasks.findIndex((t) => t.id === rec.id);
  const old = f.preTasks[i];
  if (isClientRole(ctx)) {
    if (!old || !isParticipant(ctx, e)) fail('Clients can only complete existing steps.');
    const keys = changedKeys(old as unknown as Record<string, unknown>, rec);
    if (keys.some((k) => k !== 'done' && k !== 'completedAt')) fail('Clients can only tick off their own steps.');
    if (old.assignee !== 'client' || (old.clientId && old.clientId !== ctx.user.id)) fail('That step isn\'t yours.');
    if (old.kind === 'contract' && rec.done === true && !f.contracts.some((c) => c.status === 'signed')) fail('Sign the agreement to complete this step.');
    f.preTasks[i] = { ...old, done: !!rec.done, completedAt: rec.done ? ctx.nowIso : undefined };
    return;
  }
  if (!canManage(ctx, e)) fail('You can\'t change another coach\'s engagement.');
  str(rec.title, 'Title', 300, true); str(rec.description, 'Description', 2000);
  if (!['client', 'coach', 'admin'].includes(String(rec.assignee))) fail('Unknown assignee.');
  if (rec.dueDate && !DATE_RE.test(String(rec.dueDate))) fail('Bad due date.');
  if (rec.clientId && !e.clientIds.includes(String(rec.clientId))) fail('That person isn\'t in this engagement.');
  if (rec.link && !/^https?:\/\//i.test(String(rec.link))) fail('Links must start with http:// or https://');
  const rec2 = clone(rec) as unknown as typeof old;
  if (i >= 0) f.preTasks[i] = rec2; else f.preTasks.push(rec2);
}

function upsertContract(f: EngagementFile, rec: Record<string, unknown>, ctx: Ctx) {
  const e = f.engagement;
  if (rec.engagementId !== e.id || !ID_RE.test(String(rec.id))) fail('Invalid contract.');
  const i = f.contracts.findIndex((c) => c.id === rec.id);
  const old = f.contracts[i];
  if (isClientRole(ctx)) {
    if (!old || !isParticipant(ctx, e)) fail('You don\'t have access to this agreement.');
    if (old.status !== 'sent') fail('This agreement isn\'t waiting for a signature.');
    if (e.clientIds[0] !== ctx.user.id) fail('Only the primary contact signs for this engagement.');
    const keys = changedKeys(old as unknown as Record<string, unknown>, rec);
    const allowed = new Set(['status', 'signedAt', 'signedByName', 'signedByClientId']);
    if (keys.some((k) => !allowed.has(k)) || rec.status !== 'signed') fail('Clients can only sign the agreement.');
    const me = ctx.dir.clients.find((c) => c.id === ctx.user.id);
    if (rec.signedByClientId !== ctx.user.id || String(rec.signedByName ?? '').trim().toLowerCase() !== me?.name.trim().toLowerCase()) fail('Type your full name exactly to sign.');
    f.contracts[i] = { ...old, status: 'signed', signedAt: ctx.nowIso, signedByName: String(rec.signedByName).trim(), signedByClientId: ctx.user.id };
    return;
  }
  if (!canManage(ctx, e)) fail('You can\'t change another coach\'s engagement.');
  const next = clone(rec) as unknown as NonNullable<typeof old>;
  if (!['draft', 'sent', 'signed', 'void'].includes(next.status)) fail('Unknown contract status.');
  str(next.title, 'Title', 300, true); str(next.additionalTerms, 'Additional terms', 10000); str(next.billingNote, 'Billing note', 500);
  num(next.totalHours, 'Hours', 0, 10000); num(next.cancellationHours, 'Cancellation window', 0, 720);
  if (next.fee != null) num(next.fee, 'Fee', 0, 100_000_000);
  if (!DATE_RE.test(next.startDate) || !DATE_RE.test(next.endDate)) fail('Dates must be YYYY-MM-DD.');
  if (!old) {
    if (next.status !== 'draft') fail('New agreements start as drafts.');
    delete next.sentAt; delete next.signedAt; delete next.signedByName; delete next.signedByClientId; delete next.coachSignedAt; delete next.coachSignedName;
    f.contracts.push(next);
    return;
  }
  // Staff can never sign for a client or edit a signed agreement; timestamps are always stamped by the server
  const signedFields = ['signedAt', 'signedByName', 'signedByClientId'] as const;
  if (old.status === 'signed') { if (!same(old, next)) fail('A signed agreement can\'t be changed.'); return; }
  if (next.status === 'signed' || signedFields.some((k) => !same(old[k], next[k]))) fail('Only the client can sign the agreement.');
  if (old.status === 'void') fail('A voided agreement can\'t be changed.');
  if (next.status === 'sent' && old.status !== 'sent') { next.sentAt = ctx.nowIso; next.coachSignedAt = ctx.nowIso; next.coachSignedName = (ctx.dir.staff.find((s) => s.id === ctx.user.id)?.name) ?? next.coachSignedName; }
  else { next.sentAt = old.sentAt; next.coachSignedAt = old.coachSignedAt; next.coachSignedName = old.coachSignedName; }
  f.contracts[i] = next;
}

function sessionClash(f: EngagementFile, coachId: string, start: string, durationMin: number, ignoreId: string | undefined, ctx: Ctx, settings: DirectoryFile['settings']): void {
  const coach = ctx.dir.staff.find((s) => s.id === coachId);
  if (!coach) fail('Unknown coach.');
  const all = [...ctx.otherSessions, ...f.sessions].filter((s) => s.id !== ignoreId);
  const open = openSlots(coach!, all, durationMin, settings, getNow());
  if (!open.some((s) => s.start === start)) fail('That time isn\'t available. Please choose another slot.');
}

function upsertSession(f: EngagementFile, rec: Record<string, unknown>, ctx: Ctx) {
  const e = f.engagement;
  if (rec.engagementId !== e.id || !ID_RE.test(String(rec.id))) fail('Invalid session.');
  const i = f.sessions.findIndex((s) => s.id === rec.id);
  const old = f.sessions[i];
  const settings = ctx.dir.settings;
  const next = clone(rec) as unknown as Session;

  if (isClientRole(ctx)) {
    if (!isParticipant(ctx, e)) fail('You don\'t have access to this engagement.');
    if (e.status === 'Completed') fail('This program is complete.');
    if (!old) {
      // A client booking: it becomes a request (or a confirmed session if the practice doesn't require approval)
      if (!CLIENT_SESSION_TYPES.includes(next.type) || !MODES.includes(next.mode)) fail('Unknown session type or format.');
      if (!DATETIME_RE.test(next.start)) fail('Bad start time.');
      num(next.durationMin, 'Length', 15, 240);
      if (next.coachId !== e.coachId) fail('Sessions are booked with your coach.');
      const expected = settings.requireApproval ? 'requested' : 'scheduled';
      if (next.status !== expected || next.requestedBy !== 'client') fail('Invalid booking.');
      for (const k of ['loggedHours', 'summary', 'nextFocus', 'privateNotes', 'clientRating', 'clientReflection', 'cancelReason'] as const) if (next[k] !== undefined) fail('Invalid booking.');
      if (next.location) str(next.location, 'Location', 300);
      sessionClash(f, e.coachId, next.start, next.durationMin, undefined, ctx, settings);
      f.sessions.push(next);
      return;
    }
    const keys = changedKeys(old as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
    if (keys.length === 0) return;
    const allowed = new Set(['start', 'status', 'requestedBy', 'cancelReason', 'clientRating', 'clientReflection']);
    if (keys.some((k) => !allowed.has(k))) fail('You can\'t change that part of a session.');
    const rating = keys.includes('clientRating') || keys.includes('clientReflection');
    if (rating) {
      if (old.status !== 'completed') fail('You can rate a session once it has happened.');
      num(next.clientRating, 'Rating', 1, 5); str(next.clientReflection, 'Reflection', 2000);
      if (keys.some((k) => k !== 'clientRating' && k !== 'clientReflection')) fail('Invalid change.');
    }
    if (keys.includes('status') || keys.includes('start')) {
      if (old.status !== 'scheduled' && old.status !== 'requested') fail('That session can no longer be changed.');
      if (next.status === 'cancelled') {
        if (keys.some((k) => k !== 'status' && k !== 'cancelReason')) fail('Invalid change.');
        str(next.cancelReason, 'Reason', 500);
      } else {
        // rescheduling
        const expected = settings.requireApproval ? 'requested' : 'scheduled';
        if (!keys.includes('start') || next.status !== expected || next.requestedBy !== 'client') fail('Invalid reschedule.');
        if (!DATETIME_RE.test(next.start)) fail('Bad start time.');
        sessionClash(f, old.coachId, next.start, old.durationMin, old.id, ctx, settings);
      }
    }
    f.sessions[i] = { ...old, ...next };
    return;
  }

  if (!canManage(ctx, e)) fail('You can\'t change another coach\'s engagement.');
  if (!SESSION_TYPES.includes(next.type) || !MODES.includes(next.mode) || !SESSION_STATUS.includes(next.status)) fail('Unknown session type, format or status.');
  if (!DATETIME_RE.test(next.start)) fail('Bad start time.');
  num(next.durationMin, 'Length', 5, 600);
  if (!ctx.dir.staff.some((s) => s.id === next.coachId)) fail('Unknown coach.');
  if (next.loggedHours != null) num(next.loggedHours, 'Hours', 0, 24);
  str(next.summary, 'Summary', 5000); str(next.nextFocus, 'Next focus', 3000); str(next.privateNotes, 'Private notes', 10000);
  // Only the client can rate their own session
  if (!same(old?.clientRating, next.clientRating) || !same(old?.clientReflection, next.clientReflection)) fail('Only the client can rate a session.');
  if (i >= 0) f.sessions[i] = next; else f.sessions.push(next);
}

function upsertCheckIn(f: EngagementFile, rec: Record<string, unknown>, ctx: Ctx) {
  const e = f.engagement;
  if (rec.engagementId !== e.id || !ID_RE.test(String(rec.id))) fail('Invalid check-in.');
  const i = f.checkIns.findIndex((c) => c.id === rec.id);
  const old = f.checkIns[i];
  const next = clone(rec) as unknown as NonNullable<typeof old>;
  if (isClientRole(ctx)) {
    if (!isParticipant(ctx, e) || next.clientId !== ctx.user.id) fail('Check-ins are submitted as yourself.');
    if (old && old.clientId !== ctx.user.id) fail('That isn\'t your check-in.');
    if (e.status !== 'Active') fail('Check-ins are open while the program is active.');
    if (next.weekOf !== ctx.weekStart) fail('You can only submit this week\'s check-in.');
    num(next.energy, 'Energy', 1, 5); num(next.progress, 'Progress', 1, 5);
    for (const k of ['wins', 'challenges', 'focusNext', 'supportNeeded'] as const) str(next[k], k, 3000);
    if (!same(old?.coachResponse, next.coachResponse) || !same(old?.respondedAt, next.respondedAt)) fail('Only your coach can reply.');
    const merged = { ...next, submittedAt: ctx.nowIso, coachResponse: old?.coachResponse, respondedAt: old?.respondedAt };
    if (i >= 0) f.checkIns[i] = merged; else f.checkIns.push(merged);
    return;
  }
  if (!canManage(ctx, e)) fail('You can\'t change another coach\'s engagement.');
  if (!old) fail('Only clients create check-ins.');
  const keys = changedKeys(old as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
  if (keys.some((k) => k !== 'coachResponse' && k !== 'respondedAt')) fail('Coaches can only reply to check-ins.');
  str(next.coachResponse, 'Reply', 3000);
  f.checkIns[i] = { ...old, coachResponse: next.coachResponse, respondedAt: ctx.nowIso };
}

function upsertAction(f: EngagementFile, rec: Record<string, unknown>, ctx: Ctx) {
  const e = f.engagement;
  if (rec.engagementId !== e.id || !ID_RE.test(String(rec.id))) fail('Invalid action item.');
  const i = f.actions.findIndex((a) => a.id === rec.id);
  const old = f.actions[i];
  const next = clone(rec) as unknown as NonNullable<typeof old>;
  str(next.text, 'Action item', 1000, true);
  if (next.due && !DATE_RE.test(next.due)) fail('Bad due date.');
  if (!['client', 'coach'].includes(next.owner)) fail('Unknown owner.');
  if (isClientRole(ctx)) {
    if (!isParticipant(ctx, e)) fail('You don\'t have access to this engagement.');
    if (!old) {
      if (next.owner !== 'client' || next.clientId !== ctx.user.id) fail('You can add action items for yourself.');
      f.actions.push({ ...next, done: !!next.done });
      return;
    }
    const mine = old.owner === 'client' && (!old.clientId || old.clientId === ctx.user.id);
    const keys = changedKeys(old as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
    if (!mine || keys.some((k) => k !== 'done')) fail('You can only tick off your own action items.');
    f.actions[i] = { ...old, done: !!next.done };
    return;
  }
  if (!canManage(ctx, e)) fail('You can\'t change another coach\'s engagement.');
  if (next.clientId && !e.clientIds.includes(next.clientId)) fail('That person isn\'t in this engagement.');
  if (i >= 0) f.actions[i] = next; else f.actions.push(next);
}

function upsertMessage(f: EngagementFile, rec: Record<string, unknown>, ctx: Ctx) {
  const e = f.engagement;
  if (rec.engagementId !== e.id || !ID_RE.test(String(rec.id))) fail('Invalid message.');
  if (!(isParticipant(ctx, e) || canManage(ctx, e))) fail('You don\'t have access to this conversation.');
  const i = f.messages.findIndex((m) => m.id === rec.id);
  const old = f.messages[i];
  const next = clone(rec) as unknown as NonNullable<typeof old>;
  if (!old) {
    const me = isClientRole(ctx) ? ctx.dir.clients.find((c) => c.id === ctx.user.id) : ctx.dir.staff.find((s) => s.id === ctx.user.id);
    const roleOk = isClientRole(ctx) ? next.fromRole === 'client' : next.fromRole === 'coach' || next.fromRole === ctx.user.role;
    if (next.fromId !== ctx.user.id || !roleOk || !me) fail('Messages are sent as yourself.');
    const text = str(next.text, 'Message', 5000, true).trim();
    if (!text) fail('Message is empty.');
    f.messages.push({ id: next.id, engagementId: e.id, fromRole: next.fromRole, fromId: ctx.user.id, fromName: me!.name, text, at: ctx.nowIso, readBy: [ctx.user.id] });
    if (f.messages.length > 5000) f.messages.splice(0, f.messages.length - 5000);
    return;
  }
  // Existing messages: the only allowed change is adding yourself to readBy
  const keys = changedKeys(old as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
  if (keys.length === 0) return;
  const added = (next.readBy ?? []).filter((x) => !old.readBy.includes(x));
  if (keys.length !== 1 || keys[0] !== 'readBy' || (next.readBy ?? []).length !== old.readBy.length + added.length || added.some((x) => x !== ctx.user.id)) fail('Messages can\'t be edited.');
  old.readBy.push(...added);
}

/**
 * Applies this engagement's changes to a copy of its file. Returns the new file (null if nothing exists)
 * or throws RuleError. `f` is null when the engagement doesn't exist yet.
 */
export function applyEngagementChanges(file: EngagementFile | null, changes: Change[], ctx: Ctx): EngagementFile | null {
  let f = file ? clone(file) : null;
  for (const ch of changes) {
    if (ch.c === 'engagements') {
      if (ch.op === 'delete') fail('Engagements can\'t be deleted.');
      f = upsertEngagement(f, ch.record ?? fail('Missing record.'), ctx);
      continue;
    }
    if (!f) fail('That engagement doesn\'t exist.');
    const ff = f as EngagementFile;
    // Clients/coaches only ever touch engagements they belong to
    if (!(isAdmin(ctx) || canManage(ctx, ff.engagement) || isParticipant(ctx, ff.engagement))) fail('You don\'t have access to this engagement.');
    if (ch.op === 'delete') {
      if (ch.c !== 'preTasks' || isClientRole(ctx) || !canManage(ctx, ff.engagement)) fail('That can\'t be deleted.');
      ff.preTasks = ff.preTasks.filter((t) => t.id !== ch.id);
      continue;
    }
    const rec = ch.record ?? fail('Missing record.');
    switch (ch.c) {
      case 'preTasks': upsertTask(ff, rec, ctx); break;
      case 'contracts': upsertContract(ff, rec, ctx); break;
      case 'sessions': upsertSession(ff, rec, ctx); break;
      case 'checkIns': upsertCheckIn(ff, rec, ctx); break;
      case 'actions': upsertAction(ff, rec, ctx); break;
      case 'messages': upsertMessage(ff, rec, ctx); break;
      default: fail('Unknown data type.');
    }
  }
  if (f) autoActivate(f, ctx.today);
  return f;
}

/** Derived transition owned by the server: signed + every step done + start date reached → Active. */
export function autoActivate(f: EngagementFile, today: string) {
  const e = f.engagement;
  if (e.status !== 'Pre-program') return;
  if (f.contracts.some((c) => c.status === 'signed') && f.preTasks.every((t) => t.done) && e.startDate <= today) e.status = 'Active';
}

// ───────────────────────── directory (people, settings, resources) ─────────────────────────

const HOUR_BLOCKS_MAX = 30;
function checkAvailability(a: unknown): Staff['availability'] {
  if (!Array.isArray(a) || a.length > HOUR_BLOCKS_MAX) return fail('Invalid availability.');
  for (const b of a) {
    if (!Number.isInteger(b?.day) || b.day < 0 || b.day > 6 || !TIME_RE.test(b?.start) || !TIME_RE.test(b?.end) || b.end <= b.start) fail('Availability windows need a day, a start and a later end.');
  }
  return a.map((b) => ({ day: b.day, start: b.start, end: b.end }));
}

function checkSettings(s: Record<string, unknown>): DirectoryFile['settings'] {
  const out = clone(s) as unknown as DirectoryFile['settings'];
  for (const k of ['orgName', 'supportEmail', 'phone', 'address'] as const) str(out[k], k, 300, true);
  if (!EMAIL_RE.test(out.supportEmail)) fail('Support email isn\'t valid.');
  num(out.bookingWindowDays, 'Booking window', 1, 365); num(out.minNoticeHours, 'Minimum notice', 0, 720);
  num(out.cancellationHours, 'Cancellation window', 0, 720); num(out.sessionReminderHours, 'Reminder lead', 0, 720);
  num(out.lowHoursThreshold, 'Low-hours threshold', 0.1, 1); num(out.defaultSessionMinutes, 'Default session', 15, 240);
  num(out.weeklyDigestDay, 'Digest day', -1, 6);
  if (typeof out.requireApproval !== 'boolean' || typeof out.autoSendReminders !== 'boolean') fail('Invalid settings.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: out.timezone }); } catch { fail('Unknown timezone.'); }
  if (!Array.isArray(out.standardTerms) || out.standardTerms.length > 40) fail('Invalid contract terms.');
  for (const t of out.standardTerms) { str(t.heading, 'Heading', 200, true); str(t.text, 'Terms', 10000); }
  return out;
}

const COACH_SELF_KEYS = ['availability', 'name', 'title', 'credentials', 'bio', 'timezone'];

export interface DirectoryResult {
  dir: DirectoryFile;
  /** Credential-file bookkeeping the caller must perform */
  upserts: Array<{ id: string; role: 'admin' | 'coach' | 'client'; email: string }>;
  removals: string[];
  /** Ids the caller must confirm no engagement still references before persisting */
  removedClients: string[];
  removedOrgs: string[];
}

export function applyDirectoryChanges(dir: DirectoryFile, changes: Change[], ctx: Ctx): DirectoryResult {
  const d = clone(dir);
  const upserts: DirectoryResult['upserts'] = [];
  const removals: string[] = [];
  const removedClients: string[] = [];
  const removedOrgs: string[] = [];
  for (const ch of changes) {
    const rec = ch.record;
    switch (ch.c) {
      case 'settings': {
        if (!isAdmin(ctx)) fail('Only admins can change settings.');
        d.settings = checkSettings(rec ?? fail('Missing record.'));
        break;
      }
      case 'orgs': {
        if (!isAdmin(ctx)) fail('Only admins can manage organizations.');
        if (ch.op === 'delete') {
          if (d.clients.some((c) => c.orgId === ch.id)) fail('Move or remove this organization\'s clients first.');
          d.orgs = d.orgs.filter((x) => x.id !== ch.id);
          removedOrgs.push(String(ch.id));
          break;
        }
        const o = rec ?? fail('Missing record.');
        if (!ID_RE.test(String(o.id))) fail('Invalid id.');
        const item = { id: String(o.id), name: str(o.name, 'Name', 200, true), industry: str(o.industry, 'Industry', 200) || undefined };
        const i = d.orgs.findIndex((x) => x.id === item.id);
        if (i >= 0) d.orgs[i] = item; else d.orgs.push(item);
        break;
      }
      case 'clients': {
        if (ch.op === 'delete') {
          if (!isAdmin(ctx)) fail('Only admins can remove clients.');
          const t = d.clients.find((c) => c.id === ch.id);
          if (!t) break;
          d.clients = d.clients.filter((c) => c.id !== ch.id);
          removals.push(t.id);
          removedClients.push(t.id);
          break;
        }
        const c = rec ?? fail('Missing record.');
        if (!ID_RE.test(String(c.id))) fail('Invalid id.');
        if (!isAdmin(ctx)) {
          // A client may update only their own name, title and phone (never email, organization or access)
          const j = d.clients.findIndex((x) => x.id === c.id);
          if (!isClientRole(ctx) || j < 0 || c.id !== ctx.user.id) fail('Only admins can manage clients.');
          const keys = changedKeys(d.clients[j] as unknown as Record<string, unknown>, c);
          if (keys.some((k) => !['name', 'title', 'phone'].includes(k))) fail('You can only change your name, title and phone.');
          d.clients[j] = { ...d.clients[j], name: str(c.name, 'Name', 200, true).trim(), title: str(c.title, 'Title', 200), phone: str(c.phone, 'Phone', 50) || undefined };
          break;
        }
        const email = str(c.email, 'Email', 200, true).trim().toLowerCase();
        if (!EMAIL_RE.test(email)) fail('Enter a valid email.');
        if ([...d.clients, ...d.staff].some((p) => p.id !== c.id && p.email.toLowerCase() === email)) fail('That email is already in use.');
        if (!d.orgs.some((o) => o.id === c.orgId)) fail('Choose an organization.');
        const item: Client = { id: String(c.id), name: str(c.name, 'Name', 200, true).trim(), title: str(c.title, 'Title', 200), orgId: String(c.orgId), email, phone: str(c.phone, 'Phone', 50) || undefined };
        const i = d.clients.findIndex((x) => x.id === item.id);
        if (i >= 0) d.clients[i] = item; else d.clients.push(item);
        upserts.push({ id: item.id, role: 'client', email });
        break;
      }
      case 'staff': {
        if (ch.op === 'delete') {
          if (!isAdmin(ctx)) fail('Only admins can remove team members.');
          if (ch.id === ctx.user.id) fail('You can\'t remove yourself.');
          const t = d.staff.find((s) => s.id === ch.id);
          if (!t) break;
          if (t.role === 'admin' && d.staff.filter((s) => s.role === 'admin').length <= 1) fail('You can\'t remove the last admin.');
          d.staff = d.staff.filter((s) => s.id !== ch.id);
          removals.push(t.id);
          break;
        }
        const s = rec ?? fail('Missing record.');
        if (!ID_RE.test(String(s.id))) fail('Invalid id.');
        const i = d.staff.findIndex((x) => x.id === s.id);
        if (!isAdmin(ctx)) {
          // A coach may update only their own profile details and availability (never email or role)
          if (!isCoach(ctx) || i < 0 || s.id !== ctx.user.id) fail('Only admins can change team members.');
          const keys = changedKeys(d.staff[i] as unknown as Record<string, unknown>, s);
          if (keys.some((k) => !COACH_SELF_KEYS.includes(k))) fail('You can only change your own profile details and availability.');
          d.staff[i] = {
            ...d.staff[i],
            name: str(s.name, 'Name', 200, true).trim(), title: str(s.title, 'Title', 200),
            credentials: str(s.credentials, 'Credentials', 100) || undefined, bio: str(s.bio, 'Bio', 1000) || undefined,
            timezone: str(s.timezone, 'Timezone', 60) || 'Pacific Time', availability: checkAvailability(s.availability),
          };
          break;
        }
        const email = str(s.email, 'Email', 200, true).trim().toLowerCase();
        if (!EMAIL_RE.test(email)) fail('Enter a valid email.');
        if ([...d.clients, ...d.staff].some((p) => p.id !== s.id && p.email.toLowerCase() === email)) fail('That email is already in use.');
        if (!['admin', 'coach'].includes(String(s.role))) fail('Unknown role.');
        if (i >= 0 && d.staff[i].id === ctx.user.id && d.staff[i].role !== s.role) fail('You can\'t change your own role.');
        if (i >= 0 && d.staff[i].role === 'admin' && s.role !== 'admin' && d.staff.filter((x) => x.role === 'admin').length <= 1) fail('There must be at least one admin.');
        const item: Staff = {
          id: String(s.id), name: str(s.name, 'Name', 200, true).trim(), title: str(s.title, 'Title', 200), email, role: s.role as Staff['role'],
          credentials: str(s.credentials, 'Credentials', 100) || undefined, bio: str(s.bio, 'Bio', 1000) || undefined,
          timezone: str(s.timezone, 'Timezone', 60) || 'Pacific Time', availability: checkAvailability(s.availability ?? []),
        };
        if (i >= 0) d.staff[i] = item; else d.staff.push(item);
        upserts.push({ id: item.id, role: item.role, email });
        break;
      }
      case 'resources': {
        if (!isAdmin(ctx)) fail('Only admins can manage resources.');
        if (ch.op === 'delete') { d.resources = d.resources.filter((r) => r.id !== ch.id); break; }
        const r = rec ?? fail('Missing record.');
        if (!ID_RE.test(String(r.id))) fail('Invalid id.');
        const url = str(r.url, 'Link', 1000);
        if (url && !/^https?:\/\//i.test(url)) fail('Links must start with http:// or https://');
        if (!['Assessment', 'Worksheet', 'Listen & Learn', 'Framework'].includes(String(r.category))) fail('Unknown category.');
        const item = { id: String(r.id), title: str(r.title, 'Title', 200, true), description: str(r.description, 'Description', 1000), category: r.category as 'Assessment', url: url || undefined, body: str(r.body, 'Body', 10000) || undefined };
        if (!item.url && !item.body) fail('Add a link or worksheet text.');
        const i = d.resources.findIndex((x) => x.id === item.id);
        if (i >= 0) d.resources[i] = item; else d.resources.push(item);
        break;
      }
      default: fail('Unknown data type.');
    }
  }
  return { dir: d, upserts, removals, removedClients, removedOrgs };
}

// ───────────────────────── outbox ─────────────────────────

const EMAIL_KINDS = ['session-reminder', 'checkin-reminder', 'task-reminder', 'contract-reminder', 'action-reminder', 'coach-log', 'coach-request', 'coach-checkin', 'weekly-digest', 'custom'];

/** `allowedTo`: lower-cased addresses this user may email (admin: every known address). */
export function applyOutboxChanges(outbox: import('../src/types').OutboxEmail[], changes: Change[], ctx: Ctx, allowedTo: Set<string>) {
  const out = clone(outbox);
  if (isClientRole(ctx)) fail('Clients can\'t change the outbox.');
  for (const ch of changes) {
    if (ch.op === 'delete') fail('Emails can\'t be deleted — dismiss them instead.');
    const r = ch.record ?? fail('Missing record.');
    if (!ID_RE.test(String(r.id))) fail('Invalid id.');
    const i = out.findIndex((o) => o.id === r.id);
    const toEmail = String(r.toEmail ?? '').toLowerCase();
    if (!allowedTo.has(toEmail)) fail('You can only email your own clients.');
    if (i >= 0) {
      const keys = changedKeys(out[i] as unknown as Record<string, unknown>, r);
      if (keys.some((k) => k !== 'status' && k !== 'sentAt')) fail('Queued emails can\'t be edited.');
      if (!['queued', 'sent', 'dismissed'].includes(String(r.status))) fail('Bad status.');
      // Marking mail "sent" by hand is allowed (user sent it from their own email app); the server sets real sentAt itself
      out[i] = { ...out[i], status: r.status as 'queued', sentAt: r.status === 'sent' ? ctx.nowIso : undefined };
    } else {
      if (!EMAIL_KINDS.includes(String(r.kind)) || r.status !== 'queued') fail('Invalid email.');
      out.unshift({
        id: String(r.id), kind: r.kind as 'custom', toName: str(r.toName, 'Name', 200), toEmail, subject: str(r.subject, 'Subject', 300, true),
        body: str(r.body, 'Body', 20000, true), createdAt: ctx.nowIso, status: 'queued', dedupeKey: r.dedupeKey ? str(r.dedupeKey, 'Key', 200) : undefined,
      });
    }
  }
  // Keep the file bounded: drop the oldest finished mail first
  if (out.length > 1500) {
    const keep = out.filter((o) => o.status === 'queued');
    const rest = out.filter((o) => o.status !== 'queued').slice(0, Math.max(0, 1500 - keep.length));
    return [...keep, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return out;
}
