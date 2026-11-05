import type { AppState, Client, Staff } from '../src/types';
import type { SessionUser } from './types';

const publicStaff = (s: Staff): Staff => ({
  id: s.id, name: s.name, title: s.title, role: s.role, credentials: s.credentials, bio: s.bio,
  timezone: s.timezone, availability: s.availability, email: '',
});

/**
 * The slice of the data a person may see. Enforced here, on the server, so a modified browser can't ask for more.
 *  - admin: everything
 *  - coach: the whole people directory (to set up engagements) but only their own engagements' records
 *  - client: only their own engagements, with private coach notes and other people's check-ins removed
 */
const noSecrets = <T extends { accessCode?: string }>(p: T): T => {
  const { accessCode: _demoOnly, ...rest } = p;
  return rest as T;
};

export function sliceFor(raw: AppState, user: SessionUser): AppState {
  // Defence in depth: a demo-only passcode field must never reach a browser even if one slipped into stored data
  const full: AppState = { ...raw, staff: raw.staff.map(noSecrets), clients: raw.clients.map(noSecrets) };
  if (user.role === 'admin') return full;

  if (user.role === 'coach') {
    const mine = full.engagements.filter((e) => e.coachId === user.id);
    const ids = new Set(mine.map((e) => e.id));
    const myEmails = new Set<string>([full.staff.find((s) => s.id === user.id)?.email ?? '']);
    for (const e of mine) for (const cid of e.clientIds) { const c = full.clients.find((x) => x.id === cid); if (c) myEmails.add(c.email); }
    const inMine = <T extends { engagementId: string }>(rows: T[]) => rows.filter((r) => ids.has(r.engagementId));
    return {
      ...full,
      engagements: mine,
      preTasks: inMine(full.preTasks), contracts: inMine(full.contracts), sessions: inMine(full.sessions),
      checkIns: inMine(full.checkIns), actions: inMine(full.actions), messages: inMine(full.messages),
      outbox: full.outbox.filter((o) => myEmails.has(o.toEmail)),
    };
  }

  // client
  const mine = full.engagements.filter((e) => e.clientIds.includes(user.id));
  const ids = new Set(mine.map((e) => e.id));
  const inMine = <T extends { engagementId: string }>(rows: T[]) => rows.filter((r) => ids.has(r.engagementId));
  // Always include yourself (a new client with no program yet still needs their own record)
  const mates = new Set([user.id, ...mine.flatMap((e) => e.clientIds)]);
  const clients: Client[] = full.clients
    .filter((c) => mates.has(c.id))
    .map((c) => (c.id === user.id ? { ...c } : { id: c.id, name: c.name, title: c.title, orgId: c.orgId, email: '' }));
  const staffIds = new Set(mine.map((e) => e.coachId));
  return {
    version: full.version,
    settings: full.settings,
    resources: full.resources,
    staff: full.staff.filter((s) => staffIds.has(s.id)).map(publicStaff),
    clients,
    orgs: full.orgs.filter((o) => mine.some((e) => e.orgId === o.id) || clients.some((c) => c.orgId === o.id)),
    engagements: mine,
    preTasks: inMine(full.preTasks).filter((t) => t.assignee === 'client' && (!t.clientId || t.clientId === user.id)),
    contracts: inMine(full.contracts).filter((c) => c.status !== 'void'),
    sessions: inMine(full.sessions).map(({ privateNotes: _private, ...s }) => s),
    checkIns: inMine(full.checkIns).filter((c) => c.clientId === user.id),
    actions: inMine(full.actions).filter((a) => a.owner === 'coach' || !a.clientId || a.clientId === user.id),
    messages: inMine(full.messages),
    outbox: [],
  };
}
