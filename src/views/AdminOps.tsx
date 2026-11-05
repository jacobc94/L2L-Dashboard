import React from 'react';
import { Bell, CheckCheck, Copy, Download, ExternalLink, FileSignature, KeyRound, Mail, Plus, RotateCcw, Send, Trash2, Upload } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, Field, Input, PageHeader, SEVERITY_DOT, Select, Stat, Tabs, Textarea, cx } from '../components/ui';
import { go, useStore } from '../store';
import { STATUS_TONE, useDirectory, useMyEngagements, useViewer } from '../hooks';
import { AppState, ContractStatus, OutboxEmail } from '../types';
import { summarizeHours } from '../utils/hours';
import { fmtDate, fmtHours, nowIso } from '../utils/dates';
import { deriveReminders, queueDueEmails, queueWeeklyDigests, staffHref } from '../utils/reminders';
import { toCsv } from '../utils/csv';
import { downloadFile } from '../utils/ics';
import { uid } from '../utils/id';
import { api, ApiError } from '../api';
import { STATE_VERSION } from '../data/seed';

// ───────────────────────── Contracts ─────────────────────────
export function ContractsPage() {
  const { state, mutate } = useStore();
  const dir = useDirectory();
  const [f, setF] = React.useState<'all' | ContractStatus>('all');
  const rows = state.contracts.filter((c) => f === 'all' || c.status === f);
  const signedValue = state.contracts.filter((c) => c.status === 'signed').reduce((t, c) => t + (c.fee ?? 0), 0);
  const pendingValue = state.contracts.filter((c) => c.status === 'sent').reduce((t, c) => t + (c.fee ?? 0), 0);
  const count = (s: ContractStatus) => state.contracts.filter((c) => c.status === s).length;

  const nudge = (engagementId: string) => mutate((d) => {
    const e = d.engagements.find((x) => x.id === engagementId); const c = e && d.clients.find((x) => x.id === e.clientIds[0]);
    if (!e || !c) return;
    d.outbox.unshift({ id: uid('em'), kind: 'contract-reminder', toName: c.name, toEmail: c.email, createdAt: nowIso(), status: 'queued', subject: 'Please review and sign your coaching agreement', body: `Hi ${c.name.split(' ')[0]},\n\nYour coaching agreement is ready for your review and signature. It takes a couple of minutes.\n\nOpen your portal: ${window.location.origin}/#/contract\n\n— ${d.settings.orgName}\n${d.settings.phone}` });
  });

  return (
    <>
      <PageHeader title="Contracts" subtitle="Every coaching agreement and where it stands." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Drafts" value={count('draft')} /><Stat label="Awaiting signature" value={count('sent')} tone={count('sent') ? 'amber' : 'teal'} sub={pendingValue ? `$${pendingValue.toLocaleString()} pending` : undefined} />
        <Stat label="Signed" value={count('signed')} sub={signedValue ? `$${signedValue.toLocaleString()} contracted` : undefined} /><Stat label="Void" value={count('void')} />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">{(['all', 'draft', 'sent', 'signed', 'void'] as const).map((s) => <button key={s} onClick={() => setF(s)} className={cx('rounded-full px-3 py-1.5 text-xs font-bold capitalize ring-1 ring-inset', f === s ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-brand-600 ring-brand-200 hover:bg-brand-50')}>{s === 'sent' ? 'Awaiting signature' : s}</button>)}</div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <Empty title="No contracts" icon={<FileSignature className="h-9 w-9" />} /> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-brand-100 text-left text-[11px] font-bold uppercase tracking-wide text-brand-400"><th className="px-5 py-3">Engagement</th><th>Status</th><th>Hours</th><th>Fee</th><th>Sent</th><th>Signed</th><th className="pr-5 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-brand-50">
              {rows.map((c) => {
                const e = state.engagements.find((x) => x.id === c.engagementId);
                return (
                  <tr key={c.id} className="hover:bg-brand-50/50">
                    <td className="px-5 py-3"><button className="text-left font-bold hover:text-crimson-700" onClick={() => go(`/engagements/${c.engagementId}/contract`)}>{e ? dir.label(e) : '—'}</button><div className="text-xs text-brand-400">{e && dir.org(e.orgId)?.name}</div></td>
                    <td><Badge tone={c.status === 'signed' ? 'green' : c.status === 'sent' ? 'amber' : c.status === 'void' ? 'neutral' : 'blue'}>{c.status === 'sent' ? 'Awaiting' : c.status}</Badge></td>
                    <td>{fmtHours(c.totalHours)}</td><td>{c.fee != null ? `$${c.fee.toLocaleString()}` : '—'}</td>
                    <td className="text-brand-500">{c.sentAt ? fmtDate(c.sentAt) : '—'}</td><td className="text-brand-500">{c.signedAt ? <>{fmtDate(c.signedAt)}<div className="text-xs">{c.signedByName}</div></> : '—'}</td>
                    <td className="pr-5 text-right">{c.status === 'sent' && <Btn size="sm" variant="secondary" icon={<Bell className="h-3.5 w-3.5" />} onClick={() => nudge(c.engagementId)}>Queue nudge</Btn>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ───────────────────────── Hours & billing ─────────────────────────
export function HoursPage() {
  const { state } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const engs = useMyEngagements();
  const [month, setMonth] = React.useState('all');
  const ids = new Set(engs.map((e) => e.id));
  const rows = engs.map((e) => ({ e, h: summarizeHours(e, state.sessions), c: state.contracts.find((c) => c.engagementId === e.id && c.status !== 'void') }));
  const tot = rows.reduce((t, r) => ({ contracted: t.contracted + r.h.contracted, used: t.used + r.h.used, sched: t.sched + r.h.scheduled, fee: t.fee + (r.c?.status === 'signed' ? r.c.fee ?? 0 : 0) }), { contracted: 0, used: 0, sched: 0, fee: 0 });
  const ledger = state.sessions.filter((s) => ids.has(s.engagementId) && (s.status === 'completed' || s.status === 'no-show') && (month === 'all' || s.start.startsWith(month))).sort((a, b) => b.start.localeCompare(a.start));
  const months = [...new Set(state.sessions.filter((s) => ids.has(s.engagementId) && (s.status === 'completed' || s.status === 'no-show')).map((s) => s.start.slice(0, 7)))].sort().reverse();
  const hoursOf = (s: (typeof ledger)[number]) => s.loggedHours ?? s.durationMin / 60;
  const ledgerTotal = ledger.reduce((t, s) => t + hoursOf(s), 0);

  const exportCsv = () => downloadFile(`l2l-hours-ledger${month === 'all' ? '' : '-' + month}.csv`, toCsv([
    ['Date', 'Client / Program', 'Organization', 'Coach', 'Type', 'Status', 'Hours'],
    ...ledger.map((s) => { const e = state.engagements.find((x) => x.id === s.engagementId)!; return [s.start.slice(0, 10), dir.label(e), dir.org(e.orgId)?.name, dir.staff(s.coachId)?.name, s.type, s.status, hoursOf(s)]; }),
  ]), 'text/csv');

  return (
    <>
      <PageHeader title={v.isAdmin ? 'Hours & Billing' : 'Hours'} subtitle="Contracted vs. delivered hours, and a ledger you can export for invoicing." actions={<Btn variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Export ledger CSV</Btn>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Contracted hours" value={fmtHours(tot.contracted)} /><Stat label="Delivered" value={fmtHours(tot.used)} sub={tot.contracted ? `${Math.round((tot.used / tot.contracted) * 100)}% of contracted` : undefined} /><Stat label="Booked ahead" value={fmtHours(tot.sched)} /><Stat label="Signed contract value" value={`$${tot.fee.toLocaleString()}`} sub="from signed agreements" />
      </div>
      <Card className="mb-5 overflow-x-auto">
        <CardHeader title="By engagement" />
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-brand-100 text-left text-[11px] font-bold uppercase tracking-wide text-brand-400"><th className="px-5 py-3">Engagement</th><th>Status</th><th className="text-right">Contracted</th><th className="text-right">Delivered</th><th className="text-right">Booked</th><th className="text-right">Remaining</th><th className="pr-5 text-right">Used</th></tr></thead>
          <tbody className="divide-y divide-brand-50">
            {rows.map(({ e, h }) => (
              <tr key={e.id} className="hover:bg-brand-50/50">
                <td className="px-5 py-3"><button className="text-left font-bold hover:text-crimson-700" onClick={() => go(`/engagements/${e.id}/sessions`)}>{dir.label(e)}</button><div className="text-xs text-brand-400">{dir.staff(e.coachId)?.name}</div></td>
                <td><Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge></td>
                <td className="text-right">{fmtHours(h.contracted)}</td><td className="text-right font-bold">{fmtHours(h.used)}</td><td className="text-right text-brand-500">{fmtHours(h.scheduled)}</td><td className="text-right">{fmtHours(h.remaining)}</td>
                <td className={cx('pr-5 text-right font-bold', h.usedPct >= state.settings.lowHoursThreshold * 100 && e.status === 'Active' ? 'text-crimson-600' : '')}>{Math.round(h.usedPct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto">
        <CardHeader title="Session ledger" subtitle={`${ledger.length} delivered session${ledger.length === 1 ? '' : 's'} · ${fmtHours(ledgerTotal)} hours`} action={<Select className="w-auto" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}><option value="all">All time</option>{months.map((m) => <option key={m} value={m}>{new Date(m + '-01T00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</option>)}</Select>} />
        {ledger.length === 0 ? <Empty title="No delivered sessions in this period" /> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-brand-100 text-left text-[11px] font-bold uppercase tracking-wide text-brand-400"><th className="px-5 py-3">Date</th><th>Client / program</th><th>Coach</th><th>Type</th><th className="pr-5 text-right">Hours</th></tr></thead>
            <tbody className="divide-y divide-brand-50">
              {ledger.map((s) => { const e = state.engagements.find((x) => x.id === s.engagementId)!; return (
                <tr key={s.id}><td className="px-5 py-2.5 text-brand-500">{fmtDate(s.start, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td className="font-semibold">{dir.label(e)}</td><td className="text-brand-500">{dir.staff(s.coachId)?.name.split(' ')[0]}</td><td>{s.type}{s.status === 'no-show' && <Badge tone="crimson" className="ml-2">no-show</Badge>}</td><td className="pr-5 text-right font-bold">{fmtHours(hoursOf(s))}</td></tr>
              ); })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ───────────────────────── Reminders & email ─────────────────────────
type RTab = 'reminders' | 'outbox';

export function RemindersPage() {
  const { state, mutate, reminders, myReminders, mode, canEmail, refresh } = useStore();
  const v = useViewer();
  const engs = useMyEngagements();
  const [tab, setTab] = React.useState<RTab>('reminders');
  const [sendMsg, setSendMsg] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [scan, setScan] = React.useState<string>('');
  const [scope, setScope] = React.useState<'mine' | 'all'>(v.isAdmin ? 'all' : 'mine');
  const list = scope === 'all' && v.isAdmin ? reminders : myReminders;

  // Coaches only see mail addressed to their own clients (or themselves)
  const visible = new Set<string>([v.person.email]);
  engs.forEach((e) => e.clientIds.forEach((id) => { const c = state.clients.find((x) => x.id === id); if (c) visible.add(c.email); }));
  const outbox = state.outbox.filter((o) => v.isAdmin || visible.has(o.toEmail));
  const queued = outbox.filter((o) => o.status === 'queued');
  const sendAll = async () => {
    setSending(true); setSendMsg('');
    try {
      const { data } = await api<{ results: Array<{ id: string; ok: boolean; error?: string }> }>('email/send', { body: { ids: queued.slice(0, 100).map((o) => o.id) } });
      const ok = data.results.filter((r) => r.ok).length; const bad = data.results.filter((r) => !r.ok);
      setSendMsg(`Sent ${ok} email${ok === 1 ? '' : 's'}${bad.length ? `; ${bad.length} failed (${bad[0].error})` : ''}.`);
      await refresh();
    } catch (e) { setSendMsg(e instanceof ApiError ? e.message : 'Could not reach the server.'); }
    setSending(false);
  };

  return (
    <>
      <PageHeader title={v.isAdmin ? 'Reminders & Email' : 'Reminders'} subtitle="What the portal is nudging people about, and the emails waiting to go out." />
      <div className="mb-5 border-b border-brand-100"><Tabs<RTab> value={tab} onChange={setTab} tabs={[{ id: 'reminders', label: 'Reminders', badge: list.filter((r) => r.severity !== 'info').length }, { id: 'outbox', label: 'Email outbox', badge: queued.length }]} /></div>

      {tab === 'reminders' && (
        <Card>
          <CardHeader title={scope === 'all' ? 'Everyone' : 'For you'} subtitle="Generated live from sessions, tasks, contracts, check-ins and hours. They clear themselves when the thing is done."
            action={v.isAdmin && <div className="inline-flex rounded-lg bg-brand-50 p-0.5">{(['all', 'mine'] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={cx('rounded-md px-3 py-1 text-xs font-bold', scope === s ? 'bg-white shadow-sm' : 'text-brand-400')}>{s === 'all' ? 'Everyone' : 'Mine'}</button>)}</div>} />
          {list.length === 0 ? <Empty title="No reminders" hint="Everything is on track." /> : (
            <ul className="divide-y divide-brand-50">
              {list.map((r) => {
                const who = r.audience.role === 'client' ? state.clients.find((c) => c.id === r.audience.id)?.name : r.audience.role === 'coach' ? state.staff.find((s) => s.id === r.audience.id)?.name : 'Admins';
                return (
                  <li key={r.key}><button onClick={() => go(v.isStaff ? staffHref(r) : r.href)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-brand-50">
                    <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY_DOT[r.severity])} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{r.title}</span><span className="block truncate text-xs text-brand-500">{r.detail}</span></span>
                    <Badge tone={r.audience.role === 'client' ? 'crimson' : r.audience.role === 'coach' ? 'teal' : 'blue'}>{who}</Badge>
                    {r.email && <Mail className="h-4 w-4 text-brand-300" aria-label="Will email" />}
                  </button></li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'outbox' && (
        <div className="space-y-4">
          {mode === 'cloud' && canEmail ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>Email is connected.</b> Press <b>Send</b> on any queued email (or <b>Send all</b>). Reminder emails can also go out automatically — turn that on in Settings.</div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <b>Heads up:</b> {mode === 'cloud' ? 'email sending isn\'t configured on the server yet (RESEND_API_KEY and MAIL_FROM), so' : 'this demo can <u>queue</u> emails but can\'t deliver them — a browser can\'t send mail securely, so'} use <b>Open in email app</b> for now. See the README.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="primary" icon={<Bell className="h-4 w-4" />} onClick={() => { let n = 0; mutate((d) => { n = queueDueEmails(d, deriveReminders(d)); }); setScan(n ? `Queued ${n} new reminder email${n === 1 ? '' : 's'}.` : 'No new reminder emails are due.'); }}>Scan reminders & queue emails</Btn>
            {v.isAdmin && <Btn variant="secondary" icon={<Send className="h-4 w-4" />} onClick={() => { let n = 0; mutate((d) => { n = queueWeeklyDigests(d); }); setScan(n ? `Queued ${n} weekly digest${n === 1 ? '' : 's'}.` : 'This week\'s digests are already queued.'); }}>Queue weekly digests</Btn>}
            {mode === 'cloud' && canEmail && queued.length > 0 && <Btn variant="accent" disabled={sending} icon={<Send className="h-4 w-4" />} onClick={sendAll}>{sending ? 'Sending…' : `Send all (${Math.min(queued.length, 100)})`}</Btn>}
            {(scan || sendMsg) && <span role="status" className="text-sm font-semibold text-emerald-700">{sendMsg || scan}</span>}
          </div>
          <Card>
            <CardHeader title={`Outbox (${queued.length} queued)`} icon={<Mail className="h-5 w-5" />} />
            {outbox.length === 0 ? <Empty title="Outbox is empty" hint="Scan reminders to queue the ones that are due." /> : (
              <ul className="divide-y divide-brand-50">{outbox.map((o) => <OutboxRow key={o.id} mail={o} />)}</ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function OutboxRow({ mail }: { mail: OutboxEmail }) {
  const { mutate, mode, canEmail, refresh } = useStore();
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const mailto = `mailto:${encodeURIComponent(mail.toEmail)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
  const setStatus = (status: OutboxEmail['status']) => mutate((d) => { const m = d.outbox.find((x) => x.id === mail.id); if (m) { m.status = status; m.sentAt = status === 'sent' ? nowIso() : undefined; } });
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="block truncate text-sm font-bold">{mail.subject}</span>
          <span className="block truncate text-xs text-brand-500">To {mail.toName} &lt;{mail.toEmail}&gt; · {fmtDate(mail.createdAt)}</span>
        </button>
        <Badge tone={mail.status === 'queued' ? 'amber' : mail.status === 'sent' ? 'green' : 'neutral'}>{mail.status}</Badge>
        {mail.status === 'queued' && (
          <div className="flex gap-1.5">
            {mode === 'cloud' && canEmail && <Btn size="sm" variant="accent" disabled={busy} icon={<Send className="h-3.5 w-3.5" />} onClick={async () => {
              setBusy(true); setErr('');
              try {
                const { data } = await api<{ results: Array<{ ok: boolean; error?: string }> }>('email/send', { body: { ids: [mail.id] } });
                if (!data.results[0]?.ok) setErr(data.results[0]?.error ?? 'Not sent.');
                await refresh();
              } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not reach the server.'); }
              setBusy(false);
            }}>{busy ? 'Sending…' : 'Send'}</Btn>}
            <a href={mailto} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${mode === 'cloud' && canEmail ? 'text-brand-600 ring-1 ring-inset ring-brand-200 hover:bg-brand-50' : 'bg-crimson-600 text-white hover:bg-crimson-700'}`}><ExternalLink className="h-3.5 w-3.5" />Open in email app</a>
            <Btn size="sm" variant="secondary" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => setStatus('sent')}>Mark sent</Btn>
            <Btn size="sm" variant="ghost" aria-label="Dismiss" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setStatus('dismissed')} />
          </div>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-xs font-semibold text-crimson-700">{err}</p>}
      {open && (
        <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm">
          <pre className="whitespace-pre-wrap font-sans text-brand-700">{mail.body}</pre>
          <Btn size="sm" variant="ghost" className="mt-2" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { navigator.clipboard?.writeText(`Subject: ${mail.subject}\n\n${mail.body}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? 'Copied' : 'Copy text'}</Btn>
        </div>
      )}
    </li>
  );
}

// ───────────────────────── Settings ─────────────────────────
export function SettingsPage() {
  const { state, mutate, resetDemo, mode } = useStore();
  const [s, setS] = React.useState(state.settings);
  const [saved, setSaved] = React.useState(false);
  const [importMsg, setImportMsg] = React.useState('');
  const num = (k: 'bookingWindowDays' | 'minNoticeHours' | 'cancellationHours' | 'sessionReminderHours' | 'defaultSessionMinutes') => (
    <Input type="number" min={0} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
  );

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<AppState>;
      const keys: Array<keyof AppState> = ['settings', 'staff', 'orgs', 'clients', 'engagements', 'preTasks', 'contracts', 'sessions', 'checkIns', 'actions', 'messages', 'outbox', 'resources'];
      if (data.version !== STATE_VERSION || keys.some((k) => data[k] == null)) throw new Error('This file is not an L2L portal backup.');
      if (!window.confirm('Replace ALL current data with this backup? This cannot be undone.')) return;
      mutate((d) => { Object.assign(d, data); });
      setImportMsg('Backup restored.');
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Practice details, booking rules, reminders and contract terms." actions={<><Btn variant="accent" onClick={() => { mutate((d) => { d.settings = s; }); setSaved(true); setTimeout(() => setSaved(false), 3000); }}>Save settings</Btn>{saved && <span role="status" className="text-sm font-semibold text-emerald-700">Saved</span>}</>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Practice" /><div className="grid gap-4 p-5">
          <Field label="Name"><Input value={s.orgName} onChange={(e) => setS({ ...s, orgName: e.target.value })} /></Field>
          <Field label="Support email"><Input type="email" value={s.supportEmail} onChange={(e) => setS({ ...s, supportEmail: e.target.value })} /></Field>
          <Field label="Phone"><Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></Field>
          <Field label="Address"><Input value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
        </div></Card>
        <Card><CardHeader title="Scheduling & reminders" /><div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Booking window (days)">{num('bookingWindowDays')}</Field>
          <Field label="Minimum notice (hours)">{num('minNoticeHours')}</Field>
          <Field label="Late-cancel window (hours)">{num('cancellationHours')}</Field>
          <Field label="Default session (minutes)">{num('defaultSessionMinutes')}</Field>
          <Field label="Session reminder lead (hours)">{num('sessionReminderHours')}</Field>
          <Field label="Low-hours alert at"><Select value={s.lowHoursThreshold} onChange={(e) => setS({ ...s, lowHoursThreshold: Number(e.target.value) })}>{[0.6, 0.7, 0.8, 0.9].map((n) => <option key={n} value={n}>{n * 100}% used</option>)}</Select></Field>
          <Field label="Business timezone" className="sm:col-span-2" hint="Every session time in the portal is in this zone."><Select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>{['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'Pacific/Honolulu', 'America/Anchorage'].map((z) => <option key={z}>{z}</option>)}</Select></Field>
          <Field label="Weekly digest email"><Select value={s.weeklyDigestDay} onChange={(e) => setS({ ...s, weeklyDigestDay: Number(e.target.value) })}><option value={-1}>Never</option>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={s.autoSendReminders} onChange={(e) => setS({ ...s, autoSendReminders: e.target.checked })} />Send due reminders automatically<span className="text-xs text-brand-400">(live server only)</span></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={s.requireApproval} onChange={(e) => setS({ ...s, requireApproval: e.target.checked })} />Client bookings need coach confirmation</label>
        </div></Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Standard agreement terms" subtitle="Used in every contract. Placeholders: {{hours}} {{participants}} {{startDate}} {{endDate}} {{coach}} {{cancellationHours}} {{fees}}" action={<Btn size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setS({ ...s, standardTerms: [...s.standardTerms, { heading: `${s.standardTerms.length + 1}. New section`, text: '' }] })}>Add section</Btn>} />
        <div className="space-y-4 p-5">
          {s.standardTerms.map((t, i) => (
            <div key={i} className="rounded-xl border border-brand-100 p-3">
              <div className="flex gap-2"><Input aria-label={`Section ${i + 1} heading`} value={t.heading} onChange={(e) => setS({ ...s, standardTerms: s.standardTerms.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })} /><Btn variant="danger" size="sm" aria-label="Remove section" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setS({ ...s, standardTerms: s.standardTerms.filter((_, j) => j !== i) })} /></div>
              <Textarea className="mt-2" rows={3} aria-label={`Section ${i + 1} text`} value={t.text} onChange={(e) => setS({ ...s, standardTerms: s.standardTerms.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            </div>
          ))}
          <p className="text-xs text-brand-400">These are starter terms, not legal advice — have counsel review them before real clients sign.</p>
        </div>
      </Card>

      {mode === 'cloud' ? <CloudAccountCards /> : (
      <Card className="mt-5">
        <CardHeader title="Data" subtitle="Demo mode: everything lives in this browser's storage." />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Btn variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`l2l-portal-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json')}>Export backup (JSON)</Btn>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-bold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50"><Upload className="h-4 w-4" />Import backup<input type="file" accept="application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} /></label>
          <Btn variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { if (window.confirm('Reset to the fictional demo data? All changes will be lost.')) resetDemo(); }}>Reset demo data</Btn>
          {importMsg && <span role="status" className="text-sm font-semibold text-brand-600">{importMsg}</span>}
        </div>
      </Card>
      )}
    </>
  );
}


/** Cloud mode: change your own passcode and download a full backup from the server. */
function CloudAccountCards() {
  const [cur, setCur] = React.useState('');
  const [next, setNext] = React.useState('');
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Change my passcode" icon={<KeyRound className="h-5 w-5" />} />
        <form className="space-y-4 p-5" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setMsg(null);
          try { await api('auth/change-passcode', { body: { current: cur, next } }); setMsg({ ok: true, text: 'Passcode changed. Other devices have been signed out.' }); setCur(''); setNext(''); }
          catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not reach the server.' }); }
          setBusy(false);
        }}>
          <Field label="Current passcode"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
          <Field label="New passcode" hint="At least 10 characters."><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
          <div className="flex items-center gap-3"><Btn type="submit" variant="accent" disabled={busy || next.length < 10}>Change passcode</Btn>{msg && <span role="status" className={`text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-crimson-700'}`}>{msg.text}</span>}</div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Backup" subtitle="Everything in the portal, as one JSON file. Keep it somewhere private." />
        <div className="p-5"><Btn variant="secondary" icon={<Download className="h-4 w-4" />} onClick={async () => {
          const res = await fetch('/api/export', { credentials: 'same-origin' });
          if (res.ok) downloadFile(`l2l-backup-${new Date().toISOString().slice(0, 10)}.json`, await res.text(), 'application/json');
        }}>Download full backup</Btn></div>
      </Card>
    </div>
  );
}
