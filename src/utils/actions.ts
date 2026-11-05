// Pure state transitions. Each takes a draft AppState and mutates it; the store wraps them in a copy.
import { AppState, CheckIn, Closeout, Contract, Role, Session, SessionStatus } from '../types';
import { addDays, nowIso, todayIso, weekStart } from './dates';
import { uid } from './id';

export function createEngagementScaffold(d: AppState, engagementId: string) {
  const e = d.engagements.find((x) => x.id === engagementId);
  if (!e) return;
  const mk = (title: string, description: string, kind: any, assignee: any, dueOff: number, extra: any = {}) =>
    d.preTasks.push({ id: uid('t'), engagementId, title, description, kind, assignee, done: false, dueDate: addDays(e.startDate, dueOff), ...extra });
  mk('Sign coaching agreement', 'Review and e-sign your coaching contract.', 'contract', 'client', -7);
  mk('Complete intake questionnaire', 'Tell us about your role, challenges and what success looks like.', 'intake', 'client', -5);
  mk('Take your assessment', 'Your coach will send the link (Everything DiSC, LPI or The Five Behaviors).', 'assessment', 'client', -2);
  mk('Schedule kickoff session', 'Pick a time for the kickoff.', 'schedule', 'client', -3);
  mk('Send assessment links', 'Email the assessment link and instructions.', 'assessment', 'coach', -6);
  d.contracts.push({
    id: uid('ct'), engagementId, status: 'draft', title: `Coaching Agreement — ${e.title}`, totalHours: e.contractedHours,
    startDate: e.startDate, endDate: e.endDate, cancellationHours: d.settings.cancellationHours, additionalTerms: '',
  });
}

export function sendContract(d: AppState, contractId: string, byName: string) {
  const c = d.contracts.find((x) => x.id === contractId);
  if (!c) return;
  c.status = 'sent';
  c.sentAt = nowIso();
  c.coachSignedName = byName;
  c.coachSignedAt = nowIso();
}

export function signContract(d: AppState, contractId: string, clientId: string, typedName: string) {
  const c = d.contracts.find((x) => x.id === contractId);
  if (!c || c.status !== 'sent') return;
  c.status = 'signed';
  c.signedAt = nowIso();
  c.signedByName = typedName.trim();
  c.signedByClientId = clientId;
  // Signing completes the contract step of the pre-program checklist
  for (const t of d.preTasks) {
    if (t.engagementId === c.engagementId && t.kind === 'contract' && !t.done) {
      t.done = true;
      t.completedAt = nowIso();
    }
  }
}

export function voidContract(d: AppState, contract: Contract) {
  const c = d.contracts.find((x) => x.id === contract.id);
  if (c) c.status = 'void';
}

export function setTaskDone(d: AppState, taskId: string, done: boolean) {
  const t = d.preTasks.find((x) => x.id === taskId);
  if (!t) return;
  t.done = done;
  t.completedAt = done ? nowIso() : undefined;
}

/** Derived transition, run centrally (by the server, or by the demo store) rather than by whoever ticked the last box. */
export function autoActivateAll(d: AppState) {
  for (const e of d.engagements) maybeActivate(d, e.id);
}

/** Once every pre-program step is done and the contract is signed, the program becomes Active on its start date. */
export function maybeActivate(d: AppState, engagementId: string) {
  const e = d.engagements.find((x) => x.id === engagementId);
  if (!e || e.status !== 'Pre-program') return;
  const signed = d.contracts.some((c) => c.engagementId === engagementId && c.status === 'signed');
  const open = d.preTasks.some((t) => t.engagementId === engagementId && !t.done);
  if (signed && !open && e.startDate <= todayIso()) e.status = 'Active';
}

export function bookSession(
  d: AppState,
  input: Pick<Session, 'engagementId' | 'coachId' | 'type' | 'mode' | 'start' | 'durationMin'> & { location?: string; requestedBy: 'client' | 'coach' }
): Session {
  const needsApproval = input.requestedBy === 'client' && d.settings.requireApproval;
  const s: Session = { id: uid('s'), status: needsApproval ? 'requested' : 'scheduled', ...input };
  d.sessions.push(s);
  return s;
}

export function setSessionStatus(d: AppState, sessionId: string, status: SessionStatus, reason?: string) {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  s.status = status;
  if (status === 'cancelled') s.cancelReason = reason;
}

export function rescheduleSession(d: AppState, sessionId: string, start: string, byRole: Role) {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  s.start = start;
  // A client-initiated move needs the coach to re-confirm when approval is required
  s.status = byRole === 'client' && d.settings.requireApproval ? 'requested' : 'scheduled';
  if (byRole === 'client') s.requestedBy = 'client';
}

export function logSession(
  d: AppState,
  sessionId: string,
  data: { hours: number; summary: string; nextFocus: string; privateNotes: string; status: 'completed' | 'no-show'; actions: string[] }
) {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  s.status = data.status;
  s.loggedHours = data.hours;
  s.summary = data.summary.trim() || undefined;
  s.nextFocus = data.nextFocus.trim() || undefined;
  s.privateNotes = data.privateNotes.trim() || undefined;
  const e = d.engagements.find((x) => x.id === s.engagementId);
  const owner = e?.clientIds[0];
  for (const text of data.actions.map((t) => t.trim()).filter(Boolean)) {
    d.actions.push({
      id: uid('a'), engagementId: s.engagementId, text, owner: 'client', clientId: owner, done: false,
      createdAt: nowIso(), sessionId, due: addDays(todayIso(), 7),
    });
  }
}

export function rateSession(d: AppState, sessionId: string, rating: number, reflection: string) {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  s.clientRating = rating;
  s.clientReflection = reflection.trim() || undefined;
}

export function submitCheckIn(d: AppState, data: Omit<CheckIn, 'id' | 'submittedAt' | 'weekOf'>) {
  const wk = weekStart(todayIso());
  const existing = d.checkIns.find((c) => c.engagementId === data.engagementId && c.clientId === data.clientId && c.weekOf === wk);
  if (existing) {
    Object.assign(existing, data, { submittedAt: nowIso() });
  } else {
    d.checkIns.push({ id: uid('ci'), weekOf: wk, submittedAt: nowIso(), ...data });
  }
}

export function respondCheckIn(d: AppState, id: string, text: string) {
  const c = d.checkIns.find((x) => x.id === id);
  if (!c) return;
  c.coachResponse = text.trim();
  c.respondedAt = nowIso();
}

export function addAction(d: AppState, a: { engagementId: string; text: string; owner: 'client' | 'coach'; clientId?: string; due?: string }) {
  d.actions.push({ id: uid('a'), done: false, createdAt: nowIso(), ...a });
}

export function toggleAction(d: AppState, id: string) {
  const a = d.actions.find((x) => x.id === id);
  if (a) a.done = !a.done;
}

export function sendMessage(d: AppState, m: { engagementId: string; fromRole: Role; fromId: string; fromName: string; text: string }) {
  d.messages.push({ id: uid('m'), at: nowIso(), readBy: [m.fromId], ...m });
}

export function markThreadRead(d: AppState, engagementId: string, readerId: string) {
  for (const m of d.messages) if (m.engagementId === engagementId && !m.readBy.includes(readerId)) m.readBy.push(readerId);
}

export function submitCloseout(d: AppState, engagementId: string, data: Omit<Closeout, 'submittedAt'>) {
  const e = d.engagements.find((x) => x.id === engagementId);
  if (e) e.closeout = { submittedAt: nowIso(), ...data };
}

export function completeEngagement(d: AppState, engagementId: string) {
  const e = d.engagements.find((x) => x.id === engagementId);
  if (e) {
    e.status = 'Completed';
    e.phase = 'Evolve';
  }
}

/** Coach's weekly note: posted in the message thread and queued as an email to each participant. */
export function sendWeeklyUpdate(d: AppState, engagementId: string, from: { id: string; name: string }, text: string) {
  const e = d.engagements.find((x) => x.id === engagementId);
  if (!e || !text.trim()) return;
  d.messages.push({ id: uid('m'), engagementId, fromRole: 'coach', fromId: from.id, fromName: from.name, text: `Weekly update: ${text.trim()}`, at: nowIso(), readBy: [from.id] });
  for (const cid of e.clientIds) {
    const c = d.clients.find((x) => x.id === cid);
    if (!c) continue;
    d.outbox.unshift({
      id: uid('em'), kind: 'weekly-digest', toName: c.name, toEmail: c.email, createdAt: nowIso(), status: 'queued',
      subject: `Your weekly update from ${from.name.split(' ')[0]}`,
      body: `Hi ${c.name.split(' ')[0]},\n\n${text.trim()}\n\nOpen your portal to see your sessions, action items and hours.\n\n— ${d.settings.orgName}\n${d.settings.phone} · ${d.settings.supportEmail}`,
    });
  }
}

/**
 * Remove a staff member. If they still coach any engagement, `replacementId` takes those over,
 * including sessions that haven't happened yet. Delivered sessions keep the coach who ran them.
 * Returns an error message, or null on success.
 */
export function removeStaff(d: AppState, staffId: string, replacementId?: string): string | null {
  const person = d.staff.find((x) => x.id === staffId);
  if (!person) return 'That team member no longer exists.';
  if (person.role === 'admin' && d.staff.filter((x) => x.role === 'admin').length <= 1) return 'You can\'t remove the last admin.';
  const owned = d.engagements.filter((e) => e.coachId === staffId);
  if (owned.length > 0) {
    if (!replacementId) return 'Choose a replacement coach for their clients first.';
    if (replacementId === staffId || !d.staff.some((x) => x.id === replacementId)) return 'Choose a different, existing replacement coach.';
  }
  for (const e of owned) e.coachId = replacementId!;
  for (const s of d.sessions) {
    if (s.coachId !== staffId) continue;
    if ((s.status === 'scheduled' || s.status === 'requested') && replacementId) s.coachId = replacementId;
  }
  d.staff = d.staff.filter((x) => x.id !== staffId);
  return null;
}
