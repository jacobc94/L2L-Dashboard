import { AppState, Engagement, Session } from '../types';
import { nowIso } from './dates';

export interface HoursSummary {
  contracted: number;
  /** Delivered: completed sessions + no-shows that count against hours */
  used: number;
  /** Booked but not yet delivered */
  scheduled: number;
  /** Contracted minus used minus scheduled — what is still unbooked */
  unbooked: number;
  /** Contracted minus used — what is still owed to the client */
  remaining: number;
  usedPct: number;
  bookedPct: number;
}

/** Hours a completed session consumed. Falls back to the scheduled duration if the coach didn't override. */
export const sessionHours = (s: Session): number => s.loggedHours ?? s.durationMin / 60;

export function summarizeHours(engagement: Engagement, sessions: Session[]): HoursSummary {
  const mine = sessions.filter((s) => s.engagementId === engagement.id);
  const used = mine.filter((s) => s.status === 'completed').reduce((t, s) => t + sessionHours(s), 0);
  // A no-show only counts if the coach explicitly logged hours for it
  const noShow = mine.filter((s) => s.status === 'no-show').reduce((t, s) => t + (s.loggedHours ?? 0), 0);
  const delivered = used + noShow;
  const scheduled = mine
    .filter((s) => s.status === 'scheduled' || s.status === 'requested')
    .reduce((t, s) => t + s.durationMin / 60, 0);
  const c = engagement.contractedHours;
  return {
    contracted: c,
    used: delivered,
    scheduled,
    unbooked: Math.max(0, c - delivered - scheduled),
    remaining: Math.max(0, c - delivered),
    usedPct: c > 0 ? Math.min(100, (delivered / c) * 100) : 0,
    bookedPct: c > 0 ? Math.min(100, ((delivered + scheduled) / c) * 100) : 0,
  };
}

/** Sessions the coach should have logged by now (start + duration has passed but still "scheduled"). */
export function unloggedSessions(state: AppState, now = nowIso()): Session[] {
  return state.sessions.filter((s) => {
    if (s.status !== 'scheduled') return false;
    const end = new Date(s.start.replace('T', ' ').replace(/-/g, '/'));
    end.setMinutes(end.getMinutes() + s.durationMin);
    const n = new Date(now.replace('T', ' ').replace(/-/g, '/'));
    return end.getTime() < n.getTime();
  });
}
