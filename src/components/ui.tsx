import React from 'react';
import { X, Star, Inbox } from 'lucide-react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export const LOGO_URL =
  'https://l2lconsultingteam.com/wp-content/uploads/2025/01/cropped-cropped-Link-to-Leadership-300x100.png';

export function Logo({ className = 'h-9' }: { className?: string }) {
  const [broken, setBroken] = React.useState(false);
  if (broken)
    return (
      <span className="font-display text-lg font-extrabold tracking-tight text-brand-800">
        L<span className="text-crimson-600">2</span>L
      </span>
    );
  return <img src={LOGO_URL} alt="L2L — Link to Leadership" className={cx('w-auto object-contain', className)} onError={() => setBroken(true)} />;
}

export function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-brand-100 bg-white shadow-sm', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-brand-50 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-crimson-600">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold text-brand-800">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-brand-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-brand-800 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-brand-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'teal' | 'crimson' | 'green' | 'amber' | 'blue';
const TONES: Record<Tone, string> = {
  neutral: 'bg-brand-50 text-brand-600 ring-brand-100',
  teal: 'bg-brand-100 text-brand-700 ring-brand-200',
  crimson: 'bg-crimson-50 text-crimson-700 ring-crimson-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({ children, tone = 'neutral', className = '' }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
};

export function Btn({ variant = 'primary', size = 'md', icon, className = '', children, type = 'button', ...rest }: BtnProps) {
  const v = {
    primary: 'bg-brand-800 text-white hover:bg-brand-700 focus-visible:ring-brand-300',
    accent: 'bg-crimson-600 text-white hover:bg-crimson-700 focus-visible:ring-crimson-300',
    secondary: 'bg-white text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 focus-visible:ring-brand-300',
    ghost: 'text-brand-600 hover:bg-brand-50 focus-visible:ring-brand-200',
    danger: 'bg-white text-crimson-700 ring-1 ring-inset ring-crimson-200 hover:bg-crimson-50 focus-visible:ring-crimson-200',
  }[variant];
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-bold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        v,
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function Modal({ title, children, onClose, wide = false, footer }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; footer?: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-brand-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-brand-100 px-5 py-3.5">
          <h2 className="font-display text-base font-bold text-brand-800">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-brand-400 hover:bg-brand-50 hover:text-brand-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-brand-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-brand-400">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...p }, ref) => (
  <input ref={ref} className={cx('field', className)} {...p} />
));
Input.displayName = 'Input';
export const Select = ({ className = '', ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx('field', className)} {...p} />;
export const Textarea = ({ className = '', rows = 3, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={rows} className={cx('field resize-y', className)} {...p} />
);

export function Progress({ value, tone = 'teal', className = '' }: { value: number; tone?: 'teal' | 'crimson' | 'green' | 'amber'; className?: string }) {
  const bar = { teal: 'bg-brand-600', crimson: 'bg-crimson-600', green: 'bg-emerald-500', amber: 'bg-amber-500' }[tone];
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-brand-50', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Stacked hours bar: delivered (solid), booked (striped), unbooked (empty). */
export function HoursBar({ usedPct, bookedPct, className = '' }: { usedPct: number; bookedPct: number; className?: string }) {
  return (
    <div className={cx('relative h-3 overflow-hidden rounded-full bg-brand-50', className)} aria-label={`${Math.round(usedPct)}% of hours delivered, ${Math.round(bookedPct)}% booked`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-brand-300/70" style={{ width: `${bookedPct}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-brand-700" style={{ width: `${usedPct}%` }} />
    </div>
  );
}

export function Ring({ pct, size = 88, stroke = 9, children }: { pct: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef6f7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#b21f29" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)} className="transition-all" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Avatar({ name, size = 36, tone = 'teal' }: { name: string; size?: number; tone?: 'teal' | 'crimson' }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white', tone === 'teal' ? 'bg-brand-600' : 'bg-crimson-600')}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Empty({ title, hint, icon, action }: { title: string; hint?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-brand-200">{icon ?? <Inbox className="h-9 w-9" />}</div>
      <p className="font-display text-sm font-bold text-brand-700">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-brand-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'teal', icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'teal' | 'crimson' | 'amber'; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">{label}</p>
        {icon && <span className={tone === 'crimson' ? 'text-crimson-500' : tone === 'amber' ? 'text-amber-500' : 'text-brand-400'}>{icon}</span>}
      </div>
      <p className="mt-1.5 font-display text-3xl font-extrabold text-brand-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-brand-500">{sub}</p>}
    </Card>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; badge?: number }>; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="no-print -mx-1 flex gap-1 overflow-x-auto px-1 pb-px">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-bold transition',
            value === t.id ? 'border-crimson-600 text-brand-800' : 'border-transparent text-brand-400 hover:text-brand-700'
          )}
        >
          {t.label}
          {!!t.badge && <span className="rounded-full bg-crimson-600 px-1.5 text-[10px] font-extrabold text-white">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ id: T; label: string }>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-brand-50 p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={cx('rounded-md px-3 py-1 text-xs font-bold transition', value === o.id ? 'bg-white text-brand-800 shadow-sm' : 'text-brand-400 hover:text-brand-700')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1–N picker used for energy / progress / ratings */
export function Scale({ value, onChange, max = 5, min = 1, labels }: { value: number; onChange: (n: number) => void; max?: number; min?: number; labels?: [string, string] }) {
  return (
    <div>
      <div className="flex gap-1.5" role="radiogroup">
        {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={String(n)}
            onClick={() => onChange(n)}
            className={cx('h-10 min-w-8 flex-1 rounded-lg text-sm font-bold ring-1 ring-inset transition', value === n ? 'bg-brand-800 text-white ring-brand-800' : value >= n ? 'bg-brand-100 text-brand-700 ring-brand-200' : 'bg-white text-brand-400 ring-brand-200 hover:bg-brand-50')}
          >
            {n}
          </button>
        ))}
      </div>
      {labels && (
        <div className="mt-1 flex justify-between text-[11px] text-brand-400">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <div className="inline-flex gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={onChange ? 'hover:scale-110' : 'cursor-default'}>
          <Star style={{ width: size, height: size }} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-brand-200'} />
        </button>
      ))}
    </div>
  );
}

export const SEVERITY_DOT: Record<string, string> = { urgent: 'bg-crimson-600', warn: 'bg-amber-500', info: 'bg-brand-300' };

export function Dl({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-brand-400">{k}</dt>
          <dd className="font-semibold text-brand-800">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export { cx };
