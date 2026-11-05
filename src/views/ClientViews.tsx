import React from 'react';
import { ArrowRight, CalendarClock, ClipboardCheck, HeartPulse, MessageSquare, Sparkles, Video, MapPin, Phone, Building2 } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, PageHeader, Ring, SEVERITY_DOT, cx } from '../components/ui';
import { go, useStore } from '../store';
import { useClientEngagement, useDirectory, useViewer } from '../hooks';
import { Engagement } from '../types';
import { summarizeHours } from '../utils/hours';
import { fmtDate, fmtHours, fmtRelativeDay, hoursUntil, nowIso, parseDateTime, weekStart, todayIso } from '../utils/dates';
import { SessionsPanel } from '../panels/SessionsPanel';
import { PreProgramPanel } from '../panels/PreProgramPanel';
import { ContractPanel } from '../panels/ContractPanel';
import { CheckInsPanel } from '../panels/CheckInsPanel';
import { ActionsPanel } from '../panels/ActionsPanel';
import { MessagesPanel } from '../panels/MessagesPanel';
import { GoalsPanel, PhaseTracker } from '../panels/GoalsPanel';
import { CloseoutPanel } from '../panels/CloseoutPanel';
import { BookingModal } from '../panels/BookingModal';
import { ResourcesPage } from './ResourcesPage';

function NoProgram() {
  const { state } = useStore();
  return (
    <Card><Empty title="Your program isn't set up yet" hint={`Your coach is getting things ready. Questions? Email ${state.settings.supportEmail} or call ${state.settings.phone}.`} icon={<Sparkles className="h-9 w-9" />} /></Card>
  );
}

function useClientCtx() {
  const e = useClientEngagement();
  return e;
}

const MODE_ICON = { Zoom: Video, Phone: Phone, 'On-site': Building2 } as const;

export function ClientHome() {
  const { state, myReminders } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const e = useClientCtx();
  const [booking, setBooking] = React.useState(false);
  if (!e) return <><PageHeader title={`Welcome, ${v.name.split(' ')[0]}`} /><NoProgram /></>;

  const coach = dir.staff(e.coachId)!;
  const hours = summarizeHours(e, state.sessions);
  const now = nowIso();
  const next = state.sessions.filter((s) => s.engagementId === e.id && (s.status === 'scheduled' || s.status === 'requested') && s.start >= now).sort((a, b) => a.start.localeCompare(b.start))[0];
  const last = state.sessions.filter((s) => s.engagementId === e.id && s.status === 'completed').sort((a, b) => b.start.localeCompare(a.start))[0];
  const tasks = state.preTasks.filter((t) => t.engagementId === e.id && t.assignee === 'client' && (!t.clientId || t.clientId === v.id));
  const wk = weekStart(todayIso());
  const submittedThisWeek = state.checkIns.some((c) => c.engagementId === e.id && c.clientId === v.id && c.weekOf === wk);
  const unread = state.messages.filter((m) => m.engagementId === e.id && !m.readBy.includes(v.id));
  const avgGoal = e.goals.length ? e.goals.reduce((t, g) => t + g.progress, 0) / e.goals.length : 0;
  const hoursAway = next ? hoursUntil(next.start) : 0;
  const NextIcon = next ? MODE_ICON[next.mode] : Video;

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${v.name.split(' ')[0]}`}
        subtitle={<>{e.title} · coached by <b>{coach.name}</b></>}
        actions={<Badge tone={e.status === 'Active' ? 'green' : e.status === 'Pre-program' ? 'amber' : 'blue'}>{e.status}</Badge>}
      />

      {e.status === 'Pre-program' && (
        <Card className="mb-5 border-amber-200 bg-amber-50/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display font-bold text-amber-900">Getting ready for your first session</p>
              <p className="text-sm text-amber-800">{tasks.filter((t) => !t.done).length === 0 ? 'Everything on your list is done. Your coach will take it from here.' : `${tasks.filter((t) => !t.done).length} step${tasks.filter((t) => !t.done).length === 1 ? '' : 's'} left before your program starts ${fmtDate(e.startDate)}.`}</p>
            </div>
            <Btn variant="primary" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => go('/program')}>Open checklist</Btn>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="bg-brand-800 px-5 py-4 text-white">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-crimson-300">Next session</p>
              {next ? (
                <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl font-extrabold">{fmtRelativeDay(next.start)}, {parseDateTime(next.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-brand-100">
                      <span>{next.type} · {next.durationMin} min</span>
                      <span className="inline-flex items-center gap-1"><NextIcon className="h-4 w-4" />{next.mode}</span>
                      {next.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{next.location}</span>}
                    </p>
                  </div>
                  {next.status === 'requested' ? <Badge tone="amber">Awaiting {coach.name.split(' ')[0]}'s confirmation</Badge> : hoursAway < 24 ? <Badge tone="crimson">Coming up soon</Badge> : <Badge tone="green">Confirmed</Badge>}
                </div>
              ) : <p className="mt-1 font-display text-xl font-bold">Nothing booked yet</p>}
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              <Btn variant="accent" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setBooking(true)} disabled={e.status === 'Completed'}>{next ? 'Book another session' : 'Book a session'}</Btn>
              <Btn variant="secondary" onClick={() => go('/sessions')}>Manage sessions</Btn>
            </div>
          </Card>

          {last && (last.summary || last.nextFocus) && (
            <Card>
              <CardHeader title="From your last session" subtitle={`${last.type} · ${fmtDate(last.start)}`} icon={<MessageSquare className="h-5 w-5" />} />
              <div className="space-y-3 p-5 text-sm">
                {last.summary && <p className="leading-relaxed text-brand-700">{last.summary}</p>}
                {last.nextFocus && <p className="rounded-lg bg-brand-50 px-3 py-2"><span className="font-bold text-crimson-700">Your focus: </span>{last.nextFocus}</p>}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="To do & reminders" subtitle="Things that need you this week" action={<Badge tone="crimson">{myReminders.length}</Badge>} />
            {myReminders.length === 0 ? <Empty title="You're all caught up" hint="Nice. We'll nudge you when something comes up." /> : (
              <ul className="divide-y divide-brand-50">
                {myReminders.map((r) => (
                  <li key={r.key}>
                    <button onClick={() => go(r.href)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-brand-50">
                      <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY_DOT[r.severity])} />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{r.title}</span><span className="block text-xs text-brand-500">{r.detail}</span></span>
                      <ArrowRight className="h-4 w-4 text-brand-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">Coaching hours</p>
            <div className="mt-3 flex items-center gap-4">
              <Ring pct={hours.usedPct} size={92}><div><div className="font-display text-2xl font-extrabold leading-none">{fmtHours(hours.remaining)}</div><div className="text-[10px] font-bold uppercase text-brand-400">hrs left</div></div></Ring>
              <ul className="space-y-1 text-sm"><li><b>{fmtHours(hours.used)}</b> <span className="text-brand-500">delivered</span></li><li><b>{fmtHours(hours.scheduled)}</b> <span className="text-brand-500">booked</span></li><li><b>{fmtHours(hours.unbooked)}</b> <span className="text-brand-500">unbooked</span></li></ul>
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">Goal progress</p>
            <p className="mt-1 font-display text-3xl font-extrabold">{Math.round(avgGoal)}%</p>
            <p className="text-xs text-brand-500">average across {e.goals.length} goal{e.goals.length === 1 ? '' : 's'} · phase: <b>{e.phase}</b></p>
            <Btn className="mt-3" size="sm" variant="secondary" onClick={() => go('/program')}>View my program</Btn>
          </Card>
          {e.status === 'Active' && (
            <Card className={cx('p-5', !submittedThisWeek && 'border-crimson-200')}>
              <div className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-crimson-600" /><p className="font-display font-bold">Weekly check-in</p></div>
              <p className="mt-1 text-sm text-brand-500">{submittedThisWeek ? 'You\'re done for this week. Thank you!' : 'Share your wins and challenges — three minutes.'}</p>
              {!submittedThisWeek && <Btn className="mt-3" size="sm" variant="accent" onClick={() => go('/checkin')}>Start check-in</Btn>}
            </Card>
          )}
          {unread.length > 0 && (
            <Card className="p-5"><p className="font-display font-bold">{unread.length} new message{unread.length === 1 ? '' : 's'}</p><p className="mt-1 line-clamp-2 text-sm text-brand-500">“{unread[unread.length - 1].text}”</p><Btn className="mt-3" size="sm" variant="secondary" onClick={() => go('/messages')}>Read</Btn></Card>
          )}
        </div>
      </div>
      {booking && <BookingModal engagement={e} onClose={() => setBooking(false)} />}
    </>
  );
}

export function ClientProgram() {
  const e = useClientCtx();
  if (!e) return <><PageHeader title="My Program" /><NoProgram /></>;
  return (
    <>
      <PageHeader title="My Program" subtitle={e.title} />
      <div className="space-y-5">
        <CloseoutPanel engagement={e} />
        <PhaseTracker engagement={e} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><GoalsPanel engagement={e} /><PreProgramPanel engagement={e} /></div>
      </div>
    </>
  );
}

const wrap = (title: string, subtitle: string | undefined, render: (e: Engagement) => React.ReactNode) => function ClientPage() {
  const e = useClientCtx();
  return (<><PageHeader title={title} subtitle={subtitle} />{e ? render(e) : <NoProgram />}</>);
};

export const ClientSessions = wrap('Sessions & Hours', 'Book sessions, see your hours, and revisit what you covered.', (e) => <SessionsPanel engagement={e} />);
export const ClientContract = wrap('Coaching Agreement', undefined, (e) => <ContractPanel engagement={e} />);
export const ClientCheckIn = wrap('Weekly Check-in', 'A short weekly reflection that keeps coaching moving between sessions.', (e) => <CheckInsPanel engagement={e} />);
export const ClientActions = wrap('Action Items', undefined, (e) => <ActionsPanel engagement={e} />);
export const ClientMessages = wrap('Messages', undefined, (e) => <MessagesPanel engagement={e} />);
export const ClientResources = () => <ResourcesPage />;

