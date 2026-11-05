import React from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, Plus, X } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, Field, Input, PageHeader, Segmented, Select, cx } from '../components/ui';
import { go, useStore } from '../store';
import { useDirectory, useMyEngagements, useViewer } from '../hooks';
import { AvailabilityBlock, Session, Staff } from '../types';
import { DAY_NAMES, DAY_SHORT, addDays, fmtDate, fmtDateTime, fmtTime, nowIso, parseDate, parseDateTime, todayIso, weekStart } from '../utils/dates';
import { setSessionStatus } from '../utils/actions';

const START_H = 7;
const END_H = 19;
const ROW = 52; // px per hour

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function SchedulePage() {
  const { state, mutate } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const engs = useMyEngagements();
  const ids = new Set(engs.map((e) => e.id));
  const coaches = state.staff.filter((s) => s.availability.length > 0 || s.id === v.id);
  const [coachFilter, setCoachFilter] = React.useState<string>(v.isAdmin ? 'all' : v.id);
  const [view, setView] = React.useState<'week' | 'agenda'>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'week');
  const [wk, setWk] = React.useState(weekStart(todayIso()));
  const now = nowIso();

  const sessions = state.sessions.filter((s) => ids.has(s.engagementId) && (coachFilter === 'all' || s.coachId === coachFilter) && s.status !== 'cancelled');
  const requests = sessions.filter((s) => s.status === 'requested').sort((a, b) => a.start.localeCompare(b.start));
  const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const shaded = coachFilter !== 'all' ? state.staff.find((s) => s.id === coachFilter) : undefined;
  const agenda = sessions.filter((s) => s.start >= now.slice(0, 10)).sort((a, b) => a.start.localeCompare(b.start));
  const label = (s: Session) => { const e = state.engagements.find((x) => x.id === s.engagementId)!; return dir.label(e); };

  return (
    <>
      <PageHeader title="Schedule" subtitle="All sessions, pending requests and your bookable availability." actions={<Segmented value={view} onChange={setView} options={[{ id: 'week', label: 'Week' }, { id: 'agenda', label: 'Agenda' }]} />} />

      {requests.length > 0 && (
        <Card className="mb-5 border-amber-200">
          <CardHeader title={`${requests.length} session request${requests.length === 1 ? '' : 's'} to confirm`} icon={<CalendarCheck className="h-5 w-5" />} />
          <ul className="divide-y divide-brand-50">
            {requests.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1"><p className="text-sm font-bold">{label(s)} <span className="font-normal text-brand-500">· {s.type}, {s.durationMin} min</span></p><p className="text-xs text-brand-500">{fmtDateTime(s.start)} · {s.mode}{v.isAdmin ? ` · ${dir.staff(s.coachId)?.name}` : ''}</p></div>
                <Btn size="sm" onClick={() => mutate((d) => setSessionStatus(d, s.id, 'scheduled'))}>Confirm</Btn>
                <Btn size="sm" variant="danger" onClick={() => mutate((d) => setSessionStatus(d, s.id, 'cancelled', 'Declined by coach'))}>Decline</Btn>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view === 'week' && (
            <>
              <Btn size="sm" variant="secondary" aria-label="Previous week" onClick={() => setWk(addDays(wk, -7))}><ChevronLeft className="h-4 w-4" /></Btn>
              <Btn size="sm" variant="secondary" onClick={() => setWk(weekStart(todayIso()))}>Today</Btn>
              <Btn size="sm" variant="secondary" aria-label="Next week" onClick={() => setWk(addDays(wk, 7))}><ChevronRight className="h-4 w-4" /></Btn>
              <span className="ml-1 font-display text-sm font-bold">{fmtDate(days[0])} – {fmtDate(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </>
          )}
        </div>
        {v.isAdmin && (
          <Select className="w-auto" aria-label="Coach" value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)}>
            <option value="all">All coaches</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </div>

      {view === 'week' ? (
        <Card className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[52px,repeat(7,1fr)] border-b border-brand-100 bg-brand-50/60">
              <div />
              {days.map((d) => (
                <div key={d} className={cx('py-2 text-center text-xs', d === todayIso() && 'bg-crimson-50')}>
                  <div className="font-bold uppercase text-brand-400">{DAY_SHORT[parseDate(d).getDay()]}</div>
                  <div className={cx('font-display text-lg font-extrabold', d === todayIso() ? 'text-crimson-600' : 'text-brand-800')}>{parseDate(d).getDate()}</div>
                </div>
              ))}
            </div>
            <div className="relative grid grid-cols-[52px,repeat(7,1fr)]" style={{ height: (END_H - START_H) * ROW }}>
              <div className="relative">
                {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-brand-400" style={{ top: i * ROW }}>{i === 0 ? '' : new Date(2000, 0, 1, START_H + i).toLocaleTimeString('en-US', { hour: 'numeric' })}</div>)}
              </div>
              {days.map((d) => {
                const dow = parseDate(d).getDay();
                return (
                  <div key={d} className="relative border-l border-brand-100">
                    {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-brand-50" style={{ top: i * ROW }} />)}
                    {shaded?.availability.filter((b) => b.day === dow).map((b, i) => (
                      <div key={i} className="absolute inset-x-0 bg-emerald-50/70" title="Available for booking" style={{ top: ((minutes(b.start) - START_H * 60) / 60) * ROW, height: ((minutes(b.end) - minutes(b.start)) / 60) * ROW }} />
                    ))}
                    {sessions.filter((s) => s.start.slice(0, 10) === d).map((s) => {
                      const top = ((parseDateTime(s.start).getHours() * 60 + parseDateTime(s.start).getMinutes() - START_H * 60) / 60) * ROW;
                      const height = Math.max(24, (s.durationMin / 60) * ROW - 2);
                      if (top < 0 || top > (END_H - START_H) * ROW) return null;
                      return (
                        <button key={s.id} onClick={() => go(`/engagements/${s.engagementId}/sessions`)} title={`${label(s)} · ${s.type} · ${fmtTime(s.start)}`}
                          className={cx('absolute inset-x-1 overflow-hidden rounded-lg px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-inset transition hover:z-10 hover:shadow-md',
                            s.status === 'requested' ? 'bg-amber-100 text-amber-900 ring-amber-300' : s.status === 'completed' || s.status === 'no-show' ? 'bg-brand-100 text-brand-700 ring-brand-200' : 'bg-brand-700 text-white ring-brand-800')}
                          style={{ top, height }}>
                          <div className="truncate font-bold">{label(s)}</div>
                          <div className="truncate opacity-80">{fmtTime(s.start)} · {s.type}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-brand-50 px-4 py-2.5 text-[11px] text-brand-500">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-700" />Confirmed</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" />Requested</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-100" />Completed</span>{shaded && <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100" />Open availability</span>}
          </div>
        </Card>
      ) : (
        <Card>
          {agenda.length === 0 ? <Empty title="Nothing upcoming" /> : (
            <ul className="divide-y divide-brand-50">
              {agenda.map((s) => (
                <li key={s.id}><button onClick={() => go(`/engagements/${s.engagementId}/sessions`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-brand-50">
                  <div className="w-24 shrink-0 text-xs text-brand-500"><div className="font-bold text-brand-800">{fmtDate(s.start, { weekday: 'short', month: 'short', day: 'numeric' })}</div>{fmtTime(s.start)}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{label(s)}</p><p className="truncate text-xs text-brand-500">{s.type} · {s.durationMin} min · {s.mode}{v.isAdmin ? ` · ${dir.staff(s.coachId)?.name.split(' ')[0]}` : ''}</p></div>
                  <Badge tone={s.status === 'requested' ? 'amber' : s.status === 'scheduled' ? 'green' : 'blue'}>{s.status === 'requested' ? 'Requested' : s.status === 'scheduled' ? 'Confirmed' : 'Done'}</Badge>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <AvailabilityEditor staffList={v.isAdmin ? state.staff.filter((s) => s.role === 'coach' || s.availability.length > 0 || s.id === v.id) : state.staff.filter((s) => s.id === v.id)} initialId={v.id} />
    </>
  );
}

function AvailabilityEditor({ staffList, initialId }: { staffList: Staff[]; initialId: string }) {
  const { mutate } = useStore();
  const [who, setWho] = React.useState(staffList.find((s) => s.id === initialId)?.id ?? staffList[0]?.id);
  const [draft, setDraft] = React.useState<AvailabilityBlock>({ day: 2, start: '09:00', end: '12:00' });
  const person = staffList.find((s) => s.id === who);
  if (!person) return null;
  const blocks = [...person.availability].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const valid = draft.end > draft.start;
  const update = (fn: (s: Staff) => void) => mutate((d) => { const t = d.staff.find((x) => x.id === person.id); if (t) fn(t); });
  return (
    <Card className="mt-6">
      <CardHeader title="Booking availability" subtitle="Clients can only book inside these windows (minus anything already on the calendar)." icon={<Clock className="h-5 w-5" />}
        action={staffList.length > 1 && <Select className="w-auto" aria-label="Staff member" value={who} onChange={(e) => setWho(e.target.value)}>{staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>} />
      <div className="p-5">
        {blocks.length === 0 ? <p className="mb-4 text-sm text-brand-500">No availability set — clients can't self-book with {person.name.split(' ')[0]} yet.</p> : (
          <ul className="mb-4 flex flex-wrap gap-2">
            {blocks.map((b, i) => (
              <li key={i} className="inline-flex items-center gap-2 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-sm ring-1 ring-inset ring-brand-100">
                <b>{DAY_NAMES[b.day]}</b> {fmtTime(`2000-01-01T${b.start}`)}–{fmtTime(`2000-01-01T${b.end}`)}
                <button aria-label={`Remove ${DAY_NAMES[b.day]} ${b.start}`} onClick={() => update((s) => { const idx = s.availability.findIndex((x) => x.day === b.day && x.start === b.start && x.end === b.end); if (idx >= 0) s.availability.splice(idx, 1); })} className="rounded-full p-1 text-brand-400 hover:bg-white hover:text-crimson-600"><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Day"><Select value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}>{DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
          <Field label="From"><Input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
          <Field label="To"><Input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
          <Btn variant="secondary" disabled={!valid} icon={<Plus className="h-4 w-4" />} onClick={() => update((s) => { s.availability.push({ ...draft }); })}>Add window</Btn>
          {!valid && <span className="pb-2 text-xs text-crimson-600">End must be after start.</span>}
        </div>
      </div>
    </Card>
  );
}

