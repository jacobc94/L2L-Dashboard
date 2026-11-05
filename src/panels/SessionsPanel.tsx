import React from 'react';
import { CalendarPlus, CheckCircle2, ClipboardEdit, Clock, Download, ExternalLink, MapPin, MessageSquareQuote, Phone, Video, XCircle, Lock, Building2 } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, HoursBar, Modal, Ring, Stars, Textarea, Field } from '../components/ui';
import { useStore } from '../store';
import { useDirectory, useViewer } from '../hooks';
import { Engagement, Session } from '../types';
import { summarizeHours, sessionHours } from '../utils/hours';
import { fmtDate, fmtDateTime, fmtHours, hoursUntil, nowIso, parseDateTime } from '../utils/dates';
import { buildIcs, downloadFile, googleCalendarUrl } from '../utils/ics';
import { rateSession, setSessionStatus } from '../utils/actions';
import { BookingModal } from './BookingModal';
import { LogSessionModal } from './LogSessionModal';

const MODE_ICON = { Zoom: Video, Phone: Phone, 'On-site': Building2 } as const;

export function HoursSummaryCard({ engagement }: { engagement: Engagement }) {
  const { state } = useStore();
  const h = summarizeHours(engagement, state.sessions);
  return (
    <Card>
      <CardHeader title="Coaching hours" subtitle={`${fmtDate(engagement.startDate)} – ${fmtDate(engagement.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`} icon={<Clock className="h-5 w-5" />} />
      <div className="flex flex-wrap items-center gap-6 p-5">
        <Ring pct={h.usedPct}>
          <div>
            <div className="font-display text-xl font-extrabold leading-none">{fmtHours(h.used)}</div>
            <div className="text-[10px] font-bold uppercase text-brand-400">of {fmtHours(h.contracted)} hrs</div>
          </div>
        </Ring>
        <div className="min-w-[220px] flex-1">
          <HoursBar usedPct={h.usedPct} bookedPct={h.bookedPct} />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div><div className="font-display text-lg font-extrabold text-brand-700">{fmtHours(h.used)}</div><div className="text-[11px] text-brand-400"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-700" />Delivered</div></div>
            <div><div className="font-display text-lg font-extrabold text-brand-500">{fmtHours(h.scheduled)}</div><div className="text-[11px] text-brand-400"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-300" />Booked</div></div>
            <div><div className="font-display text-lg font-extrabold text-brand-800">{fmtHours(h.unbooked)}</div><div className="text-[11px] text-brand-400"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-100 ring-1 ring-brand-200" />Unbooked</div></div>
          </div>
        </div>
      </div>
    </Card>
  );
}

const statusBadge = (s: Session) =>
  s.status === 'requested' ? <Badge tone="amber">Awaiting confirmation</Badge>
  : s.status === 'scheduled' ? <Badge tone="green">Confirmed</Badge>
  : s.status === 'completed' ? <Badge tone="blue">Completed</Badge>
  : s.status === 'no-show' ? <Badge tone="crimson">No-show</Badge>
  : <Badge>Cancelled</Badge>;

export function SessionsPanel({ engagement }: { engagement: Engagement }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const [booking, setBooking] = React.useState<Session | 'new' | null>(null);
  const [logging, setLogging] = React.useState<Session | 'new' | null>(null);
  const [rating, setRating] = React.useState<Session | null>(null);
  const [cancelling, setCancelling] = React.useState<Session | null>(null);
  const [toast, setToast] = React.useState('');

  const all = state.sessions.filter((s) => s.engagementId === engagement.id);
  const now = nowIso();
  const upcoming = all.filter((s) => (s.status === 'scheduled' || s.status === 'requested')).sort((a, b) => a.start.localeCompare(b.start));
  const past = all.filter((s) => s.status === 'completed' || s.status === 'no-show' || s.status === 'cancelled').sort((a, b) => b.start.localeCompare(a.start));
  const coach = dir.staff(engagement.coachId);
  const canBook = engagement.status !== 'Completed';
  const titleFor = (s: Session) => `L2L ${s.type} with ${coach?.name.split(' ')[0] ?? 'coach'}`;

  const addToCal = (list: Session[]) => downloadFile('l2l-sessions.ics', buildIcs(list, titleFor), 'text/calendar');

  return (
    <div className="space-y-5">
      {toast && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">{toast}</div>}
      <HoursSummaryCard engagement={engagement} />

      <Card>
        <CardHeader
          title="Upcoming"
          subtitle={coach ? `With ${coach.name} · ${coach.timezone}` : undefined}
          icon={<CalendarPlus className="h-5 w-5" />}
          action={
            <div className="flex gap-2">
              {upcoming.length > 0 && <Btn size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => addToCal(upcoming)}>.ics</Btn>}
              {v.isStaff && canBook && <Btn size="sm" variant="secondary" icon={<ClipboardEdit className="h-3.5 w-3.5" />} onClick={() => setLogging('new')}>Log past session</Btn>}
              {canBook && <Btn size="sm" variant="accent" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setBooking('new')}>Book</Btn>}
            </div>
          }
        />
        {upcoming.length === 0 ? (
          <Empty title="Nothing on the calendar" hint={canBook ? 'Book your next session while there are open times.' : 'This engagement is complete.'} />
        ) : (
          <ul className="divide-y divide-brand-50">
            {upcoming.map((s) => {
              const Icon = MODE_ICON[s.mode];
              const pastDue = s.start < now;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <div className="w-14 shrink-0 rounded-xl bg-brand-50 py-1.5 text-center">
                    <div className="text-[10px] font-bold uppercase text-crimson-600">{fmtDate(s.start, { month: 'short' })}</div>
                    <div className="font-display text-xl font-extrabold leading-none">{parseDateTime(s.start).getDate()}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{s.type}</span> {statusBadge(s)}
                      {pastDue && v.isStaff && <Badge tone="crimson">Needs log</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-brand-500">
                      <span>{fmtDateTime(s.start)} · {s.durationMin} min</span>
                      <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{s.mode}</span>
                      {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.status === 'requested' && v.isStaff && (
                      <Btn size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => mutate((d) => setSessionStatus(d, s.id, 'scheduled'))}>Confirm</Btn>
                    )}
                    {pastDue && v.isStaff && s.status === 'scheduled' && <Btn size="sm" variant="accent" onClick={() => setLogging(s)}>Log session</Btn>}
                    {s.status === 'scheduled' && !pastDue && (
                      <>
                        <a className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-600 ring-1 ring-inset ring-brand-200 hover:bg-brand-50" href={googleCalendarUrl(s, titleFor(s))} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />Google Cal
                        </a>
                        <Btn size="sm" variant="secondary" onClick={() => addToCal([s])} icon={<Download className="h-3.5 w-3.5" />}>.ics</Btn>
                      </>
                    )}
                    {!pastDue && <Btn size="sm" variant="secondary" onClick={() => setBooking(s)}>Reschedule</Btn>}
                    {!pastDue && <Btn size="sm" variant="danger" onClick={() => setCancelling(s)}>{s.status === 'requested' && v.isStaff ? 'Decline' : 'Cancel'}</Btn>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Session history" subtitle="Summaries and next-step focus from each session" icon={<MessageSquareQuote className="h-5 w-5" />} />
        {past.length === 0 ? (
          <Empty title="No sessions yet" hint="After each session your coach will post hours, a summary and your next focus here." />
        ) : (
          <ul className="divide-y divide-brand-50">
            {past.map((s) => (
              <li key={s.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{s.type}</span> {statusBadge(s)}
                    <span className="text-xs text-brand-500">{fmtDateTime(s.start)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(s.status === 'completed' || s.status === 'no-show') && <Badge tone="teal">{fmtHours(sessionHours(s))} hr logged</Badge>}
                    {v.isStaff && (s.status === 'completed' || s.status === 'no-show') && <Btn size="sm" variant="ghost" onClick={() => setLogging(s)}>Edit log</Btn>}
                  </div>
                </div>
                {s.cancelReason && <p className="mt-1 text-xs text-brand-500">Reason: {s.cancelReason}</p>}
                {s.summary && <p className="mt-2 text-sm leading-relaxed text-brand-700">{s.summary}</p>}
                {s.nextFocus && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700"><span className="font-bold text-crimson-700">Next focus: </span>{s.nextFocus}</p>
                )}
                {v.isStaff && s.privateNotes && (
                  <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><span className="font-bold">Private: </span>{s.privateNotes}</span></p>
                )}
                {s.status === 'completed' && (
                  <div className="mt-2 flex items-center gap-2">
                    {s.clientRating ? (
                      <><Stars value={s.clientRating} size={14} />{s.clientReflection && <span className="text-xs italic text-brand-500">"{s.clientReflection}"</span>}</>
                    ) : v.role === 'client' ? (
                      <Btn size="sm" variant="secondary" onClick={() => setRating(s)}>Rate this session</Btn>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {booking && <BookingModal engagement={engagement} existing={booking === 'new' ? undefined : booking} onClose={() => setBooking(null)} onDone={(m) => { setToast(m); setTimeout(() => setToast(''), 5000); }} />}
      {logging && <LogSessionModal engagement={engagement} session={logging === 'new' ? undefined : logging} onClose={() => setLogging(null)} />}
      {rating && <RateModal session={rating} onClose={() => setRating(null)} />}
      {cancelling && <CancelModal session={cancelling} engagement={engagement} onClose={() => setCancelling(null)} />}
    </div>
  );
}

function RateModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { mutate } = useStore();
  const [r, setR] = React.useState(5);
  const [t, setT] = React.useState('');
  return (
    <Modal title="How was this session?" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Not now</Btn><Btn variant="accent" onClick={() => { mutate((d) => rateSession(d, session.id, r, t)); onClose(); }}>Submit</Btn></>}>
      <p className="mb-3 text-sm text-brand-500">{session.type} · {fmtDateTime(session.start)}</p>
      <Stars value={r} onChange={setR} size={30} />
      <Field label="One thing that stood out (optional)" className="mt-4"><Textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} /></Field>
    </Modal>
  );
}

function CancelModal({ session, engagement, onClose }: { session: Session; engagement: Engagement; onClose: () => void }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const [reason, setReason] = React.useState('');
  const late = hoursUntil(session.start) < state.settings.cancellationHours && session.status === 'scheduled';
  return (
    <Modal
      title={session.status === 'requested' && v.isStaff ? 'Decline request' : 'Cancel session'}
      onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Keep it</Btn><Btn variant="danger" onClick={() => { mutate((d) => setSessionStatus(d, session.id, 'cancelled', reason || undefined)); onClose(); }}>Cancel session</Btn></>}
    >
      <p className="text-sm text-brand-600">{session.type} · {fmtDateTime(session.start)}</p>
      {late && v.role === 'client' && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          This is inside the {state.settings.cancellationHours}-hour notice window in your agreement, so your coach may count this session against your hours. Consider messaging {engagement.coachId ? 'your coach' : 'us'} first.
        </p>
      )}
      <Field label="Reason (optional)" className="mt-4"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
