import React from 'react';
import { ArrowLeft, Briefcase, Download, Pause, Play, Plus, Search, Send, CheckCheck, Users } from 'lucide-react';
import { Avatar, Badge, Btn, Card, CardHeader, Empty, Field, HoursBar, Input, Modal, PageHeader, Select, Tabs, Textarea, cx } from '../components/ui';
import { go, useStore } from '../store';
import { STATUS_TONE, useDirectory, useMyEngagements, useViewer } from '../hooks';
import { Engagement, EngagementType } from '../types';
import { summarizeHours } from '../utils/hours';
import { addDays, fmtDate, fmtDateTime, fmtHours, nowIso, parseDate, toIsoDate, todayIso } from '../utils/dates';
import { createEngagementScaffold, completeEngagement, sendWeeklyUpdate } from '../utils/actions';
import { uid } from '../utils/id';
import { toCsv } from '../utils/csv';
import { downloadFile } from '../utils/ics';
import { HoursSummaryCard, SessionsPanel } from '../panels/SessionsPanel';
import { PreProgramPanel } from '../panels/PreProgramPanel';
import { ContractPanel } from '../panels/ContractPanel';
import { CheckInsPanel } from '../panels/CheckInsPanel';
import { ActionsPanel } from '../panels/ActionsPanel';
import { MessagesPanel } from '../panels/MessagesPanel';
import { GoalsPanel, PhaseTracker } from '../panels/GoalsPanel';
import { CloseoutPanel } from '../panels/CloseoutPanel';

export function EngagementsList() {
  const { state } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const engs = useMyEngagements();
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<'all' | Engagement['status']>('all');
  const [creating, setCreating] = React.useState(false);
  const now = nowIso();

  const rows = engs.filter((e) => (status === 'all' || e.status === status) && (dir.label(e) + ' ' + (dir.org(e.orgId)?.name ?? '')).toLowerCase().includes(q.toLowerCase()));
  const counts = (s: Engagement['status']) => engs.filter((e) => e.status === s).length;

  return (
    <>
      <PageHeader
        title={v.isAdmin ? 'Engagements' : 'My Clients'}
        subtitle="Every coaching program from pre-program to completion."
        actions={<Btn variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New engagement</Btn>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-300" />
          <Input className="pl-9" placeholder="Search clients or organizations" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'Pre-program', 'Active', 'Paused', 'Completed'] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cx('rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition', status === s ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-brand-600 ring-brand-200 hover:bg-brand-50')}>
              {s === 'all' ? `All (${engs.length})` : `${s} (${counts(s)})`}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? <Card><Empty title="No engagements match" icon={<Briefcase className="h-9 w-9" />} /></Card> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((e) => {
            const h = summarizeHours(e, state.sessions);
            const next = state.sessions.filter((s) => s.engagementId === e.id && (s.status === 'scheduled' || s.status === 'requested') && s.start >= now).sort((a, b) => a.start.localeCompare(b.start))[0];
            const coach = dir.staff(e.coachId);
            const people = dir.clientsOf(e);
            return (
              <a key={e.id} href={`#/engagements/${e.id}`} className="group block rounded-2xl border border-brand-100 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md">
                <div className="flex items-start gap-3">
                  {e.type === 'Executive Coaching' ? <Avatar name={dir.label(e)} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-crimson-600 text-white"><Users className="h-4 w-4" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold group-hover:text-crimson-700">{dir.label(e)}</p>
                    <p className="truncate text-xs text-brand-500">{dir.org(e.orgId)?.name} · {e.type}{people.length > 1 ? ` · ${people.length} people` : ''}</p>
                  </div>
                  <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs"><span className="font-bold text-brand-600">{fmtHours(h.used)} / {fmtHours(h.contracted)} hrs</span><span className="text-brand-400">{e.phase}</span></div>
                  <HoursBar usedPct={h.usedPct} bookedPct={h.bookedPct} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-brand-500">
                  <span>{next ? <>Next: <b className="text-brand-700">{fmtDateTime(next.start)}</b>{next.status === 'requested' && ' (requested)'}</> : e.status === 'Completed' ? `Ended ${fmtDate(e.endDate)}` : 'Nothing booked'}</span>
                  {v.isAdmin && coach && <span>Coach: {coach.name.split(' ')[0]}</span>}
                </div>
              </a>
            );
          })}
        </div>
      )}
      {creating && <NewEngagementModal onClose={() => setCreating(false)} />}
    </>
  );
}

function NewEngagementModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const [type, setType] = React.useState<EngagementType>('Executive Coaching');
  const [orgId, setOrgId] = React.useState(state.orgs[0]?.id ?? '');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [coachId, setCoachId] = React.useState(v.role === 'coach' ? v.id : state.staff.find((s) => s.availability.length)?.id ?? state.staff[0].id);
  const [start, setStart] = React.useState(addDays(todayIso(), 14));
  const [months, setMonths] = React.useState(6);
  const [hours, setHours] = React.useState(type === 'Executive Coaching' ? 16 : 24);
  const orgClients = state.clients.filter((c) => c.orgId === orgId);
  const solo = type === 'Executive Coaching';
  const valid = orgId && picked.length > 0 && (!solo || picked.length === 1) && Number(hours) > 0;

  const create = () => {
    const id = uid('e');
    const end = (() => { const d = parseDate(start); d.setMonth(d.getMonth() + months); return toIsoDate(d); })();
    mutate((d) => {
      const names = picked.map((p) => d.clients.find((c) => c.id === p)!.name);
      d.engagements.push({
        id, type, orgId, clientIds: picked, coachId, status: 'Pre-program', phase: 'Identify', startDate: start, endDate: end,
        contractedHours: Number(hours), goals: [], checkInDay: 1,
        title: solo ? `Executive Coaching — ${names[0]}` : `${d.orgs.find((o) => o.id === orgId)?.name} — ${type}`,
      });
      createEngagementScaffold(d, id);
    });
    onClose();
    go(`/engagements/${id}`);
  };

  return (
    <Modal title="New engagement" wide onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" disabled={!valid} onClick={create}>Create engagement</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Program type"><Select value={type} onChange={(e) => { const t = e.target.value as EngagementType; setType(t); setPicked([]); setHours(t === 'Executive Coaching' ? 16 : 24); }}><option>Executive Coaching</option><option>Team Coaching</option><option>Leadership Cohort</option></Select></Field>
        <Field label="Organization"><Select value={orgId} onChange={(e) => { setOrgId(e.target.value); setPicked([]); }}>{state.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label={solo ? 'Client' : 'Participants (first is the primary contact & signer)'} className="sm:col-span-2">
          {orgClients.length === 0 ? <p className="text-sm text-brand-500">No clients in this organization yet. Add them under Clients & Orgs first.</p> : (
            <div className="flex flex-wrap gap-2">
              {orgClients.map((c) => {
                const on = picked.includes(c.id);
                return <button type="button" key={c.id} aria-pressed={on} onClick={() => setPicked((p) => solo ? [c.id] : on ? p.filter((x) => x !== c.id) : [...p, c.id])} className={cx('rounded-lg px-3 py-1.5 text-sm font-bold ring-1 ring-inset', on ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-brand-700 ring-brand-200 hover:bg-brand-50')}>{c.name}</button>;
              })}
            </div>
          )}
        </Field>
        <Field label="Coach"><Select value={coachId} onChange={(e) => setCoachId(e.target.value)} disabled={v.role === 'coach'}>{state.staff.filter((s) => s.availability.length > 0 || s.id === coachId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Contracted hours"><Input type="number" min="1" step="0.5" value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
        <Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Length (months)"><Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[3, 4, 6, 9, 12].map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
      </div>
      <p className="mt-4 text-xs text-brand-400">We'll create the standard pre-program checklist and a draft agreement you can edit and send.</p>
    </Modal>
  );
}

type Tab = 'overview' | 'program' | 'contract' | 'sessions' | 'checkins' | 'actions' | 'messages';

export function EngagementWorkspace({ id, tab }: { id: string; tab?: string }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const engs = useMyEngagements();
  const e = engs.find((x) => x.id === id);
  const active = (['overview', 'program', 'contract', 'sessions', 'checkins', 'actions', 'messages'].includes(tab ?? '') ? tab : 'overview') as Tab;
  if (!e) return <><PageHeader title="Engagement not found" /><Card><Empty title="You don't have access to this engagement, or it no longer exists." action={<Btn onClick={() => go('/engagements')}>Back to engagements</Btn>} /></Card></>;

  const unread = state.messages.filter((m) => m.engagementId === e.id && !m.readBy.includes(v.id)).length;
  const awaiting = state.checkIns.filter((c) => c.engagementId === e.id && !c.coachResponse).length;
  const coach = dir.staff(e.coachId);
  const set = (fn: (x: Engagement) => void) => mutate((d) => { const t = d.engagements.find((y) => y.id === e.id); if (t) fn(t); });
  const contract = state.contracts.find((c) => c.engagementId === e.id && c.status !== 'void');

  return (
    <>
      <button onClick={() => go('/engagements')} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-brand-500 hover:text-brand-800"><ArrowLeft className="h-4 w-4" />All engagements</button>
      <PageHeader
        title={dir.label(e)}
        subtitle={<>{dir.org(e.orgId)?.name} · {e.type} · {fmtDate(e.startDate)} – {fmtDate(e.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}</>}
        actions={<>
          <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
          {e.status === 'Pre-program' && <Btn size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => set((x) => { x.status = 'Active'; })}>Start program</Btn>}
          {e.status === 'Active' && <Btn size="sm" variant="secondary" icon={<Pause className="h-3.5 w-3.5" />} onClick={() => set((x) => { x.status = 'Paused'; })}>Pause</Btn>}
          {e.status === 'Paused' && <Btn size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => set((x) => { x.status = 'Active'; })}>Resume</Btn>}
          {(e.status === 'Active' || e.status === 'Paused') && <Btn size="sm" variant="secondary" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => { if (window.confirm('Mark this program complete? The client will be asked for feedback.')) mutate((d) => completeEngagement(d, e.id)); }}>Complete</Btn>}
        </>}
      />
      <div className="mb-5 border-b border-brand-100">
        <Tabs<Tab>
          value={active}
          onChange={(t) => go(`/engagements/${e.id}${t === 'overview' ? '' : '/' + t}`)}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'program', label: 'Pre-program' },
            { id: 'contract', label: 'Contract', badge: contract?.status === 'draft' || contract?.status === 'sent' ? 1 : undefined },
            { id: 'sessions', label: 'Sessions & hours' },
            { id: 'checkins', label: 'Check-ins', badge: awaiting },
            { id: 'actions', label: 'Actions' },
            { id: 'messages', label: 'Messages', badge: unread },
          ]}
        />
      </div>

      {active === 'overview' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <CloseoutPanel engagement={e} />
            <PhaseTracker engagement={e} editable />
            <GoalsPanel engagement={e} />
            <WeeklyUpdateComposer engagement={e} />
          </div>
          <div className="space-y-5">
            <Card>
              <CardHeader title="Participants" icon={<Users className="h-5 w-5" />} />
              <ul className="divide-y divide-brand-50">
                {dir.clientsOf(e).map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3"><Avatar name={c.name} size={32} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{c.name}{i === 0 && e.clientIds.length > 1 && <span className="ml-1.5 text-[10px] font-bold uppercase text-crimson-600">Primary</span>}</p><p className="truncate text-xs text-brand-500">{c.title}</p></div><a className="text-xs font-bold text-crimson-700 hover:underline" href={`mailto:${c.email}`}>Email</a></li>
                ))}
              </ul>
            </Card>
            <Card className="space-y-4 p-5">
              <Field label="Coach">
                {v.isAdmin ? (
                  <Select value={e.coachId} onChange={(ev) => set((x) => { x.coachId = ev.target.value; })}>{state.staff.filter((s) => s.availability.length > 0 || s.id === e.coachId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
                ) : <p className="text-sm font-semibold">{coach?.name}</p>}
              </Field>
              <Field label="Weekly check-in opens">
                <Select value={e.checkInDay} onChange={(ev) => set((x) => { x.checkInDay = Number(ev.target.value); })}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
              </Field>
              <div className="flex items-center justify-between text-sm"><span className="label mb-0">Agreement</span>{contract ? <Badge tone={contract.status === 'signed' ? 'green' : 'amber'}>{contract.status === 'sent' ? 'awaiting signature' : contract.status}</Badge> : <Badge>none</Badge>}</div>
            </Card>
            <HoursSummaryCard engagement={e} />
            <Btn variant="secondary" className="w-full" icon={<Download className="h-4 w-4" />} onClick={() => exportLedger(state, e)}>Export hours ledger (CSV)</Btn>
          </div>
        </div>
      )}
      {active === 'program' && <PreProgramPanel engagement={e} />}
      {active === 'contract' && <ContractPanel engagement={e} />}
      {active === 'sessions' && <SessionsPanel engagement={e} />}
      {active === 'checkins' && <CheckInsPanel engagement={e} />}
      {active === 'actions' && <ActionsPanel engagement={e} />}
      {active === 'messages' && <MessagesPanel engagement={e} />}
    </>
  );
}

function exportLedger(state: ReturnType<typeof useStore>['state'], e: Engagement) {
  const rows: unknown[][] = [['Date', 'Type', 'Mode', 'Status', 'Hours']];
  state.sessions.filter((s) => s.engagementId === e.id && (s.status === 'completed' || s.status === 'no-show')).sort((a, b) => a.start.localeCompare(b.start))
    .forEach((s) => rows.push([s.start.slice(0, 10), s.type, s.mode, s.status, s.loggedHours ?? s.durationMin / 60]));
  downloadFile(`hours-${e.id}.csv`, toCsv(rows), 'text/csv');
}

function WeeklyUpdateComposer({ engagement }: { engagement: Engagement }) {
  const { mutate } = useStore();
  const v = useViewer();
  const [text, setText] = React.useState('');
  const [sent, setSent] = React.useState(false);
  if (engagement.status === 'Completed') return null;
  return (
    <Card>
      <CardHeader title="Send a weekly update" subtitle="Posts to the message thread and queues an email to each participant" icon={<Send className="h-5 w-5" />} />
      <form className="space-y-3 p-5" onSubmit={(ev) => { ev.preventDefault(); if (!text.trim()) return; mutate((d) => sendWeeklyUpdate(d, engagement.id, { id: v.id, name: v.name }, text)); setText(''); setSent(true); setTimeout(() => setSent(false), 4000); }}>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Highlights from this week, what to focus on, anything to prepare…" aria-label="Weekly update" />
        <div className="flex items-center gap-3"><Btn type="submit" variant="accent" disabled={!text.trim()} icon={<Send className="h-4 w-4" />}>Send update</Btn>{sent && <span role="status" className="text-sm font-semibold text-emerald-700">Sent — see Reminders & Email to deliver it.</span>}</div>
      </form>
    </Card>
  );
}
