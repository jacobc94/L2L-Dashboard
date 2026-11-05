// All dates are local wall-clock strings: "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm".
// Parsing builds Dates from parts so there is no UTC shift.

const pad = (n: number) => String(n).padStart(2, '0');

let nowOverride: Date | null = null;
/** Test hook */
export const setNow = (d: Date | null) => {
  nowOverride = d;
};
let businessTz: string | null = null;
/** All wall-clock times in the app are in this IANA zone (e.g. "America/Los_Angeles"), whatever the device's zone. */
export const setBusinessTimezone = (tz: string | null) => {
  businessTz = tz;
};

/** "Now" as a Date whose *local* fields read as the wall-clock time in the business timezone. */
export const getNow = () => {
  if (nowOverride) return new Date(nowOverride);
  const real = new Date();
  if (!businessTz) return real;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: businessTz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(real).map((p) => [p.type, p.value])
    );
    return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  } catch {
    return real;
  }
};

export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toIsoDateTime = (d: Date) => `${toIsoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const todayIso = () => toIsoDate(getNow());
export const nowIso = () => toIsoDateTime(getNow());

export const parseDate = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const parseDateTime = (s: string): Date => {
  const [datePart, timePart = '00:00'] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

export const addDays = (iso: string, n: number): string => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

export const addMinutes = (iso: string, n: number): string => {
  const d = parseDateTime(iso);
  d.setMinutes(d.getMinutes() + n);
  return toIsoDateTime(d);
};

export const diffDays = (a: string, b: string) =>
  Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);

export const hoursUntil = (iso: string, from: Date = getNow()) =>
  (parseDateTime(iso).getTime() - from.getTime()) / 3600000;

/** Monday of the week containing `iso` */
export const weekStart = (iso: string): string => {
  const d = parseDate(iso);
  const dow = d.getDay(); // 0 Sun
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return toIsoDate(d);
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  parseDate(iso).toLocaleDateString('en-US', opts);

export const fmtDateLong = (iso: string) =>
  parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export const fmtTime = (iso: string) =>
  parseDateTime(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const fmtDateTime = (iso: string) =>
  `${parseDateTime(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(iso)}`;

export const fmtRelativeDay = (iso: string): string => {
  const diff = diffDays(iso.slice(0, 10), todayIso());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return DAY_NAMES[parseDate(iso).getDay()];
  return fmtDate(iso);
};

export const fmtHours = (h: number) => {
  const r = Math.round(h * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};
