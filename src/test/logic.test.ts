import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSeed } from '../data/seed';
import { setNow } from '../utils/dates';
import { summarizeHours, unloggedSessions } from '../utils/hours';
import { openSlots } from '../utils/slots';
import { buildDigest, deriveReminders, queueDueEmails, queueWeeklyDigests, remindersFor, staffHref } from '../utils/reminders';
import { bookSession, removeStaff, logSession, maybeActivate, setTaskDone, signContract, submitCheckIn, createEngagementScaffold } from '../utils/actions';
import { renderContract } from '../utils/contractText';
import { quickbooksInvoiceRows } from '../utils/quickbooks';
import { AppState } from '../types';

// Wednesday 4 Nov 2026, 10:00 local
const TODAY = '2026-11-04';
let s: AppState;
beforeEach(() => { setNow(new Date(2026, 10, 4, 10, 0)); s = buildSeed(TODAY); });
afterEach(() => setNow(null));

describe('hours', () => {
  it('counts delivered, booked and unbooked hours separately', () => {
    const e = s.engagements.find((x) => x.id === 'e_maria')!;
    const h = summarizeHours(e, s.sessions);
    expect(h.used).toBe(7); // 1.5 kickoff + 5×1 + 0.5 check-in
    expect(h.scheduled).toBe(2); // one confirmed + one requested
    expect(h.unbooked).toBe(11);
    expect(h.remaining).toBe(13);
  });
  it('does not charge a no-show unless hours are logged', () => {
    const e = s.engagements.find((x) => x.id === 'e_maria')!;
    s.sessions.find((x) => x.id === 's_maria_next')!.status = 'no-show';
    expect(summarizeHours(e, s.sessions).used).toBe(7);
    s.sessions.find((x) => x.id === 's_maria_next')!.loggedHours = 1;
    expect(summarizeHours(e, s.sessions).used).toBe(8);
  });
  it('logging a session records hours and creates client action items', () => {
    const e = s.engagements.find((x) => x.id === 'e_maria')!;
    s.sessions.find((x) => x.id === 's_maria_next')!.start = '2026-11-03T09:00'; // now in the past
    expect(unloggedSessions(s, '2026-11-04T10:00').map((x) => x.id)).toEqual(['s_maria_next']);
    const before = s.actions.length;
    logSession(s, 's_maria_next', { hours: 1.25, summary: 'ok', nextFocus: '', privateNotes: 'private', status: 'completed', actions: ['Do a thing', '  ', 'Another'] });
    expect(summarizeHours(e, s.sessions).used).toBe(8.25);
    expect(s.actions.length).toBe(before + 2);
    expect(unloggedSessions(s, '2026-11-04T10:00')).toHaveLength(0);
  });
});

describe('slots', () => {
  const lynne = () => s.staff.find((x) => x.id === 'st_lynne')!;
  it('only offers times inside availability that fit the whole session', () => {
    const slots = openSlots(lynne(), s.sessions, 120, s.settings, new Date(2026, 10, 4, 10, 0));
    expect(slots.length).toBeGreaterThan(0);
    for (const sl of slots) {
      const day = new Date(sl.start).getDay();
      const block = lynne().availability.find((b) => b.day === day && sl.start.slice(11) >= b.start);
      expect(block).toBeTruthy();
      const endMin = Number(sl.start.slice(11, 13)) * 60 + Number(sl.start.slice(14)) + 120;
      expect(endMin).toBeLessThanOrEqual(Number(block!.end.slice(0, 2)) * 60 + Number(block!.end.slice(3)));
    }
  });
  it('respects minimum notice and existing bookings', () => {
    const first = openSlots(lynne(), s.sessions, 60, s.settings, new Date(2026, 10, 4, 10, 0));
    expect(first.every((x) => x.start >= '2026-11-05T10:00')).toBe(true);
    const target = first[0];
    bookSession(s, { engagementId: 'e_maria', coachId: 'st_lynne', type: 'Coaching Session', mode: 'Zoom', start: target.start, durationMin: 60, requestedBy: 'coach' });
    const after = openSlots(lynne(), s.sessions, 60, s.settings, new Date(2026, 10, 4, 10, 0));
    expect(after.find((x) => x.start === target.start)).toBeUndefined();
    // a half-hour overlap is also blocked
    expect(after.find((x) => x.start === target.start.replace(/:00$/, ':30'))).toBeUndefined();
  });
  it('client bookings become requests when approval is required', () => {
    const r = bookSession(s, { engagementId: 'e_maria', coachId: 'st_lynne', type: 'Coaching Session', mode: 'Zoom', start: '2026-11-12T09:00', durationMin: 60, requestedBy: 'client' });
    expect(r.status).toBe('requested');
    s.settings.requireApproval = false;
    expect(bookSession(s, { engagementId: 'e_maria', coachId: 'st_lynne', type: 'Coaching Session', mode: 'Zoom', start: '2026-11-12T10:00', durationMin: 60, requestedBy: 'client' }).status).toBe('scheduled');
  });
});

describe('reminders', () => {
  it('flags an unsigned contract and queues the email once', () => {
    const all = deriveReminders(s);
    const mine = remindersFor(all, { role: 'client', id: 'c_david' });
    expect(mine.find((r) => r.kind === 'contract-reminder')?.severity).toBe('urgent');
    const first = queueDueEmails(s, all);
    expect(first).toBeGreaterThan(0);
    expect(queueDueEmails(s, deriveReminders(s))).toBe(0); // deduped
    expect(s.outbox.every((o) => o.status === 'queued')).toBe(true);
  });
  it('asks for the weekly check-in once it has opened, and stops after it is submitted', () => {
    const has = () => remindersFor(deriveReminders(s), { role: 'client', id: 'c_maria' }).some((r) => r.kind === 'checkin-reminder');
    expect(has()).toBe(true);
    submitCheckIn(s, { engagementId: 'e_maria', clientId: 'c_maria', energy: 4, progress: 4, wins: 'w', challenges: '', focusNext: '', supportNeeded: '' });
    expect(has()).toBe(false);
  });
  it('does not nag about a check-in before the opening day', () => {
    // Brightpath check-in opens Friday; today is Wednesday
    const r = remindersFor(deriveReminders(s), { role: 'client', id: 'c_luis' });
    expect(r.some((x) => x.kind === 'checkin-reminder')).toBe(false);
  });
  it('reminds the coach to log a session that has already happened', () => {
    s.sessions.find((x) => x.id === 's_maria_next')!.start = '2026-11-04T08:00';
    const coach = remindersFor(deriveReminders(s), { role: 'coach', id: 'st_lynne' });
    expect(coach.some((r) => r.kind === 'coach-log')).toBe(true);
  });
  it('shows admin-only alerts only to admins', () => {
    const all = deriveReminders(s);
    expect(remindersFor(all, { role: 'coach', id: 'st_jennifer', isAdmin: false }).every((r) => r.audience.role !== 'admin')).toBe(true);
    expect(remindersFor(all, { role: 'coach', id: 'st_lynne', isAdmin: true }).some((r) => r.audience.role === 'admin')).toBe(true);
  });
  it('routes staff from client-style links to the engagement tab', () => {
    const r = deriveReminders(s).find((x) => x.kind === 'contract-reminder')!;
    expect(staffHref(r)).toBe('/engagements/e_david/contract');
  });
  it('reminders are scoped: a client never sees anyone else\'s', () => {
    const all = deriveReminders(s);
    for (const c of s.clients) expect(remindersFor(all, { role: 'client', id: c.id }).every((r) => r.audience.id === c.id && r.audience.role === 'client')).toBe(true);
  });
});

describe('contracts & onboarding', () => {
  it('only a sent contract can be signed, and signing completes the contract task', () => {
    const e = 'e_david';
    const c = s.contracts.find((x) => x.engagementId === e)!;
    c.status = 'draft';
    signContract(s, c.id, 'c_david', 'David Chen');
    expect(c.status).toBe('draft');
    c.status = 'sent';
    signContract(s, c.id, 'c_david', 'David Chen');
    expect(c.status).toBe('signed');
    expect(s.preTasks.find((t) => t.engagementId === e && t.kind === 'contract')!.done).toBe(true);
  });
  it('activates only when signed, all steps done, and the start date has arrived', () => {
    const e = s.engagements.find((x) => x.id === 'e_david')!;
    s.contracts.find((x) => x.engagementId === 'e_david')!.status = 'signed';
    s.preTasks.filter((t) => t.engagementId === 'e_david').forEach((t) => setTaskDone(s, t.id, true));
    expect(e.status).toBe('Pre-program'); // starts in 8 days
    e.startDate = TODAY;
    maybeActivate(s, 'e_david');
    expect(e.status).toBe('Active');
  });
  it('scaffolds a checklist and draft agreement for a new engagement', () => {
    s.engagements.push({ ...s.engagements[0], id: 'e_new', status: 'Pre-program' });
    createEngagementScaffold(s, 'e_new');
    expect(s.preTasks.filter((t) => t.engagementId === 'e_new').length).toBeGreaterThanOrEqual(4);
    expect(s.contracts.find((c) => c.engagementId === 'e_new')!.status).toBe('draft');
  });
  it('fills every placeholder in the rendered agreement', () => {
    for (const c of s.contracts) {
      const text = renderContract(s, c).map((x) => x.heading + x.text).join('\n');
      expect(text).not.toMatch(/\{\{/);
    }
    const team = renderContract(s, s.contracts.find((c) => c.engagementId === 'e_team')!).map((x) => x.text).join(' ');
    expect(team).toContain('Priya Nair');
    expect(team).toContain('24 hours');
  });
});

describe('weekly digest', () => {
  it('summarises hours, next session and open actions for a client', () => {
    const e = s.engagements.find((x) => x.id === 'e_maria')!;
    const mail = buildDigest(s, e, 'c_maria')!;
    expect(mail.toEmail).toBe('maria@harborview.example');
    expect(mail.body).toContain('7 delivered, 2 booked, 11 still unbooked (of 20)');
    expect(mail.body).toContain('Open action items');
    expect(mail.body).not.toContain('undefined');
  });
  it('queues one digest per active participant per week, never twice', () => {
    const first = queueWeeklyDigests(s);
    expect(first).toBe(5); // Maria + four Brightpath members; David is pre-program, Jordan completed
    expect(queueWeeklyDigests(s)).toBe(0);
  });
});

describe('removing a coach', () => {
  it('needs a replacement while they still have clients, then hands over open work', () => {
    expect(removeStaff(s, 'st_jennifer')).toMatch(/replacement/i);
    expect(removeStaff(s, 'st_jennifer', 'st_jennifer')).toBeTruthy();
    expect(s.staff.some((x) => x.id === 'st_jennifer')).toBe(true);
    const pastBefore = s.sessions.filter((x) => x.coachId === 'st_jennifer' && x.status === 'completed').length;
    expect(pastBefore).toBeGreaterThan(0);
    expect(removeStaff(s, 'st_jennifer', 'st_lynne')).toBeNull();
    expect(s.staff.some((x) => x.id === 'st_jennifer')).toBe(false);
    expect(s.engagements.find((e) => e.id === 'e_team')!.coachId).toBe('st_lynne');
    // upcoming sessions move; delivered ones keep the coach who actually ran them (ledger stays accurate)
    expect(s.sessions.filter((x) => x.id === 's_team_3')[0].coachId).toBe('st_lynne');
    expect(s.sessions.filter((x) => x.id === 's_team_2')[0].coachId).toBe('st_jennifer');
  });
  it('removes a coach with no clients outright, but never the last admin', () => {
    s.engagements.forEach((e) => { if (e.coachId === 'st_jennifer') e.coachId = 'st_lynne'; });
    expect(removeStaff(s, 'st_jennifer')).toBeNull();
    expect(removeStaff(s, 'st_lynne', 'st_jacob')).toBeNull();
    expect(removeStaff(s, 'st_jacob')).toMatch(/last admin/i);
  });
});

describe('quickbooks export', () => {
  it('makes one invoice per engagement with hours and a rate from the signed fee', () => {
    const e = s.engagements.find((x) => x.id === 'e_maria')!;
    const c = s.contracts.find((x) => x.engagementId === e.id)!;
    Object.assign(c, { status: 'signed', fee: 1800, totalHours: 18 });
    const done = s.sessions.filter((x) => x.engagementId === e.id && x.status === 'completed');
    const month = done[0].start.slice(0, 7);
    const sameMonth = done.filter((x) => x.start.startsWith(month));
    const rows = quickbooksInvoiceRows(s, sameMonth, month, new Date(2026, 10, 4));
    expect(rows).toHaveLength(1);
    expect(rows[0][4]).toBe('Net 30');
    expect(rows[0][9]).toBe(100);
    expect(rows[0][8]).toBe(sameMonth.reduce((t, x) => t + (x.loggedHours ?? x.durationMin / 60), 0));
    expect(rows[0][10]).toBe((rows[0][8] as number) * 100);
  });
});
