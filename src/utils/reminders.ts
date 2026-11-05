import { AppState, Engagement, OutboxEmail, Reminder, Role } from '../types';
import { addDays, diffDays, fmtDate, fmtDateTime, getNow, hoursUntil, nowIso, parseDate, todayIso, weekStart } from './dates';
import { summarizeHours, unloggedSessions } from './hours';
import { uid } from './id';

const SEV_ORDER = { urgent: 0, warn: 1, info: 2 } as const;

const firstName = (name: string) => name.split(' ')[0];

/** The date within `today`'s Monday-based week on which this engagement's weekly check-in opens. */
export function checkInOpenDate(checkInDay: number, today = todayIso()): string {
  return addDays(weekStart(today), (checkInDay + 6) % 7);
}

/**
 * Derive every reminder from current state. Nothing here is stored — the same inputs always produce the
 * same list, so reminders can never go stale or get out of sync with the data.
 */
export function deriveReminders(state: AppState, now: Date = getNow()): Reminder[] {
  const out: Reminder[] = [];
  const today = todayIso();
  const nowStr = nowIso();
  const clientName = (id: string) => state.clients.find((c) => c.id === id)?.name ?? 'Client';
  const push = (r: Reminder) => out.push(r);

  for (const e of state.engagements) {
    const live = e.status === 'Pre-program' || e.status === 'Active';
    const primary = e.clientIds[0];
    const contract = state.contracts.find((c) => c.engagementId === e.id && c.status !== 'void');
    const label = e.type === 'Executive Coaching' ? clientName(primary) : e.title;
    const sessions = state.sessions.filter((s) => s.engagementId === e.id);

    // ── Completed: ask for program feedback ──
    if (e.status === 'Completed' && !e.closeout) {
      push({
        key: `closeout:${e.id}`, audience: { role: 'client', id: primary }, kind: 'custom', severity: 'info',
        title: 'Share your program feedback', detail: 'Two minutes to tell us how the program went and what you achieved.',
        engagementId: e.id, href: '#/program',
      });
    }
    if (!live) continue;

    // ── Contract ──
    if (contract?.status === 'sent') {
      const age = contract.sentAt ? diffDays(today, contract.sentAt.slice(0, 10)) : 0;
      const startsSoon = diffDays(e.startDate, today) <= 7;
      push({
        key: `contract:${e.id}`, audience: { role: 'client', id: primary }, kind: 'contract-reminder',
        severity: age >= 3 || startsSoon ? 'urgent' : 'warn',
        title: 'Review and sign your coaching agreement',
        detail: `Your program starts ${parseDate(e.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
        engagementId: e.id, href: '#/contract', email: age >= 2,
      });
      if (age >= 3) {
        push({
          key: `contract-admin:${e.id}`, audience: { role: 'admin', id: '*' }, kind: 'custom', severity: startsSoon ? 'urgent' : 'warn',
          title: `Contract unsigned for ${age} days — ${label}`, detail: 'Follow up with the client before the program starts.',
          engagementId: e.id, href: `#/engagements/${e.id}/contract`,
        });
      }
    }
    if (!contract || contract.status === 'draft') {
      push({
        key: `contract-send:${e.id}`, audience: { role: 'coach', id: e.coachId }, kind: 'custom', severity: 'warn',
        title: `Send the coaching agreement — ${label}`,
        detail: contract ? 'A draft is ready to review and send.' : 'No agreement has been created yet.',
        engagementId: e.id, href: `#/engagements/${e.id}/contract`,
      });
    }

    // ── Pre-program tasks ──
    for (const t of state.preTasks.filter((t) => t.engagementId === e.id && !t.done)) {
      if (t.kind === 'contract') continue; // covered above
      const dueIn = t.dueDate ? diffDays(t.dueDate, today) : null;
      if (t.assignee === 'client') {
        if (dueIn == null || dueIn > 7) continue;
        const target = t.clientId ?? primary;
        push({
          key: `task:${t.id}`, audience: { role: 'client', id: target }, kind: 'task-reminder',
          severity: dueIn < 0 ? 'urgent' : dueIn <= 3 ? 'warn' : 'info',
          title: t.title,
          detail: dueIn < 0 ? `Overdue by ${-dueIn} day${dueIn === -1 ? '' : 's'}.` : dueIn === 0 ? 'Due today.' : `Due in ${dueIn} day${dueIn === 1 ? '' : 's'}.`,
          engagementId: e.id, href: '#/program', due: t.dueDate, email: dueIn <= 2,
        });
      } else if (t.assignee === 'coach' && dueIn != null && dueIn <= 2) {
        push({
          key: `task:${t.id}`, audience: { role: 'coach', id: e.coachId }, kind: 'custom', severity: dueIn < 0 ? 'warn' : 'info',
          title: `${t.title} — ${label}`, detail: dueIn < 0 ? 'Overdue.' : 'Due soon.',
          engagementId: e.id, href: `#/engagements/${e.id}/program`, due: t.dueDate,
        });
      }
    }

    // ── Sessions ──
    for (const s of sessions) {
      if (s.status === 'requested') {
        const urgent = hoursUntil(s.start, now) < 72;
        push({
          key: `request:${s.id}`, audience: { role: 'coach', id: s.coachId }, kind: 'coach-request',
          severity: urgent ? 'urgent' : 'warn', title: `Confirm session request — ${label}`,
          detail: `Requested for ${fmtDateTime(s.start)}.`, engagementId: e.id, href: '#/schedule', due: s.start, email: true,
        });
      }
      if (s.status === 'scheduled' && s.start > nowStr) {
        const h = hoursUntil(s.start, now);
        if (h <= 72) {
          const people = e.clientIds;
          for (const cid of people) {
            push({
              key: `session:${s.id}:${cid}`, audience: { role: 'client', id: cid }, kind: 'session-reminder',
              severity: h <= 24 ? 'warn' : 'info', title: `${s.type} — ${fmtDateTime(s.start)}`,
              detail: `${s.mode}${s.location ? ' · ' + s.location : ''} · ${s.durationMin} min`,
              engagementId: e.id, href: '#/sessions', due: s.start, email: h <= state.settings.sessionReminderHours,
            });
          }
          if (h <= 24) {
            push({
              key: `session-coach:${s.id}`, audience: { role: 'coach', id: s.coachId }, kind: 'custom', severity: 'info',
              title: `Upcoming: ${label} — ${fmtDateTime(s.start)}`, detail: `${s.type} · ${s.mode}`,
              engagementId: e.id, href: `#/engagements/${e.id}/sessions`, due: s.start,
            });
          }
        }
      }
    }

    // ── Weekly check-in ──
    if (e.status === 'Active' && e.startDate <= today) {
      const open = checkInOpenDate(e.checkInDay, today);
      if (today >= open) {
        const wk = weekStart(today);
        for (const cid of e.clientIds) {
          const done = state.checkIns.some((c) => c.engagementId === e.id && c.clientId === cid && c.weekOf === wk);
          if (!done) {
            const late = diffDays(today, open);
            push({
              key: `checkin:${e.id}:${cid}:${wk}`, audience: { role: 'client', id: cid }, kind: 'checkin-reminder',
              severity: late >= 2 ? 'warn' : 'info', title: 'Your weekly check-in is open',
              detail: 'Takes about three minutes — your coach reads every one.', engagementId: e.id, href: '#/checkin',
              email: late >= 1,
            });
          }
        }
      }
    }

    // ── Action items ──
    for (const a of state.actions.filter((a) => a.engagementId === e.id && !a.done && a.due)) {
      const dueIn = diffDays(a.due!, today);
      if (dueIn > 2) continue;
      if (a.owner === 'client') {
        push({
          key: `action:${a.id}`, audience: { role: 'client', id: a.clientId ?? primary }, kind: 'action-reminder',
          severity: dueIn < 0 ? 'warn' : 'info', title: a.text,
          detail: dueIn < 0 ? `Overdue by ${-dueIn} day${dueIn === -1 ? '' : 's'}.` : dueIn === 0 ? 'Due today.' : `Due in ${dueIn} day${dueIn === 1 ? '' : 's'}.`,
          engagementId: e.id, href: '#/actions', due: a.due, email: dueIn <= 0,
        });
      } else {
        push({
          key: `action:${a.id}`, audience: { role: 'coach', id: e.coachId }, kind: 'custom', severity: dueIn < 0 ? 'warn' : 'info',
          title: `${a.text} — ${label}`, detail: dueIn < 0 ? 'Overdue.' : 'Due soon.', engagementId: e.id,
          href: `#/engagements/${e.id}/actions`, due: a.due,
        });
      }
    }

    // ── Hours ──
    const h = summarizeHours(e, state.sessions);
    if (e.status === 'Active' && h.contracted > 0) {
      if (h.used >= h.contracted) {
        push({
          key: `hours-over:${e.id}`, audience: { role: 'admin', id: '*' }, kind: 'custom', severity: 'urgent',
          title: `All contracted hours used — ${label}`, detail: 'Discuss an extension or wrap-up.', engagementId: e.id, href: `#/engagements/${e.id}/sessions`,
        });
      } else if (h.used / h.contracted >= state.settings.lowHoursThreshold) {
        push({
          key: `hours-low:${e.id}`, audience: { role: 'admin', id: '*' }, kind: 'custom', severity: 'warn',
          title: `${Math.round(h.usedPct)}% of hours used — ${label}`, detail: 'Good moment to talk about renewal or next steps.',
          engagementId: e.id, href: `#/engagements/${e.id}/sessions`,
        });
      }
      const left = diffDays(e.endDate, today);
      if (left >= 0 && left <= 30) {
        push({
          key: `ending:${e.id}`, audience: { role: 'admin', id: '*' }, kind: 'custom', severity: 'warn',
          title: `Engagement ends in ${left} day${left === 1 ? '' : 's'} — ${label}`,
          detail: `${Math.round(h.remaining * 10) / 10} contracted hours still unused.`, engagementId: e.id, href: `#/engagements/${e.id}`,
        });
      }
      // No session booked or held recently
      const recent = sessions.some((s) => (s.status === 'completed' && diffDays(today, s.start.slice(0, 10)) <= 21) || ((s.status === 'scheduled' || s.status === 'requested') && s.start >= nowStr));
      if (!recent && h.remaining > 0) {
        push({
          key: `quiet:${e.id}`, audience: { role: 'coach', id: e.coachId }, kind: 'custom', severity: 'warn',
          title: `No session in 3+ weeks — ${label}`, detail: 'Nothing is booked. Reach out to schedule the next session.',
          engagementId: e.id, href: `#/engagements/${e.id}/sessions`,
        });
      }
    }

    // ── Check-ins awaiting a coach reply ──
    const waiting = state.checkIns.filter((c) => c.engagementId === e.id && !c.coachResponse && diffDays(today, c.submittedAt.slice(0, 10)) <= 14);
    for (const c of waiting) {
      push({
        key: `reply:${c.id}`, audience: { role: 'coach', id: e.coachId }, kind: 'coach-checkin', severity: 'info',
        title: `${firstName(clientName(c.clientId))} sent a weekly check-in`, detail: c.supportNeeded ? `Asked for support: "${c.supportNeeded}"` : 'Read it and reply.',
        engagementId: e.id, href: '#/checkins',
      });
    }
  }

  // ── Unlogged sessions (any status of engagement) ──
  for (const s of unloggedSessions(state, nowStr)) {
    const e = state.engagements.find((x) => x.id === s.engagementId);
    if (!e) continue;
    push({
      key: `log:${s.id}`, audience: { role: 'coach', id: s.coachId }, kind: 'coach-log', severity: 'urgent',
      title: `Log hours for ${s.type} — ${e.type === 'Executive Coaching' ? state.clients.find((c) => c.id === e.clientIds[0])?.name : e.title}`,
      detail: `${fmtDateTime(s.start)} has passed. Record hours and a summary so the client sees them.`,
      engagementId: e.id, href: `#/engagements/${e.id}/sessions`, due: s.start, email: true,
    });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.due ?? '9').localeCompare(b.due ?? '9'));
}

export function remindersFor(all: Reminder[], who: { role: Role; id: string; isAdmin?: boolean }): Reminder[] {
  return all.filter((r) => {
    if (who.role === 'client') return r.audience.role === 'client' && r.audience.id === who.id;
    if (r.audience.role === 'coach') return r.audience.id === who.id;
    if (r.audience.role === 'admin') return !!who.isAdmin;
    return false;
  });
}

let portalBase: string | null = null;
/** Server-side jobs have no `window`; they set the public app URL here. */
export const setPortalBase = (url: string | null) => {
  portalBase = url ? url.replace(/\/+$/, '') : null;
};
const portalUrl = (href: string) => (portalBase ?? (typeof window !== 'undefined' ? window.location.origin : '')) + '/' + href;

export function emailFor(state: AppState, r: Reminder): Omit<OutboxEmail, 'id' | 'createdAt' | 'status'> | null {
  const person =
    r.audience.role === 'client'
      ? state.clients.find((c) => c.id === r.audience.id)
      : r.audience.role === 'coach'
        ? state.staff.find((s) => s.id === r.audience.id)
        : undefined;
  if (!person) return null;
  const closing = `\nOpen your portal: ${portalUrl(r.href)}\n\n— ${state.settings.orgName}\n${state.settings.phone} · ${state.settings.supportEmail}`;
  return {
    kind: r.kind,
    toName: person.name,
    toEmail: person.email,
    subject: r.title.length > 90 ? r.title.slice(0, 87) + '…' : r.title,
    body: `Hi ${firstName(person.name)},\n\n${r.title}\n${r.detail}\n${closing}`,
    dedupeKey: r.key,
  };
}

/** Queue emails for every reminder that is due to be sent and hasn't been queued yet. Returns how many were added. */
export function queueDueEmails(d: AppState, all: Reminder[]): number {
  const seen = new Set(d.outbox.map((o) => o.dedupeKey).filter(Boolean));
  let n = 0;
  for (const r of all) {
    if (!r.email || seen.has(r.key)) continue;
    const mail = emailFor(d, r);
    if (!mail) continue;
    d.outbox.unshift({ id: uid('em'), createdAt: nowIso(), status: 'queued', ...mail });
    seen.add(r.key);
    n++;
  }
  return n;
}

export const engagementLabel = (state: AppState, e: Engagement) =>
  e.type === 'Executive Coaching' ? state.clients.find((c) => c.id === e.clientIds[0])?.name ?? e.title : e.title;

/** A plain-text weekly status email for one client. */
export function buildDigest(state: AppState, e: Engagement, clientId: string): Omit<OutboxEmail, 'id' | 'createdAt' | 'status'> | null {
  const c = state.clients.find((x) => x.id === clientId);
  if (!c) return null;
  const h = summarizeHours(e, state.sessions);
  const now = nowIso();
  const next = state.sessions.filter((s) => s.engagementId === e.id && (s.status === 'scheduled' || s.status === 'requested') && s.start >= now).sort((a, b) => a.start.localeCompare(b.start))[0];
  const open = state.actions.filter((a) => a.engagementId === e.id && !a.done && a.owner === 'client' && (!a.clientId || a.clientId === clientId));
  const wk = weekStart(todayIso());
  const checked = state.checkIns.some((x) => x.engagementId === e.id && x.clientId === clientId && x.weekOf === wk);
  const lines = [
    `Hi ${firstName(c.name)},`,
    '',
    `Here's your week at a glance for ${e.title}:`,
    '',
    `• Hours: ${Math.round(h.used * 100) / 100} delivered, ${Math.round(h.scheduled * 100) / 100} booked, ${Math.round(h.unbooked * 100) / 100} still unbooked (of ${h.contracted}).`,
    `• Next session: ${next ? fmtDateTime(next.start) + ' (' + next.type + ')' : 'nothing booked yet — grab a time in your portal.'}`,
    `• Weekly check-in: ${checked ? 'received, thank you!' : 'not submitted yet — it takes about three minutes.'}`,
    open.length ? `• Open action items (${open.length}):` : '• No open action items.',
    ...open.slice(0, 5).map((a) => `    – ${a.text}${a.due ? ' (due ' + a.due + ')' : ''}`),
    '',
    `Open your portal: ${portalUrl('#/home')}`,
    '',
    `— ${state.settings.orgName}`,
  ];
  return { kind: 'weekly-digest', toName: c.name, toEmail: c.email, subject: `Your L2L week at a glance — ${fmtDate(wk)}`, body: lines.join('\n'), dedupeKey: `digest:${e.id}:${clientId}:${wk}` };
}

export function queueWeeklyDigests(d: AppState): number {
  const seen = new Set(d.outbox.map((o) => o.dedupeKey).filter(Boolean));
  let n = 0;
  for (const e of d.engagements.filter((x) => x.status === 'Active')) {
    for (const cid of e.clientIds) {
      const mail = buildDigest(d, e, cid);
      if (!mail || seen.has(mail.dedupeKey)) continue;
      d.outbox.unshift({ id: uid('em'), createdAt: nowIso(), status: 'queued', ...mail });
      n++;
    }
  }
  return n;
}

const CLIENT_ROUTE_TO_TAB: Record<string, string> = {
  '#/contract': 'contract', '#/program': 'program', '#/checkin': 'checkins', '#/actions': 'actions', '#/sessions': 'sessions', '#/messages': 'messages', '#/home': '',
};

/** Client-facing reminders link into the client portal; staff should land on the matching engagement tab instead. */
export function staffHref(r: Reminder): string {
  if (r.audience.role !== 'client') return r.href;
  const tab = CLIENT_ROUTE_TO_TAB[r.href];
  return tab == null ? r.href : `/engagements/${r.engagementId}${tab ? '/' + tab : ''}`;
}
