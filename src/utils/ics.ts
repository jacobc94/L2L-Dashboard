import { Session } from '../types';
import { addMinutes } from './dates';

const stamp = (iso: string) => iso.replace(/[-:]/g, '') + '00';
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Floating local times — calendar apps place them in the viewer's own timezone. */
export function buildIcs(sessions: Session[], titleFor: (s: Session) => string, calName = 'L2L Coaching'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//L2L Consulting Team//Coaching Portal//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calName)}`,
  ];
  for (const s of sessions) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@l2l-coaching-portal`,
      `DTSTAMP:${stamp(s.start)}`,
      `DTSTART:${stamp(s.start)}`,
      `DTEND:${stamp(addMinutes(s.start, s.durationMin))}`,
      `SUMMARY:${esc(titleFor(s))}`,
      `DESCRIPTION:${esc(`${s.type} (${s.mode})${s.summary ? '\n' + s.summary : ''}`)}`,
      ...(s.location ? [`LOCATION:${esc(s.location)}`] : []),
      `STATUS:${s.status === 'requested' ? 'TENTATIVE' : 'CONFIRMED'}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Coaching session tomorrow',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function googleCalendarUrl(s: Session, title: string): string {
  const f = (iso: string) => iso.replace(/[-:]/g, '') + '00';
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${f(s.start)}/${f(addMinutes(s.start, s.durationMin))}`,
    details: `${s.type} (${s.mode})`,
    ...(s.location ? { location: s.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
