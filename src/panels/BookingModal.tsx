import React from 'react';
import { AlertTriangle, CalendarCheck, Clock, Video } from 'lucide-react';
import { Btn, Field, Input, Modal, Select, cx } from '../components/ui';
import { useStore } from '../store';
import { useViewer } from '../hooks';
import { Engagement, Session, SessionMode, SessionType } from '../types';
import { openSlots } from '../utils/slots';
import { DAY_SHORT, fmtDate, fmtHours, fmtTime, parseDate } from '../utils/dates';
import { summarizeHours } from '../utils/hours';
import { bookSession, rescheduleSession } from '../utils/actions';

const CLIENT_TYPES: SessionType[] = ['Kickoff', 'Coaching Session', 'Check-in Call', 'Consultation'];
const STAFF_TYPES: SessionType[] = ['Kickoff', 'Coaching Session', 'Check-in Call', 'Team Session', 'Debrief', 'Wrap-up', 'Consultation'];
const DEFAULT_MIN: Partial<Record<SessionType, number>> = { 'Check-in Call': 30, Consultation: 30, Kickoff: 90, 'Team Session': 180, Debrief: 120, 'Wrap-up': 60 };

export function BookingModal({ engagement, existing, onClose, onDone }: { engagement: Engagement; existing?: Session; onClose: () => void; onDone?: (msg: string) => void }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const coach = state.staff.find((s) => s.id === engagement.coachId)!;
  const isTeam = engagement.type !== 'Executive Coaching';

  const [type, setType] = React.useState<SessionType>(existing?.type ?? (engagement.status === 'Pre-program' ? 'Kickoff' : isTeam && v.isStaff ? 'Team Session' : 'Coaching Session'));
  const [duration, setDuration] = React.useState(existing?.durationMin ?? DEFAULT_MIN[type] ?? state.settings.defaultSessionMinutes);
  const [mode, setMode] = React.useState<SessionMode>(existing?.mode ?? 'Zoom');
  const [location, setLocation] = React.useState(existing?.location ?? '');
  const [slot, setSlot] = React.useState<string>('');
  const [custom, setCustom] = React.useState(false);
  const [customVal, setCustomVal] = React.useState('');
  const [day, setDay] = React.useState<string>('');

  // Existing session shouldn't block its own slot while rescheduling
  const others = React.useMemo(() => state.sessions.filter((s) => s.id !== existing?.id), [state.sessions, existing]);
  const slots = React.useMemo(() => openSlots(coach, others, duration, state.settings), [coach, others, duration, state.settings]);
  const days = React.useMemo(() => [...new Set(slots.map((s) => s.start.slice(0, 10)))], [slots]);
  const activeDay = day && days.includes(day) ? day : days[0];
  const daySlots = slots.filter((s) => s.start.slice(0, 10) === activeDay);

  const hours = summarizeHours(engagement, state.sessions.filter((s) => s.id !== existing?.id));
  const over = duration / 60 > hours.unbooked + 1e-9;
  const chosen = custom ? customVal : slot;
  const types = v.isStaff ? STAFF_TYPES : CLIENT_TYPES.filter((t) => t !== 'Kickoff' || engagement.status === 'Pre-program');
  const approval = v.role === 'client' && state.settings.requireApproval;

  const confirm = () => {
    if (!chosen) return;
    let msg = '';
    mutate((d) => {
      if (existing) {
        rescheduleSession(d, existing.id, chosen, v.role);
        msg = approval ? 'New time requested — your coach will confirm.' : 'Session moved.';
      } else {
        bookSession(d, {
          engagementId: engagement.id, coachId: coach.id, type, mode, start: chosen, durationMin: duration,
          location: mode === 'On-site' ? location || undefined : undefined, requestedBy: v.role === 'client' ? 'client' : 'coach',
        });
        msg = approval ? `Request sent — ${coach.name.split(' ')[0]} will confirm it.` : 'Session booked.';
      }
    });
    onDone?.(msg);
    onClose();
  };

  return (
    <Modal
      title={existing ? 'Reschedule session' : 'Book a session'}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="accent" onClick={confirm} disabled={!chosen || (custom && !customVal)} icon={<CalendarCheck className="h-4 w-4" />}>
            {existing ? (approval ? 'Request new time' : 'Move session') : approval ? 'Request session' : 'Book session'}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {!existing && (
          <Field label="Session type">
            <Select value={type} onChange={(e) => { const t = e.target.value as SessionType; setType(t); setDuration(DEFAULT_MIN[t] ?? state.settings.defaultSessionMinutes); setSlot(''); }}>
              {types.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Length">
          <Select value={duration} onChange={(e) => { setDuration(Number(e.target.value)); setSlot(''); }}>
            {[30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m >= 60 ? `${fmtHours(m / 60)} hr` : `${m} min`}</option>)}
          </Select>
        </Field>
        {!existing && (
          <Field label="Format">
            <Select value={mode} onChange={(e) => setMode(e.target.value as SessionMode)}>
              <option>Zoom</option><option>Phone</option><option>On-site</option>
            </Select>
          </Field>
        )}
      </div>
      {mode === 'On-site' && !existing && (
        <Field label="Location" className="mt-3"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address or room" /></Field>
      )}

      {over && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This is longer than the {fmtHours(hours.unbooked)} unbooked hours left in the agreement. Your coach may suggest adding hours.
        </p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <h4 className="font-display text-sm font-bold">Pick a time with {coach.name.split(' ')[0]}</h4>
        <span className="flex items-center gap-1 text-xs text-brand-400"><Clock className="h-3.5 w-3.5" />{coach.timezone}</span>
      </div>

      {!custom && (
        days.length === 0 ? (
          <p className="mt-3 rounded-lg bg-brand-50 p-4 text-sm text-brand-600">
            No open times in the next {state.settings.bookingWindowDays} days for a {duration}-minute session. Try a shorter length{v.isStaff ? ' or enter a custom time' : ' or message your coach'}.
          </p>
        ) : (
          <>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Day">
              {days.map((dk) => {
                const d = parseDate(dk);
                const active = dk === activeDay;
                return (
                  <button key={dk} role="tab" aria-selected={active} onClick={() => { setDay(dk); setSlot(''); }} className={cx('w-16 shrink-0 rounded-xl border py-2 text-center transition', active ? 'border-brand-800 bg-brand-800 text-white' : 'border-brand-100 bg-white hover:bg-brand-50')}>
                    <div className="text-[10px] font-bold uppercase opacity-70">{DAY_SHORT[d.getDay()]}</div>
                    <div className="font-display text-lg font-extrabold leading-none">{d.getDate()}</div>
                    <div className="text-[10px] opacity-70">{fmtDate(dk, { month: 'short' })}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {daySlots.map((s) => (
                <button key={s.start} onClick={() => setSlot(s.start)} aria-pressed={slot === s.start} className={cx('rounded-lg border py-2 text-sm font-bold transition', slot === s.start ? 'border-crimson-600 bg-crimson-600 text-white' : 'border-brand-100 bg-white text-brand-700 hover:border-brand-300')}>
                  {fmtTime(s.start)}
                </button>
              ))}
            </div>
          </>
        )
      )}

      {v.isStaff && (
        <div className="mt-4 border-t border-brand-50 pt-3">
          <label className="flex items-center gap-2 text-sm text-brand-600">
            <input type="checkbox" checked={custom} onChange={(e) => { setCustom(e.target.checked); setSlot(''); }} className="h-4 w-4 rounded border-brand-300 accent-brand-700" />
            Enter a custom date & time (outside normal availability)
          </label>
          {custom && <Input type="datetime-local" className="mt-2 max-w-xs" value={customVal} onChange={(e) => setCustomVal(e.target.value)} />}
        </div>
      )}

      {approval && (
        <p className="mt-4 flex items-start gap-2 text-xs text-brand-500"><Video className="mt-0.5 h-3.5 w-3.5 shrink-0" />Requests are held until your coach confirms. You'll see the status on your Sessions page.</p>
      )}
    </Modal>
  );
}

