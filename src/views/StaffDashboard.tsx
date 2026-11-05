import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, Clock, FileSignature, Inbox, Mail } from 'lucide-react';
import { Avatar, Badge, Btn, Card, CardHeader, Empty, HoursBar, PageHeader, SEVERITY_DOT, Stat, cx } from '../components/ui';
import { go, useStore } from '../store';
import { STATUS_TONE, useDirectory, useMyEngagements, useViewer } from '../hooks';
import { fmtDate, fmtDateTime, fmtHours, fmtRelativeDay, nowIso, parseDateTime, todayIso, addDays, weekStart } from '../utils/dates';
import { sessionHours, summarizeHours } from '../utils/hours';

export function StaffDashboard() {
  const { state, myReminders } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const engs = useMyEngagements();
  const ids = new Set(engs.map((e) => e.id));
  const now = nowIso();
  const today = todayIso();
  const wkStart = weekStart(today);
  const wkEnd = addDays(wkStart, 7);

  const mySessions = state.sessions.filter((s) => ids.has(s.engagementId));
  const upcoming = mySessions.filter((s) => (s.status === 'scheduled' || s.status === 'requested') && s.start >= now).sort((a, b) => a.start.localeCompare(b.start));
  const thisWeek = upcoming.filter((s) => s.start.slice(0, 10) < wkEnd).length;
  const monthPrefix = today.slice(0, 7);
  const monthHours = mySessions.filter((s) => s.status === 'completed' && s.start.startsWith(monthPrefix)).reduce((t, s) => t + sessionHours(s), 0);
  const active = engs.filter((e) => e.status === 'Active').length;
  const pre = engs.filter((e) => e.status === 'Pre-program').length;
  const attention = myReminders.filter((r) => r.severity !== 'info');
  const unsigned = state.contracts.filter((c) => ids.has(c.engagementId) && c.status === 'sent').length;
  const queued = state.outbox.filter((o) => o.status === 'queued').length;
  const waiting = state.checkIns.filter((c) => ids.has(c.engagementId) && !c.coachResponse).length;
  const roster = engs.filter((e) => e.status === 'Active' || e.status === 'Pre-program');

  return (
    <>
      <PageHeader title={`Hello, ${v.name.split(' ')[0]}`} subtitle={v.isAdmin ? 'Here is where the whole practice stands today.' : 'Here is what needs you today.'} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active programs" value={active} sub={`${pre} in pre-program`} icon={<Briefcase className="h-4 w-4" />} />
        <Stat label="Sessions this week" value={thisWeek} sub={`${upcoming.filter((s) => s.status === 'requested').length} awaiting confirmation`} icon={<CalendarClock className="h-4 w-4" />} />
        <Stat label="Hours delivered (month)" value={fmtHours(monthHours)} sub="completed sessions" icon={<Clock className="h-4 w-4" />} />
        <Stat label="Needs attention" value={attention.length} tone={attention.length ? 'crimson' : 'teal'} sub={`${waiting} check-in${waiting === 1 ? '' : 's'} to answer`} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardHeader title="Needs your attention" icon={<AlertTriangle className="h-5 w-5" />} action={<Btn size="sm" variant="ghost" onClick={() => go('/reminders')}>All reminders</Btn>} />
            {myReminders.length === 0 ? <Empty title="Nothing waiting on you" hint="Enjoy the quiet." /> : (
              <ul className="divide-y divide-brand-50">
                {myReminders.slice(0, 8).map((r) => (
                  <li key={r.key}><button onClick={() => go(r.href)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-brand-50">
                    <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY_DOT[r.severity])} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{r.title}</span><span className="block truncate text-xs text-brand-500">{r.detail}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-brand-300" />
                  </button></li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Active & upcoming programs" icon={<Briefcase className="h-5 w-5" />} action={<Btn size="sm" variant="ghost" onClick={() => go('/engagements')}>View all</Btn>} />
            {roster.length === 0 ? <Empty title="No active programs" /> : (
              <ul className="divide-y divide-brand-50">
                {roster.map((e) => {
                  const h = summarizeHours(e, state.sessions);
                  const warn = h.contracted > 0 && h.used / h.contracted >= state.settings.lowHoursThreshold;
                  return (
                    <li key={e.id}><a href={`#/engagements/${e.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-brand-50">
                      <Avatar name={dir.label(e)} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{dir.label(e)}</p><Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge></div>
                        <div className="mt-1.5 flex items-center gap-3"><HoursBar className="h-2 flex-1" usedPct={h.usedPct} bookedPct={h.bookedPct} /><span className={cx('w-24 shrink-0 text-right text-xs font-bold', warn ? 'text-crimson-600' : 'text-brand-500')}>{fmtHours(h.used)}/{fmtHours(h.contracted)} hrs</span></div>
                      </div>
                    </a></li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Coming up" icon={<CalendarClock className="h-5 w-5" />} action={<Btn size="sm" variant="ghost" onClick={() => go('/schedule')}>Schedule</Btn>} />
            {upcoming.length === 0 ? <Empty title="No sessions scheduled" /> : (
              <ul className="divide-y divide-brand-50">
                {upcoming.slice(0, 6).map((s) => {
                  const e = state.engagements.find((x) => x.id === s.engagementId)!;
                  return (
                    <li key={s.id}><a href={`#/engagements/${e.id}/sessions`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50">
                      <div className="w-12 shrink-0 text-center"><div className="text-[10px] font-bold uppercase text-crimson-600">{fmtRelativeDay(s.start)}</div><div className="font-display text-sm font-extrabold">{parseDateTime(s.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div></div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{dir.label(e)}</p><p className="truncate text-xs text-brand-500">{s.type} · {s.durationMin} min{v.isAdmin ? ` · ${dir.staff(s.coachId)?.name.split(' ')[0]}` : ''}</p></div>
                      {s.status === 'requested' && <Badge tone="amber">Request</Badge>}
                    </a></li>
                  );
                })}
              </ul>
            )}
          </Card>

          {v.isAdmin && (
            <Card className="divide-y divide-brand-50">
              <button onClick={() => go('/contracts')} className="flex w-full items-center gap-3 p-4 text-left hover:bg-brand-50"><FileSignature className="h-5 w-5 text-crimson-600" /><span className="flex-1 text-sm"><b>{unsigned}</b> agreement{unsigned === 1 ? '' : 's'} awaiting signature</span><ArrowRight className="h-4 w-4 text-brand-300" /></button>
              <button onClick={() => go('/reminders')} className="flex w-full items-center gap-3 p-4 text-left hover:bg-brand-50"><Mail className="h-5 w-5 text-crimson-600" /><span className="flex-1 text-sm"><b>{queued}</b> email{queued === 1 ? '' : 's'} queued to send</span><ArrowRight className="h-4 w-4 text-brand-300" /></button>
              <button onClick={() => go('/checkins')} className="flex w-full items-center gap-3 p-4 text-left hover:bg-brand-50"><Inbox className="h-5 w-5 text-crimson-600" /><span className="flex-1 text-sm"><b>{waiting}</b> check-in{waiting === 1 ? '' : 's'} awaiting a coach reply</span><ArrowRight className="h-4 w-4 text-brand-300" /></button>
            </Card>
          )}
          <p className="text-center text-xs text-brand-400">Today is {fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })} · {fmtDateTime(now).split(' · ')[1]}</p>
        </div>
      </div>
    </>
  );
}
