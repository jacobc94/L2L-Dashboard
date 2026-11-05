import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSeed, STATE_VERSION } from '../src/data/seed';
import type { AppState } from '../src/types';
import { diffState } from '../src/utils/diff';
import { setBusinessTimezone, setNow } from '../src/utils/dates';
import * as act from '../src/utils/actions';
import { hashSecret } from './crypto';
import { loadFullState } from './db';
import { FakeR2 } from './fakeR2';
import { handle } from './routes';
import type { Env, UsersFile } from './types';

const PASS = 'correct horse battery';
const ORIGIN = 'https://portal.test';

let bucket: FakeR2;
let env: Env;

// Wednesday 4 Nov 2026, 10:00 in Los Angeles (PST, UTC-8)
const NOW = new Date('2026-11-04T18:00:00Z');

async function seedBucket(state: AppState) {
  // Real accounts never carry the demo-only passcode field
  const bare = <T extends { accessCode?: string }>(p: T) => { const { accessCode: _a, ...rest } = p; return rest; };
  await bucket.put('directory.json', JSON.stringify({ settings: state.settings, staff: state.staff.map(bare), orgs: state.orgs, clients: state.clients.map(bare), resources: state.resources }));
  for (const e of state.engagements) {
    const f = {
      engagement: e, preTasks: state.preTasks.filter((x) => x.engagementId === e.id), contracts: state.contracts.filter((x) => x.engagementId === e.id),
      sessions: state.sessions.filter((x) => x.engagementId === e.id), checkIns: state.checkIns.filter((x) => x.engagementId === e.id),
      actions: state.actions.filter((x) => x.engagementId === e.id), messages: state.messages.filter((x) => x.engagementId === e.id),
    };
    await bucket.put(`engagements/${e.id}.json`, JSON.stringify(f));
  }
  await bucket.put('outbox.json', JSON.stringify(state.outbox));
  const pw = await hashSecret(PASS);
  const users: UsersFile = {};
  for (const s of state.staff) users[s.id] = { id: s.id, role: s.role, email: s.email, ...pw, sv: 1, createdAt: 'x' };
  for (const c of state.clients) users[c.id] = { id: c.id, role: 'client', email: c.email, ...pw, sv: 1, createdAt: 'x' };
  await bucket.put('users.json', JSON.stringify(users));
}

class Session {
  cookie = '';
  constructor(public email = '') {}
  async call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; csrf?: boolean } = {}) {
    const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (this.cookie) headers.Cookie = this.cookie;
    if (method === 'POST' && init.csrf !== false) headers['X-Requested-With'] = 'l2l';
    const res = await handle(new Request(ORIGIN + '/api/' + path, { method, headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined }), env);
    const set = res.headers.get('Set-Cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  }
  login = (email: string, passcode = PASS) => this.call('auth/login', { body: { email, passcode } });
  state = async () => (await this.call('state')).json?.state as AppState;
  /** Apply an edit the way the browser does: mutate a local copy and send the record-level diff */
  async edit(fn: (d: AppState) => void) {
    const before = await this.state();
    const after = structuredClone(before);
    fn(after);
    return this.call('mutate', { body: { changes: diffState(before, after) } });
  }
}

async function as(email: string) {
  const s = new Session(email);
  const r = await s.login(email);
  expect(r.status, `login ${email}`).toBe(200);
  return s;
}

const ADMIN = 'lynne@l2l.example';
const COACH = 'jennifer@l2l.example';
const MARIA = 'maria@harborview.example';
const PRIYA = 'priya@brightpath.example';
const TOM = 'tom@brightpath.example';
const DAVID = 'david@summitridge.example';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  setNow(null);
  setBusinessTimezone('America/Los_Angeles');
  bucket = new FakeR2();
  env = { L2L_BUCKET: bucket, SESSION_SECRET: 'x'.repeat(40), BOOTSTRAP_KEY: 'setup-key-123', APP_URL: ORIGIN, CRON_SECRET: 'cron-secret-xyz' };
  await seedBucket(buildSeed('2026-11-04'));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('setup & sign-in', () => {
  it('bootstraps the first admin once, only with the setup key', async () => {
    const fresh = new FakeR2();
    env.L2L_BUCKET = fresh;
    const s = new Session();
    expect((await s.call('auth/status')).json.needsBootstrap).toBe(true);
    const body = { name: 'Pat Admin', email: 'pat@l2l.example', passcode: 'a-long-passcode-1' };
    expect((await s.call('auth/bootstrap', { body: { ...body, key: 'wrong' } })).status).toBe(403);
    expect((await s.call('auth/bootstrap', { body: { ...body, key: 'setup-key-123', passcode: 'short' } })).status).toBe(400);
    const ok = await s.call('auth/bootstrap', { body: { ...body, key: 'setup-key-123' } });
    expect(ok.status).toBe(200);
    expect((await s.call('state')).json.state.staff.map((x: any) => x.name)).toEqual(['Pat Admin']);
    expect((await new Session().call('auth/bootstrap', { body: { ...body, email: 'x@y.example', key: 'setup-key-123' } })).status).toBe(409);
    // the stored credential is a hash, never the passcode
    expect(fresh.files.get('users.json')!.text).not.toContain('a-long-passcode-1');
  });

  it('logs in with the right passcode and gives the same generic error for a wrong passcode or unknown email', async () => {
    const a = await new Session().login(MARIA, 'wrong-wrong-wrong');
    const b = await new Session().login('nobody@nowhere.example', PASS);
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json.error).toBe(b.json.error);
    expect((await new Session().login(MARIA)).status).toBe(200);
  });

  it('locks an account after repeated failures, even for the right passcode', async () => {
    const s = new Session();
    for (let i = 0; i < 5; i++) await s.login(MARIA, 'nope-nope-nope-' + i);
    const locked = await s.login(MARIA);
    expect(locked.status).toBe(429);
  });

  it('rejects state-changing requests without the anti-CSRF header, and forged or tampered cookies', async () => {
    const s = await as(MARIA);
    expect((await s.call('mutate', { body: { changes: [] }, csrf: false })).status).toBe(403);
    const bad = new Session();
    bad.cookie = s.cookie.slice(0, -3) + 'abc';
    expect((await bad.call('state')).status).toBe(401);
    const other = new Session();
    other.cookie = 'l2l_session=' + btoa(JSON.stringify({ u: 'st_lynne', sv: 1, exp: 9999999999 })).replace(/=+$/, '') + '.AAAA';
    expect((await other.call('state')).status).toBe(401);
    expect((await new Session().call('state')).status).toBe(401);
  });

  it('invite flow: admin invites, person sets their own passcode once, code is single-use', async () => {
    const admin = await as(ADMIN);
    await admin.edit((d) => d.clients.push({ id: 'c_new', name: 'Nia New', title: 'CEO', orgId: 'o_harbor', email: 'nia@harborview.example' }));
    const inv = await admin.call('auth/invite', { body: { userId: 'c_new' } });
    expect(inv.status).toBe(200);
    expect(inv.json.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const nia = new Session();
    expect((await nia.login('nia@harborview.example')).status).toBe(401); // no passcode yet
    expect((await nia.call('auth/join', { body: { email: 'nia@harborview.example', code: 'AAAAA-AAAAA', passcode: 'a-fine-passcode' } })).status).toBe(401);
    expect((await nia.call('auth/join', { body: { email: 'nia@harborview.example', code: inv.json.code, passcode: 'short' } })).status).toBe(400);
    const ok = await nia.call('auth/join', { body: { email: 'nia@harborview.example', code: inv.json.code.toLowerCase(), passcode: 'a-fine-passcode' } });
    expect(ok.status).toBe(200);
    expect((await nia.state()).clients.find((c) => c.id === 'c_new')?.name).toBe('Nia New');
    expect((await new Session().call('auth/join', { body: { email: 'nia@harborview.example', code: inv.json.code, passcode: 'another-passcode' } })).status).toBe(401);
    expect((await new Session().login('nia@harborview.example', 'a-fine-passcode')).status).toBe(200);
  });

  it('invite codes expire after 7 days; only admins can create them', async () => {
    const admin = await as(ADMIN);
    expect((await (await as(COACH)).call('auth/invite', { body: { userId: 'c_maria' } })).status).toBe(403);
    const inv = await admin.call('auth/invite', { body: { userId: 'c_maria' } });
    vi.setSystemTime(new Date(NOW.getTime() + 8 * 86400_000));
    expect((await new Session().call('auth/join', { body: { email: MARIA, code: inv.json.code, passcode: 'a-fine-passcode' } })).status).toBe(401);
  });

  it('changing a passcode signs out other sessions', async () => {
    const a = await as(MARIA);
    const b = await as(MARIA);
    expect((await a.call('auth/change-passcode', { body: { current: 'wrong-wrong', next: 'a-brand-new-passcode' } })).status).toBe(401);
    expect((await a.call('auth/change-passcode', { body: { current: PASS, next: 'a-brand-new-passcode' } })).status).toBe(200);
    expect((await b.call('state')).status).toBe(401);
    expect((await a.call('state')).status).toBe(200);
  });
});

describe('who can see what', () => {
  it('admin sees everything', async () => {
    const st = await (await as(ADMIN)).state();
    expect(st.engagements).toHaveLength(4);
    expect(st.staff.length).toBeGreaterThanOrEqual(3);
  });

  it('a coach sees only their own engagements and their records', async () => {
    const st = await (await as(COACH)).state();
    expect(st.engagements.map((e) => e.id)).toEqual(['e_team']);
    expect(st.sessions.every((s) => s.engagementId === 'e_team')).toBe(true);
    expect(st.messages.every((m) => m.engagementId === 'e_team')).toBe(true);
    expect(st.outbox.every((o) => o.toEmail.endsWith('brightpath.example') || o.toEmail === COACH)).toBe(true);
  });

  it('a client sees only their own program, never private notes, passcodes or other people\'s data', async () => {
    const st = await (await as(MARIA)).state();
    expect(st.engagements.map((e) => e.id)).toEqual(['e_maria']);
    expect(st.sessions.length).toBeGreaterThan(0);
    expect(st.sessions.some((s) => 'privateNotes' in s)).toBe(false);
    expect(JSON.stringify(st)).not.toContain('Watch for avoidance pattern');
    expect(st.clients.map((c) => c.id)).toEqual(['c_maria']);
    expect(st.staff.every((s) => s.email === '')).toBe(true);
    expect(st.outbox).toEqual([]);
    expect(JSON.stringify(st)).not.toMatch(/accessCode|"hash"|passcode/i);
    expect(st.contracts.every((c) => c.engagementId === 'e_maria')).toBe(true);
  });

  it('team members don\'t see each other\'s check-ins, private tasks or contact details', async () => {
    const st = await (await as(PRIYA)).state();
    expect(st.checkIns.every((c) => c.clientId === 'c_priya')).toBe(true);
    expect(st.preTasks.every((t) => !t.clientId || t.clientId === 'c_priya')).toBe(true);
    expect(st.clients.find((c) => c.id === 'c_tom')?.email).toBe('');
    expect(st.clients.find((c) => c.id === 'c_priya')?.email).toBe(PRIYA);
  });
});

describe('client writes', () => {
  it('can request a session in an open slot; coach can confirm it', async () => {
    const maria = await as(MARIA);
    const slotRes = await maria.edit((d) => act.bookSession(d, { engagementId: 'e_maria', coachId: 'st_lynne', type: 'Coaching Session', mode: 'Zoom', start: '2026-11-09T09:00', durationMin: 60, requestedBy: 'client' }));
    expect(slotRes.status).toBe(200);
    const s = (await maria.state()).sessions.find((x) => x.start === '2026-11-09T09:00')!;
    expect(s.status).toBe('requested');
    const lynne = await as(ADMIN);
    expect((await lynne.edit((d) => act.setSessionStatus(d, s.id, 'scheduled'))).status).toBe(200);
    expect((await maria.state()).sessions.find((x) => x.id === s.id)!.status).toBe('scheduled');
  });

  it('cannot book outside availability, inside the notice window, over another booking, or with a different coach', async () => {
    const maria = await as(MARIA);
    const book = (start: string, coachId = 'st_lynne') => maria.edit((d) => act.bookSession(d, { engagementId: 'e_maria', coachId, type: 'Coaching Session', mode: 'Zoom', start, durationMin: 60, requestedBy: 'client' }));
    expect((await book('2026-11-08T03:00')).status).toBe(403); // Sunday 3am
    expect((await book('2026-11-05T09:00')).status).toBe(403); // under 24h notice
    expect((await book('2026-11-09T09:00', 'st_jennifer')).status).toBe(403);
    expect((await book('2026-11-09T09:00')).status).toBe(200);
    // someone else (a different client of the same coach) can't take the same slot
    const david = await as(DAVID);
    const clash = await david.edit((d) => act.bookSession(d, { engagementId: 'e_david', coachId: 'st_lynne', type: 'Consultation', mode: 'Zoom', start: '2026-11-09T09:30', durationMin: 30, requestedBy: 'client' }));
    expect(clash.status).toBe(403);
  });

  it('cannot log hours, write summaries, or edit coach-only fields on a session', async () => {
    const maria = await as(MARIA);
    const r = await maria.edit((d) => { const s = d.sessions.find((x) => x.id === 's_maria_next')!; s.loggedHours = 0; s.status = 'completed'; });
    expect(r.status).toBe(403);
    expect((await maria.edit((d) => { d.sessions.find((x) => x.id === 's_maria_next')!.summary = 'hax'; })).status).toBe(403);
    expect((await maria.edit((d) => { d.sessions.find((x) => x.id === 's_maria_7')!.privateNotes = 'x'; })).status).toBe(403);
    expect((await maria.edit((d) => { d.sessions.find((x) => x.id === 's_maria_next')!.durationMin = 5; })).status).toBe(403);
  });

  it('can cancel their own upcoming session and rate a completed one, but not rate an unfinished one', async () => {
    const maria = await as(MARIA);
    expect((await maria.edit((d) => act.rateSession(d, 's_maria_next', 5, 'great'))).status).toBe(403);
    expect((await maria.edit((d) => act.rateSession(d, 's_maria_7', 4, 'solid'))).status).toBe(200);
    expect((await maria.edit((d) => act.setSessionStatus(d, 's_maria_next', 'cancelled', 'conflict'))).status).toBe(200);
  });

  it('cannot touch other engagements, tasks, or contracts they don\'t own', async () => {
    const maria = await as(MARIA);
    const st = await maria.state();
    expect(st.engagements.find((e) => e.id === 'e_team')).toBeUndefined();
    // Forge records for another engagement by hand
    const forged = { c: 'messages', op: 'upsert', record: { id: 'm_forged', engagementId: 'e_team', fromRole: 'client', fromId: 'c_maria', fromName: 'Maria', text: 'hi', at: 'x', readBy: [] } };
    expect((await maria.call('mutate', { body: { changes: [forged] } })).status).toBe(403);
    expect((await maria.call('mutate', { body: { changes: [{ c: 'clients', op: 'upsert', record: { id: 'c_maria', name: 'Hacker', title: '', orgId: 'o_harbor', email: 'h@h.example' } }] } })).status).toBe(403);
    expect((await maria.call('mutate', { body: { changes: [{ c: 'settings', op: 'upsert', record: {} }] } })).status).toBe(403);
    expect((await maria.call('mutate', { body: { changes: [{ c: 'staff', op: 'delete', id: 'st_lynne' }] } })).status).toBe(403);
    expect((await maria.edit((d) => { d.engagements[0].contractedHours = 999; })).status).toBe(403);
    expect((await maria.edit((d) => { d.engagements[0].coachId = 'st_jacob'; })).status).toBe(403);
  });

  it('signs the agreement only as the primary contact, with their exact name, and the server stamps the time', async () => {
    const david = await as(DAVID);
    const sign = (name: string) => david.edit((d) => act.signContract(d, 'ct_david', 'c_david', name));
    expect((await sign('David Chan')).status).toBe(403);
    expect((await david.edit((d) => { const c = d.contracts[0]; c.status = 'signed'; c.signedByName = 'David Chen'; c.signedByClientId = 'c_david'; c.signedAt = '2000-01-01T00:00'; c.fee = 1; })).status).toBe(403);
    expect((await sign('david chen')).status).toBe(200);
    const c = (await david.state()).contracts[0];
    expect(c.status).toBe('signed');
    expect(c.signedAt).toBe('2026-11-04T10:00'); // server time in LA, not whatever the browser sent
    expect((await david.edit((d) => { d.contracts[0].additionalTerms = 'changed'; })).status).toBe(403);
    // only the team's primary contact signs for the team
    const file = JSON.parse(bucket.files.get('engagements/e_team.json')!.text);
    file.contracts[0] = { ...file.contracts[0], status: 'sent', signedAt: undefined, signedByName: undefined, signedByClientId: undefined };
    await bucket.put('engagements/e_team.json', JSON.stringify(file));
    const tom = await as(TOM);
    expect((await tom.edit((d) => act.signContract(d, 'ct_team', 'c_tom', 'Tom Becker'))).status).toBe(403);
    expect((await (await as(PRIYA)).edit((d) => act.signContract(d, 'ct_team', 'c_priya', 'Priya Nair'))).status).toBe(200);
  });

  it('submits a weekly check-in for this week only, as themselves', async () => {
    const maria = await as(MARIA);
    const ci = { engagementId: 'e_maria', clientId: 'c_maria', energy: 4, progress: 4, wins: 'w', challenges: '', focusNext: '', supportNeeded: '' };
    expect((await maria.edit((d) => act.submitCheckIn(d, ci))).status).toBe(200);
    expect((await maria.state()).checkIns.some((c) => c.weekOf === '2026-11-02' && c.wins === 'w')).toBe(true);
    expect((await maria.edit((d) => { d.checkIns.push({ id: 'ci_old', ...ci, weekOf: '2026-10-05', submittedAt: 'x' }); })).status).toBe(403);
    expect((await maria.edit((d) => { d.checkIns.push({ id: 'ci_other', ...ci, clientId: 'c_priya', weekOf: '2026-11-02', submittedAt: 'x' }); })).status).toBe(403);
    expect((await maria.edit((d) => { d.checkIns.find((c) => c.coachResponse)!.coachResponse = 'forged'; })).status).toBe(403);
    expect((await maria.edit((d) => { d.checkIns.push({ id: 'ci_bad', ...ci, energy: 99, weekOf: '2026-11-02', submittedAt: 'x' }); })).status).toBe(403);
  });

  it('messages are always sent as themselves with a server timestamp', async () => {
    const maria = await as(MARIA);
    expect((await maria.edit((d) => act.sendMessage(d, { engagementId: 'e_maria', fromRole: 'client', fromId: 'c_maria', fromName: 'The CEO', text: 'hello' }))).status).toBe(200);
    const m = (await maria.state()).messages.find((x) => x.text === 'hello')!;
    expect(m.fromName).toBe('Maria Alvarez');
    expect(m.at).toBe('2026-11-04T10:00');
    expect((await maria.edit((d) => act.sendMessage(d, { engagementId: 'e_maria', fromRole: 'coach', fromId: 'st_lynne', fromName: 'x', text: 'impersonate' }))).status).toBe(403);
    expect((await maria.edit((d) => { d.messages[0].text = 'rewrite history'; })).status).toBe(403);
    expect((await maria.edit((d) => act.markThreadRead(d, 'e_maria', 'c_maria'))).status).toBe(200);
  });

  it('can tick their own steps and action items, but not coach steps or the contract step before signing', async () => {
    const maria = await as(MARIA);
    const david = await as(DAVID);
    expect((await david.edit((d) => act.setTaskDone(d, d.preTasks.find((t) => t.kind === 'contract')!.id, true))).status).toBe(403);
    expect((await david.edit((d) => act.setTaskDone(d, d.preTasks.find((t) => t.kind === 'assessment')!.id, true))).status).toBe(200);
    expect((await maria.edit((d) => act.toggleAction(d, d.actions.find((a) => a.owner === 'client')!.id))).status).toBe(200);
    expect((await maria.edit((d) => act.toggleAction(d, d.actions.find((a) => a.owner === 'coach')!.id))).status).toBe(403);
  });

  it('can add an action item for themselves only', async () => {
    const maria = await as(MARIA);
    expect((await maria.edit((d) => act.addAction(d, { engagementId: 'e_maria', text: 'Mine', owner: 'client', clientId: 'c_maria' }))).status).toBe(200);
    expect((await maria.edit((d) => act.addAction(d, { engagementId: 'e_maria', text: 'For coach', owner: 'coach' }))).status).toBe(403);
  });

  it('can submit program feedback exactly once, only after completion', async () => {
    const jordan = await as('jordan@harborview.example');
    const fb = { clientId: 'c_jordan', overall: 5, goalsMet: 4, wouldRecommend: 9, highlight: 'x', improve: '', testimonialOk: false };
    expect((await jordan.edit((d) => act.submitCloseout(d, 'e_jordan', fb))).status).toBe(200);
    expect((await jordan.edit((d) => act.submitCloseout(d, 'e_jordan', { ...fb, overall: 1 }))).status).toBe(403);
    expect((await (await as(MARIA)).edit((d) => act.submitCloseout(d, 'e_maria', { ...fb, clientId: 'c_maria' }))).status).toBe(403);
  });

  it('activates a pre-program engagement on the server once signed and all steps are done', async () => {
    const lynne = await as(ADMIN);
    await lynne.edit((d) => { d.engagements.find((e) => e.id === 'e_david')!.startDate = '2026-11-04'; d.preTasks.filter((t) => t.engagementId === 'e_david' && t.assignee === 'coach').forEach((t) => (t.done = true)); });
    const david = await as(DAVID);
    await david.edit((d) => d.preTasks.filter((t) => t.kind !== 'contract').forEach((t) => (t.done = true)));
    expect((await david.state()).engagements[0].status).toBe('Pre-program');
    await david.edit((d) => act.signContract(d, 'ct_david', 'c_david', 'David Chen'));
    await david.edit((d) => act.setTaskDone(d, d.preTasks.find((t) => t.kind === 'contract')!.id, true));
    expect((await david.state()).engagements[0].status).toBe('Active');
  });
});

describe('staff writes', () => {
  it('a coach can log their own session but not another coach\'s, and cannot reassign clients', async () => {
    const jen = await as(COACH);
    expect((await jen.edit((d) => { const s = d.sessions.find((x) => x.id === 's_team_3')!; act.logSession(d, s.id, { hours: 3, summary: 'ok', nextFocus: '', privateNotes: 'p', status: 'completed', actions: [] }); })).status).toBe(200);
    expect((await jen.edit((d) => { d.engagements[0].coachId = 'st_jacob'; })).status).toBe(403);
    // Forging a change to Maria's engagement fails
    const lynneState = await (await as(ADMIN)).state();
    const forged = { c: 'sessions', op: 'upsert', record: { ...lynneState.sessions.find((s) => s.id === 's_maria_next')!, privateNotes: 'x' } };
    expect((await jen.call('mutate', { body: { changes: [forged] } })).status).toBe(403);
  });

  it('staff cannot sign for a client, rate sessions as a client, or edit signed agreements', async () => {
    const lynne = await as(ADMIN);
    expect((await lynne.edit((d) => { const c = d.contracts.find((x) => x.id === 'ct_david')!; c.status = 'signed'; c.signedByName = 'David Chen'; })).status).toBe(403);
    expect((await lynne.edit((d) => { d.sessions.find((x) => x.id === 's_maria_7')!.clientRating = 5; })).status).toBe(403);
    expect((await lynne.edit((d) => { d.contracts.find((x) => x.id === 'ct_maria')!.fee = 1; })).status).toBe(403);
  });

  it('a coach can update only their own availability', async () => {
    const jen = await as(COACH);
    expect((await jen.edit((d) => { d.staff.find((s) => s.id === 'st_jennifer')!.availability.push({ day: 1, start: '09:00', end: '10:00' }); })).status).toBe(200);
    expect((await jen.edit((d) => { d.staff.find((s) => s.id === 'st_lynne')!.availability = []; })).status).toBe(403);
    expect((await jen.edit((d) => { d.staff.find((s) => s.id === 'st_jennifer')!.role = 'admin'; })).status).toBe(403);
    expect((await jen.edit((d) => { d.staff.find((s) => s.id === 'st_jennifer')!.availability.push({ day: 1, start: '11:00', end: '10:00' }); })).status).toBe(403);
  });

  it('admin creates people (credentials are provisioned server-side) and engagements with their checklist and draft contract', async () => {
    const lynne = await as(ADMIN);
    const r = await lynne.edit((d) => {
      d.clients.push({ id: 'c_zed', name: 'Zed Zane', title: 'CTO', orgId: 'o_summit', email: 'zed@summitridge.example' });
      d.engagements.push({ id: 'e_zed', title: 'Executive Coaching — Zed Zane', type: 'Executive Coaching', orgId: 'o_summit', clientIds: ['c_zed'], coachId: 'st_jennifer', status: 'Pre-program', phase: 'Identify', startDate: '2026-12-01', endDate: '2027-06-01', contractedHours: 12, goals: [], checkInDay: 1 });
      act.createEngagementScaffold(d, 'e_zed');
    });
    expect(r.status).toBe(200);
    const st = await lynne.state();
    expect(st.preTasks.filter((t) => t.engagementId === 'e_zed').length).toBeGreaterThanOrEqual(4);
    expect(st.contracts.find((c) => c.engagementId === 'e_zed')!.status).toBe('draft');
    expect(JSON.parse(bucket.files.get('users.json')!.text).c_zed).toMatchObject({ role: 'client', email: 'zed@summitridge.example' });
    // the new person can't sign in until invited, and the coach sees the engagement
    expect((await new Session().login('zed@summitridge.example')).status).toBe(401);
    expect((await (await as(COACH)).state()).engagements.map((e) => e.id)).toContain('e_zed');
    // duplicate emails are refused
    expect((await lynne.edit((d) => d.clients.push({ id: 'c_dup', name: 'Dup', title: '', orgId: 'o_summit', email: 'ZED@summitridge.example' }))).status).toBe(403);
  });

  it('removing a coach requires handing over their clients first; their login stops working', async () => {
    const lynne = await as(ADMIN);
    expect((await lynne.edit((d) => { d.staff = d.staff.filter((s) => s.id !== 'st_jennifer'); })).status).toBe(403);
    const jen = await as(COACH);
    expect((await lynne.edit((d) => { act.removeStaff(d, 'st_jennifer', 'st_lynne'); })).status).toBe(200);
    expect((await jen.call('state')).status).toBe(401);
    expect((await new Session().login(COACH)).status).toBe(401);
    expect((await lynne.state()).engagements.find((e) => e.id === 'e_team')!.coachId).toBe('st_lynne');
  });

  it('refuses to remove yourself or the last admin, or to demote yourself', async () => {
    const lynne = await as(ADMIN);
    expect((await lynne.call('mutate', { body: { changes: [{ c: 'staff', op: 'delete', id: 'st_lynne' }] } })).status).toBe(403);
    expect((await lynne.edit((d) => { d.staff.find((s) => s.id === 'st_lynne')!.role = 'coach'; })).status).toBe(403);
  });

  it('promoting a coach to admin takes effect on their next request', async () => {
    const jen = await as(COACH);
    expect((await jen.state()).engagements).toHaveLength(1);
    await (await as(ADMIN)).edit((d) => { d.staff.find((s) => s.id === 'st_jennifer')!.role = 'admin'; });
    expect((await jen.call('state')).status).toBe(401); // old session invalidated; sign in again for the new role
    expect((await (await as(COACH)).state()).engagements).toHaveLength(4);
  });

  it('settings and resources are admin-only, and links must be http(s)', async () => {
    const lynne = await as(ADMIN);
    expect((await lynne.edit((d) => { d.settings.bookingWindowDays = 14; })).status).toBe(200);
    expect((await lynne.edit((d) => { d.settings.bookingWindowDays = -3; })).status).toBe(403);
    expect((await lynne.edit((d) => d.resources.push({ id: 'r_x', title: 'x', description: '', category: 'Worksheet', url: 'javascript:alert(1)' }))).status).toBe(403);
    expect((await (await as(COACH)).edit((d) => { d.settings.bookingWindowDays = 99; })).status).toBe(403);
  });
});

describe('concurrency', () => {
  it('two people changing different records in the same engagement both succeed', async () => {
    const lynne = await as(ADMIN);
    const maria = await as(MARIA);
    // Maria's write lands between Lynne's read and write of the same file
    bucket.beforePut = (key) => {
      if (key !== 'engagements/e_maria.json') return;
      const f = JSON.parse(bucket.files.get(key)!.text);
      f.messages.push({ id: 'm_race', engagementId: 'e_maria', fromRole: 'client', fromId: 'c_maria', fromName: 'Maria Alvarez', text: 'racing', at: 'x', readBy: [] });
      bucket.files.set(key, { text: JSON.stringify(f), etag: 'raced' });
    };
    expect((await lynne.edit((d) => { d.engagements.find((e) => e.id === 'e_maria')!.goals[0].progress = 80; })).status).toBe(200);
    const st = await maria.state();
    expect(st.messages.some((m) => m.id === 'm_race')).toBe(true);
    expect(st.engagements[0].goals[0].progress).toBe(80);
  });
});

describe('state endpoint', () => {
  it('supports conditional requests so idle polling is cheap', async () => {
    const maria = await as(MARIA);
    const first = await maria.call('state');
    const etag = first.headers.get('ETag')!;
    expect(etag).toBeTruthy();
    expect((await maria.call('state', { headers: { 'If-None-Match': etag } })).status).toBe(304);
    await maria.edit((d) => act.sendMessage(d, { engagementId: 'e_maria', fromRole: 'client', fromId: 'c_maria', fromName: 'x', text: 'change' }));
    expect((await maria.call('state', { headers: { 'If-None-Match': etag } })).status).toBe(200);
  });

  it('only admins can export everything', async () => {
    expect((await (await as(MARIA)).call('export')).status).toBe(403);
    expect((await (await as(ADMIN)).call('export')).status).toBe(200);
  });
});

describe('email', () => {
  const sendSpy = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'x' }), { status: 200 }));

  it('is unavailable until Resend is configured', async () => {
    const lynne = await as(ADMIN);
    await lynne.edit((d) => d.outbox.push({ id: 'em_1', kind: 'custom', toName: 'Maria', toEmail: MARIA, subject: 's', body: 'b', createdAt: 'x', status: 'queued' }));
    expect((await lynne.call('email/send', { body: { ids: ['em_1'] } })).status).toBe(503);
  });

  it('sends queued mail through Resend, only to known people, and marks it sent', async () => {
    env.RESEND_API_KEY = 're_test'; env.MAIL_FROM = 'L2L <coaching@example.com>';
    const spy = sendSpy();
    const lynne = await as(ADMIN);
    await lynne.edit((d) => d.outbox.push({ id: 'em_1', kind: 'custom', toName: 'Maria', toEmail: MARIA, subject: 'Hello', body: 'Body', createdAt: 'x', status: 'queued' }));
    // can't queue mail to a stranger (no open relay)
    expect((await lynne.edit((d) => d.outbox.push({ id: 'em_2', kind: 'custom', toName: 'Eve', toEmail: 'eve@evil.example', subject: 's', body: 'b', createdAt: 'x', status: 'queued' }))).status).toBe(403);
    const r = await lynne.call('email/send', { body: { ids: ['em_1'] } });
    expect(r.status).toBe(200);
    expect(r.json.results).toEqual([{ id: 'em_1', ok: true }]);
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toMatchObject({ from: 'L2L <coaching@example.com>', to: [MARIA], subject: 'Hello' });
    expect((await lynne.state()).outbox.find((o) => o.id === 'em_1')!.status).toBe('sent');
    expect(spy).toHaveBeenCalledTimes(1);
    // sending twice doesn't resend
    await lynne.call('email/send', { body: { ids: ['em_1'] } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('coaches can only send mail for their own clients; clients can\'t send at all', async () => {
    env.RESEND_API_KEY = 're_test'; env.MAIL_FROM = 'x@example.com';
    const spy = sendSpy();
    const lynne = await as(ADMIN);
    await lynne.edit((d) => d.outbox.push({ id: 'em_m', kind: 'custom', toName: 'Maria', toEmail: MARIA, subject: 's', body: 'b', createdAt: 'x', status: 'queued' }));
    const jen = await as(COACH);
    expect((await jen.call('email/send', { body: { ids: ['em_m'] } })).json.results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect((await (await as(MARIA)).call('email/send', { body: { ids: ['em_m'] } })).status).toBe(403);
  });

  it('keeps mail queued and reports the error if the provider rejects it', async () => {
    env.RESEND_API_KEY = 're_test'; env.MAIL_FROM = 'x@example.com';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 }));
    const lynne = await as(ADMIN);
    await lynne.edit((d) => d.outbox.push({ id: 'em_1', kind: 'custom', toName: 'Maria', toEmail: MARIA, subject: 's', body: 'b', createdAt: 'x', status: 'queued' }));
    const r = await lynne.call('email/send', { body: { ids: ['em_1'] } });
    expect(r.json.results[0]).toMatchObject({ ok: false });
    expect(r.json.results[0].error).toContain('domain not verified');
    expect((await lynne.state()).outbox.find((o) => o.id === 'em_1')!.status).toBe('queued');
  });

  it('can email an invite when asked', async () => {
    env.RESEND_API_KEY = 're_test'; env.MAIL_FROM = 'x@example.com';
    const spy = sendSpy();
    const r = await (await as(ADMIN)).call('auth/invite', { body: { userId: 'c_maria', sendEmail: true } });
    expect(r.json.emailed).toBe(true);
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.to).toEqual([MARIA]);
    expect(sent.text).toContain(`${ORIGIN}/#/join?email=`);
  });

  describe('scheduled job', () => {
    const cron = (token = 'cron-secret-xyz') => new Session().call('cron/run', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'l2l' }, body: {} });

    it('requires the bearer secret', async () => {
      expect((await cron('nope')).status).toBe(401);
      env.CRON_SECRET = undefined;
      expect((await cron()).status).toBe(401);
    });

    it('queues due reminders once, but only emails them if automatic sending is on', async () => {
      env.RESEND_API_KEY = 're_test'; env.MAIL_FROM = 'x@example.com';
      const spy = sendSpy();
      const first = await cron();
      expect(first.json.queued).toBeGreaterThan(0);
      expect(first.json.sent).toBe(0);
      expect(spy).not.toHaveBeenCalled();
      expect((await cron()).json.queued).toBe(0); // deduped

      const lynne = await as(ADMIN);
      await lynne.edit((d) => { d.settings.autoSendReminders = true; });
      const third = await cron();
      expect(third.json.sent).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalled();
      const to = spy.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).to[0]);
      expect(to.every((a: string) => /\.example$/.test(a))).toBe(true);
      // links in the emails use the configured public URL, not a browser origin
      expect(spy.mock.calls.some((c) => (JSON.parse((c[1] as RequestInit).body as string).text as string).includes(ORIGIN + '/#/'))).toBe(true);
    });

    it('queues the weekly digest only on the configured weekday', async () => {
      const lynne = await as(ADMIN);
      await lynne.edit((d) => { d.settings.weeklyDigestDay = 3; }); // Wednesday = today
      await cron();
      expect((await lynne.state()).outbox.some((o) => o.kind === 'weekly-digest')).toBe(true);
      const other = new FakeR2(); env.L2L_BUCKET = other; bucket = other as FakeR2;
      await seedBucket(buildSeed('2026-11-04'));
      const l2 = await as(ADMIN);
      await l2.edit((d) => { d.settings.weeklyDigestDay = 5; });
      await cron();
      expect((await l2.state()).outbox.some((o) => o.kind === 'weekly-digest')).toBe(false);
    });
  });
});

describe('storage layout', () => {
  it('never puts credentials in the data files the browser can receive', async () => {
    const full = await loadFullState(bucket, STATE_VERSION);
    expect(JSON.stringify(full)).not.toMatch(/"hash"|"salt"|passcode/);
  });
});
