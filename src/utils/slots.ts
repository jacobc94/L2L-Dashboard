import { Session, Settings, Staff } from '../types';
import { addDays, addMinutes, getNow, hoursUntil, parseDate, toIsoDate } from './dates';

export interface Slot {
  /** YYYY-MM-DDTHH:mm */
  start: string;
  coachId: string;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const overlaps = (aStart: string, aDur: number, bStart: string, bDur: number) => {
  const a1 = aStart;
  const a2 = addMinutes(aStart, aDur);
  const b1 = bStart;
  const b2 = addMinutes(bStart, bDur);
  return a1 < b2 && b1 < a2; // ISO strings of equal length compare chronologically
};

/**
 * Open slots for a coach over the booking window.
 * A slot is offered every 30 minutes inside an availability block as long as the whole session fits
 * and does not collide with an existing scheduled/requested session.
 */
export function openSlots(
  coach: Staff,
  sessions: Session[],
  durationMin: number,
  settings: Pick<Settings, 'bookingWindowDays' | 'minNoticeHours'>,
  from: Date = getNow()
): Slot[] {
  const busy = sessions.filter(
    (s) => s.coachId === coach.id && (s.status === 'scheduled' || s.status === 'requested')
  );
  const out: Slot[] = [];
  const startDay = toIsoDate(from);
  for (let i = 0; i <= settings.bookingWindowDays; i++) {
    const day = addDays(startDay, i);
    const dow = parseDate(day).getDay();
    for (const block of coach.availability.filter((b) => b.day === dow)) {
      for (let t = toMin(block.start); t + durationMin <= toMin(block.end); t += 30) {
        const start = `${day}T${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        if (hoursUntil(start, from) < settings.minNoticeHours) continue;
        if (busy.some((s) => overlaps(start, durationMin, s.start, s.durationMin))) continue;
        out.push({ start, coachId: coach.id });
      }
    }
  }
  return out;
}

export const slotDayKey = (slot: Slot) => slot.start.slice(0, 10);

