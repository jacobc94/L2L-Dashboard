import { AppState, Session, Staff } from '../types';
import { addDays, toIsoDate, weekStart } from '../utils/dates';
import { DEFAULT_RESOURCES, DEFAULT_SETTINGS } from './defaults';

export { DEFAULT_SETTINGS, STANDARD_TERMS } from './defaults';

/** Every demo account signs in with this code. Replace with real authentication before production. */
export const DEMO_CODE = 'demo';

/** Bump when the seed or state shape changes so stale browser data is replaced. */
export const STATE_VERSION = 4;

const staff = (): Staff[] => [
  {
    id: 'st_lynne',
    name: 'Lynne Powers',
    title: 'Co-Founder · Certified Coach & Business Development',
    credentials: 'Certified Coach',
    email: 'lynne@l2l.example',
    role: 'admin',
    accessCode: DEMO_CODE,
    timezone: 'Pacific Time',
    bio: 'One-on-one coaching plus organizational leadership and employee development.',
    availability: [
      { day: 1, start: '09:00', end: '12:00' },
      { day: 2, start: '13:00', end: '16:00' },
      { day: 3, start: '09:00', end: '12:00' },
      { day: 4, start: '13:00', end: '16:00' },
      { day: 5, start: '09:00', end: '12:00' },
    ],
  },
  {
    id: 'st_jennifer',
    name: 'Jennifer Jacobson',
    title: 'Coach',
    email: 'jennifer@l2l.example',
    role: 'coach',
    accessCode: DEMO_CODE,
    timezone: 'Pacific Time',
    availability: [
      { day: 2, start: '10:00', end: '16:00' },
      { day: 4, start: '10:00', end: '16:00' },
      { day: 5, start: '09:00', end: '12:00' },
    ],
  },
  {
    id: 'st_jacob',
    name: 'Jacob Cerda',
    title: 'Digital Marketing & Communications Director',
    email: 'jacob@l2l.example',
    role: 'admin',
    accessCode: DEMO_CODE,
    timezone: 'Pacific Time',
    availability: [],
  },
];

/** Builds a fully-populated demo workspace whose dates are relative to `today` (YYYY-MM-DD). */
export function buildSeed(today: string = toIsoDate(new Date())): AppState {
  const day = (offset: number) => addDays(today, offset);
  const at = (offset: number, time: string) => `${day(offset)}T${time}`;
  const stamp = (offset: number, time = '09:00') => `${day(offset)}T${time}`;
  const thisMonday = weekStart(today);
  const wk = (n: number) => addDays(thisMonday, -7 * n);

  const sessions: Session[] = [];
  const addSession = (s: Partial<Session> & Pick<Session, 'id' | 'engagementId' | 'coachId' | 'start'>) =>
    sessions.push({
      type: 'Coaching Session',
      mode: 'Zoom',
      durationMin: 60,
      status: 'completed',
      ...s,
    } as Session);

  // ── e1: Maria — active 1:1 coaching, mid-program ──
  const mariaHistory: Array<[number, string, string, string]> = [
    [-63, 'Kickoff', 'Aligned on three goals and agreed on how we will work together. Maria wants to move from firefighting to leading through others.', 'Complete the Everything DiSC profile and bring one example of a decision she kept that should have been delegated.'],
    [-49, 'Coaching Session', 'Reviewed DiSC results (high Di). Explored how pace and directness land with her direct reports.', 'Try the "ask first, then advise" approach in two 1:1s this week.'],
    [-35, 'Coaching Session', 'Debriefed the 1:1 experiment — one report opened up about workload for the first time. Mapped her delegation blind spots.', 'Delegate one recurring task fully, with clear outcome and check-in date.'],
    [-28, 'Coaching Session', 'Worked on a difficult conversation with a peer in Finance. Rehearsed opening statements and boundaries.', 'Hold the conversation before Friday and note what surprised her.'],
    [-21, 'Coaching Session', 'Conversation went better than expected. Shifted focus to executive presence in leadership-team meetings.', 'Speak last in two meetings; practice powerful questions.'],
    [-14, 'Check-in Call', 'Short check-in on delegation and the quarterly planning cycle.', 'Draft a one-page operating-rhythm proposal.'],
    [-7, 'Coaching Session', 'Reviewed the operating-rhythm draft and her influence strategy with the CEO. Celebrated visible wins.', 'Present the proposal and gather feedback.'],
  ];
  mariaHistory.forEach(([off, type, summary, nextFocus], i) =>
    addSession({
      id: `s_maria_${i + 1}`,
      engagementId: 'e_maria',
      coachId: 'st_lynne',
      start: at(off, i % 2 ? '14:00' : '13:30'),
      type: type as Session['type'],
      durationMin: type === 'Kickoff' ? 90 : type === 'Check-in Call' ? 30 : 60,
      loggedHours: type === 'Kickoff' ? 1.5 : type === 'Check-in Call' ? 0.5 : 1,
      summary,
      nextFocus,
      privateNotes:
        i === 3
          ? 'Watch for avoidance pattern when conflict involves senior peers. Revisit psychological safety on her own team.'
          : undefined,
      clientRating: i === 2 ? 5 : i === 4 ? 5 : undefined,
      clientReflection: i === 4 ? 'This was the most useful one so far — I left with a script I actually used.' : undefined,
    })
  );
  addSession({ id: 's_maria_next', engagementId: 'e_maria', coachId: 'st_lynne', start: at(2, '13:30'), status: 'scheduled' });
  addSession({
    id: 's_maria_req',
    engagementId: 'e_maria',
    coachId: 'st_lynne',
    start: at(9, '14:00'),
    status: 'requested',
    requestedBy: 'client',
  });

  // ── e2: David — pre-program, contract out for signature ──
  addSession({
    id: 's_david_kick',
    engagementId: 'e_david',
    coachId: 'st_lynne',
    start: at(8, '09:30'),
    type: 'Kickoff',
    durationMin: 90,
    status: 'scheduled',
  });

  // ── e3: Brightpath leadership team ──
  addSession({
    id: 's_team_1',
    engagementId: 'e_team',
    coachId: 'st_jennifer',
    start: at(-30, '10:00'),
    type: 'Kickoff',
    mode: 'On-site',
    location: 'Brightpath HQ, Conference Room B',
    durationMin: 120,
    loggedHours: 2,
    summary: 'Introduced the Five Behaviors model and set the team\'s shared goal: faster decisions with less rework. Agreed ground rules for the engagement.',
    nextFocus: 'Everyone completes the Five Behaviors of a Cohesive Team assessment before the debrief.',
  });
  addSession({
    id: 's_team_2',
    engagementId: 'e_team',
    coachId: 'st_jennifer',
    start: at(-14, '10:00'),
    type: 'Debrief',
    mode: 'On-site',
    location: 'Brightpath HQ, Conference Room B',
    durationMin: 180,
    loggedHours: 3,
    summary: 'Debriefed the team report. Strengths: trust. Biggest gap: healthy conflict and holding each other accountable. Drafted three team commitments.',
    nextFocus: 'Practice "productive conflict" in the weekly ops meeting; Priya to rotate the facilitator role.',
    privateNotes: 'Tom and Priya dominate airtime; Aisha holds back disagreement. Consider pre-reads before the next session.',
  });
  addSession({ id: 's_team_3', engagementId: 'e_team', coachId: 'st_jennifer', start: at(1, '10:00'), type: 'Team Session', mode: 'On-site', location: 'Brightpath HQ, Conference Room B', durationMin: 180, status: 'scheduled' });
  addSession({ id: 's_team_4', engagementId: 'e_team', coachId: 'st_jennifer', start: at(15, '10:00'), type: 'Team Session', mode: 'On-site', location: 'Brightpath HQ, Conference Room B', durationMin: 180, status: 'scheduled' });

  // ── e4: Jordan — completed program awaiting closeout survey ──
  [-120, -105, -90, -75, -60, -45, -30, -20, -12, -6].forEach((off, i) =>
    addSession({
      id: `s_jordan_${i + 1}`,
      engagementId: 'e_jordan',
      coachId: 'st_lynne',
      start: at(off, '15:00'),
      type: i === 0 ? 'Kickoff' : i === 9 ? 'Wrap-up' : 'Coaching Session',
      loggedHours: 1,
      summary: i === 9 ? 'Reviewed growth across the engagement and built a 90-day sustainment plan.' : 'Worked through the current priority and agreed next steps.',
    })
  );

  const state: AppState = {
    version: STATE_VERSION,
    settings: DEFAULT_SETTINGS,
    staff: staff(),
    orgs: [
      { id: 'o_harbor', name: 'Harborview Federal Credit Union', industry: 'Financial services' },
      { id: 'o_summit', name: 'Summit Ridge Health', industry: 'Healthcare' },
      { id: 'o_bright', name: 'Brightpath Logistics', industry: 'Transportation & logistics' },
    ],
    clients: [
      { id: 'c_maria', name: 'Maria Alvarez', title: 'VP of Operations', orgId: 'o_harbor', email: 'maria@harborview.example', phone: '(555) 010-2211', accessCode: DEMO_CODE },
      { id: 'c_jordan', name: 'Jordan Wells', title: 'Director of Engineering', orgId: 'o_harbor', email: 'jordan@harborview.example', accessCode: DEMO_CODE },
      { id: 'c_david', name: 'David Chen', title: 'Chief Financial Officer', orgId: 'o_summit', email: 'david@summitridge.example', phone: '(555) 010-4488', accessCode: DEMO_CODE },
      { id: 'c_priya', name: 'Priya Nair', title: 'Chief Operating Officer', orgId: 'o_bright', email: 'priya@brightpath.example', accessCode: DEMO_CODE },
      { id: 'c_tom', name: 'Tom Becker', title: 'VP Sales', orgId: 'o_bright', email: 'tom@brightpath.example', accessCode: DEMO_CODE },
      { id: 'c_aisha', name: 'Aisha Rahman', title: 'Director of Customer Success', orgId: 'o_bright', email: 'aisha@brightpath.example', accessCode: DEMO_CODE },
      { id: 'c_luis', name: 'Luis Ortega', title: 'Director of Fleet Operations', orgId: 'o_bright', email: 'luis@brightpath.example', accessCode: DEMO_CODE },
    ],
    engagements: [
      {
        id: 'e_maria', title: 'Executive Coaching — Maria Alvarez', type: 'Executive Coaching', orgId: 'o_harbor',
        clientIds: ['c_maria'], coachId: 'st_lynne', status: 'Active', phase: 'Connect',
        startDate: day(-63), endDate: day(117), contractedHours: 20, checkInDay: 1,
        goals: [
          { id: 'g1', text: 'Delegate and lead through others instead of doing the work myself', progress: 60 },
          { id: 'g2', text: 'Build executive presence with the leadership team', progress: 45 },
          { id: 'g3', text: 'Handle difficult conversations with peers directly and early', progress: 70 },
        ],
      },
      {
        id: 'e_david', title: 'Executive Coaching — David Chen', type: 'Executive Coaching', orgId: 'o_summit',
        clientIds: ['c_david'], coachId: 'st_lynne', status: 'Pre-program', phase: 'Identify',
        startDate: day(8), endDate: day(190), contractedHours: 16, checkInDay: 1,
        goals: [{ id: 'g1', text: 'Step up from finance leader to strategic partner to the CEO', progress: 0 }],
      },
      {
        id: 'e_team', title: 'Brightpath Leadership Team — The Five Behaviors', type: 'Team Coaching', orgId: 'o_bright',
        clientIds: ['c_priya', 'c_tom', 'c_aisha', 'c_luis'], coachId: 'st_jennifer', status: 'Active', phase: 'Assess & Plan',
        startDate: day(-30), endDate: day(150), contractedHours: 24, checkInDay: 5,
        goals: [
          { id: 'g1', text: 'Make decisions faster with less rework', progress: 25 },
          { id: 'g2', text: 'Raise the level of healthy, productive conflict in leadership meetings', progress: 35 },
        ],
      },
      {
        id: 'e_jordan', title: 'Executive Coaching — Jordan Wells', type: 'Executive Coaching', orgId: 'o_harbor',
        clientIds: ['c_jordan'], coachId: 'st_lynne', status: 'Completed', phase: 'Evolve',
        startDate: day(-125), endDate: day(-5), contractedHours: 10, checkInDay: 1,
        goals: [
          { id: 'g1', text: 'Transition from technical lead to people leader', progress: 85 },
          { id: 'g2', text: 'Communicate priorities clearly across departments', progress: 80 },
        ],
      },
    ],
    preTasks: [],
    contracts: [],
    sessions,
    checkIns: [],
    actions: [],
    messages: [],
    outbox: [],
    resources: DEFAULT_RESOURCES,
  };

  // ── Pre-program tasks ──
  const t = (engagementId: string, title: string, description: string, kind: any, assignee: any, done: boolean, dueOff: number | null, extra: any = {}) =>
    state.preTasks.push({
      id: `t_${state.preTasks.length + 1}`,
      engagementId, title, description, kind, assignee, done,
      dueDate: dueOff == null ? undefined : day(dueOff),
      completedAt: done ? stamp((dueOff ?? -7) - 2) : undefined,
      ...extra,
    });

  // Maria: all complete
  t('e_maria', 'Sign coaching agreement', 'Review and e-sign your coaching contract.', 'contract', 'client', true, -66);
  t('e_maria', 'Complete intake questionnaire', 'Tell us about your role, challenges and what success looks like.', 'intake', 'client', true, -65);
  t('e_maria', 'Take the Everything DiSC assessment', 'About 20 minutes. Your coach will send the link.', 'assessment', 'client', true, -60, { link: 'https://l2lconsultingteam.com/services/assessments/disc-assessment/' });
  t('e_maria', 'Stakeholder input (3 colleagues)', 'Name three people your coach may invite for brief confidential input.', 'interview', 'client', true, -60);
  t('e_maria', 'Schedule kickoff session', 'Pick a time for the 90-minute kickoff.', 'schedule', 'client', true, -64);

  // David: pre-program in progress
  t('e_david', 'Sign coaching agreement', 'Review and e-sign your coaching contract.', 'contract', 'client', false, 3);
  t('e_david', 'Complete intake questionnaire', 'Tell us about your role, challenges and what success looks like.', 'intake', 'client', true, -1);
  t('e_david', 'Take the Leadership Practices Inventory (LPI)', 'Self-assessment plus observer feedback. Your coach will email the link.', 'assessment', 'client', false, 6, { link: 'https://l2lconsultingteam.com/services/assessments/leadership-practices-inventory/' });
  t('e_david', 'Name your LPI observers (5–8 people)', 'Include your manager, peers and direct reports.', 'interview', 'client', false, 4);
  t('e_david', 'Confirm kickoff session', 'Your kickoff is booked — confirm it works.', 'schedule', 'client', false, 7);
  t('e_david', 'Send assessment links', 'Email David the LPI link and observer instructions.', 'assessment', 'coach', false, -1);

  // Team: per-person assessments, two overdue
  t('e_team', 'Sign coaching agreement', 'Team sponsor signs the agreement.', 'contract', 'client', true, -32, { clientId: 'c_priya' });
  t('e_team', 'Complete intake questionnaire', 'Share how the team works today and where it gets stuck.', 'intake', 'client', true, -31, { clientId: 'c_priya' });
  [['c_priya', true], ['c_tom', true], ['c_aisha', false], ['c_luis', false]].forEach(([cid, done]) =>
    t('e_team', 'Complete The Five Behaviors assessment', 'About 15 minutes. Individual responses are combined into the team report.', 'assessment', 'client', done as boolean, -16, { clientId: cid, link: 'https://l2lconsultingteam.com/services/assessments/5-behaviors-cohesive-team/' })
  );
  t('e_team', 'Block the next team session in all calendars', 'Everyone confirms the date and location.', 'schedule', 'client', false, 0, { clientId: 'c_priya' });
  t('e_team', 'Prepare facilitator pre-read', 'Send the pre-read on productive conflict to the team.', 'custom', 'coach', false, -1);

  // Jordan done
  t('e_jordan', 'Sign coaching agreement', 'Review and e-sign your coaching contract.', 'contract', 'client', true, -128);
  t('e_jordan', 'Complete intake questionnaire', 'Tell us about your role and goals.', 'intake', 'client', true, -127);

  // ── Contracts ──
  const contract = (engagementId: string, status: any, extra: any = {}) => {
    const e = state.engagements.find((x) => x.id === engagementId)!;
    state.contracts.push({
      id: `ct_${engagementId.slice(2)}`,
      engagementId,
      status,
      title: `Coaching Agreement — ${e.title.replace(/^.*— /, '')}`,
      totalHours: e.contractedHours,
      startDate: e.startDate,
      endDate: e.endDate,
      cancellationHours: 24,
      additionalTerms: '',
      ...extra,
    });
  };
  contract('e_maria', 'signed', { fee: 6000, billingNote: 'Invoiced monthly.', sentAt: stamp(-68), signedAt: stamp(-66, '11:10'), signedByName: 'Maria Alvarez', signedByClientId: 'c_maria', coachSignedName: 'Lynne Powers', coachSignedAt: stamp(-68) });
  contract('e_david', 'sent', { fee: 4800, billingNote: 'Invoiced quarterly.', sentAt: stamp(-5), coachSignedName: 'Lynne Powers', coachSignedAt: stamp(-5) });
  contract('e_team', 'signed', {
    fee: 9600, billingNote: 'Billed to Brightpath Logistics.',
    additionalTerms: 'On-site sessions take place at the Client\'s headquarters. Individual assessment responses are shared only as part of the combined team report.',
    sentAt: stamp(-36), signedAt: stamp(-32, '09:20'), signedByName: 'Priya Nair', signedByClientId: 'c_priya', coachSignedName: 'Jennifer Jacobson', coachSignedAt: stamp(-36),
  });
  contract('e_jordan', 'signed', { fee: 3000, sentAt: stamp(-130), signedAt: stamp(-128), signedByName: 'Jordan Wells', signedByClientId: 'c_jordan', coachSignedName: 'Lynne Powers', coachSignedAt: stamp(-130) });

  // ── Weekly check-ins ──
  const ci = (engagementId: string, clientId: string, weeksAgo: number, energy: number, progress: number, wins: string, challenges: string, focusNext: string, supportNeeded = '', response?: string) =>
    state.checkIns.push({
      id: `ci_${state.checkIns.length + 1}`,
      engagementId, clientId, weekOf: wk(weeksAgo), energy, progress, wins, challenges, focusNext, supportNeeded,
      submittedAt: stamp(-7 * weeksAgo - 2, '16:30'),
      coachResponse: response,
      respondedAt: response ? stamp(-7 * weeksAgo - 1, '08:15') : undefined,
    });
  ci('e_maria', 'c_maria', 4, 3, 3, 'Held first 1:1s using ask-then-advise.', 'Quarter-end crunch ate my prep time.', 'Delegate the weekly reporting task.', '', 'Great start. Protect 30 minutes before each 1:1 — we will build that into your calendar rules.');
  ci('e_maria', 'c_maria', 3, 4, 4, 'Delegated reporting; the team handled it well.', 'Hard to resist stepping in.', 'Prepare for the Finance conversation.', 'Want to rehearse the opener.', 'Rehearsal is on the agenda for our next session.');
  ci('e_maria', 'c_maria', 2, 4, 4, 'The Finance conversation went well.', 'Nervous about the leadership-team presentation.', 'Practice speaking last in meetings.', '', 'That is a real shift — notice how it felt.');
  ci('e_maria', 'c_maria', 1, 5, 4, 'Presented the operating-rhythm draft; CEO engaged.', 'Pushback from one VP.', 'Gather feedback and refine.', 'Thinking through how to handle the VP.', undefined);
  // Team: two members, last week
  ci('e_team', 'c_priya', 1, 4, 3, 'Rotated facilitator in ops meeting.', 'Tom and I talked over Aisha again.', 'Use a round-robin for the next meeting.', '');
  ci('e_team', 'c_aisha', 1, 3, 3, 'Raised a concern before the decision rather than after.', 'Still hesitant to disagree with Tom.', 'Try the pre-read approach.', 'Would like coaching on speaking up.');

  // ── Action items ──
  const act = (engagementId: string, text: string, owner: 'client' | 'coach', dueOff: number | null, done: boolean, extra: any = {}) =>
    state.actions.push({ id: `a_${state.actions.length + 1}`, engagementId, text, owner, done, due: dueOff == null ? undefined : day(dueOff), createdAt: stamp(-7), ...extra });
  act('e_maria', 'Present the operating-rhythm proposal to the leadership team', 'client', 2, false, { clientId: 'c_maria', sessionId: 's_maria_7' });
  act('e_maria', 'Gather written feedback from two VPs on the proposal', 'client', 6, false, { clientId: 'c_maria' });
  act('e_maria', 'Block 30 minutes of prep before each 1:1', 'client', -1, false, { clientId: 'c_maria' });
  act('e_maria', 'Delegate the monthly board-report draft', 'client', -14, true, { clientId: 'c_maria' });
  act('e_maria', 'Send Maria the "powerful questions" one-pager', 'coach', 1, false);
  act('e_david', 'Name 5–8 LPI observers', 'client', 4, false, { clientId: 'c_david' });
  act('e_team', 'Rotate meeting facilitator weekly', 'client', null, false, { clientId: 'c_priya' });
  act('e_team', 'Use a pre-read for the next ops meeting decision', 'client', 1, false, { clientId: 'c_tom' });
  act('e_team', 'Share "productive conflict" pre-read with the team', 'coach', 0, false);

  // ── Messages ──
  const msg = (engagementId: string, fromRole: 'client' | 'coach', fromId: string, fromName: string, text: string, off: number, time: string, readBy: string[]) =>
    state.messages.push({ id: `m_${state.messages.length + 1}`, engagementId, fromRole, fromId, fromName, text, at: stamp(off, time), readBy });
  msg('e_maria', 'coach', 'st_lynne', 'Lynne Powers', 'Great work this week, Maria. Before we meet, think about who you want in the room when you present the proposal.', -3, '17:05', ['st_lynne', 'c_maria']);
  msg('e_maria', 'client', 'c_maria', 'Maria Alvarez', 'Thanks! I will bring a draft attendee list. Can we also spend a few minutes on how to respond to pushback?', -3, '19:20', ['c_maria', 'st_lynne']);
  msg('e_maria', 'coach', 'st_lynne', 'Lynne Powers', 'Absolutely — I will add it to the agenda.', -2, '08:40', ['st_lynne']);
  msg('e_david', 'coach', 'st_lynne', 'Lynne Powers', 'Welcome, David! Your agreement and pre-program steps are in the portal. Let me know if anything is unclear.', -5, '10:15', ['st_lynne']);
  msg('e_team', 'client', 'c_priya', 'Priya Nair', 'Can we move the next session start to 10:30? Two of the team have a customer call first.', -1, '15:00', ['c_priya']);

  return state;
}
