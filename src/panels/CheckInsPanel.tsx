import React from 'react';
import { HeartPulse, MessageCircleReply, Send } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, Field, Scale, Textarea, cx } from '../components/ui';
import { useStore } from '../store';
import { useDirectory, useViewer } from '../hooks';
import { CheckIn, Engagement } from '../types';
import { fmtDate, todayIso, weekStart } from '../utils/dates';
import { respondCheckIn, submitCheckIn } from '../utils/actions';
import { checkInOpenDate } from '../utils/reminders';

export function CheckInsPanel({ engagement }: { engagement: Engagement }) {
  const { state } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const wk = weekStart(todayIso());
  const all = state.checkIns.filter((c) => c.engagementId === engagement.id).sort((a, b) => b.weekOf.localeCompare(a.weekOf) || b.submittedAt.localeCompare(a.submittedAt));
  const list = v.role === 'client' ? all.filter((c) => c.clientId === v.id) : all;
  const thisWeek = v.role === 'client' ? all.find((c) => c.clientId === v.id && c.weekOf === wk) : undefined;
  const open = todayIso() >= checkInOpenDate(engagement.checkInDay);

  return (
    <div className="space-y-5">
      {v.role === 'client' && engagement.status !== 'Completed' && <CheckInForm engagement={engagement} existing={thisWeek} open={open} />}
      {v.isStaff && engagement.clientIds.length > 1 && (
        <Card>
          <CardHeader title="This week's participation" subtitle={`Week of ${fmtDate(wk)}`} />
          <ul className="flex flex-wrap gap-2 p-4">
            {dir.clientsOf(engagement).map((c) => {
              const sub = all.some((x) => x.clientId === c.id && x.weekOf === wk);
              return <li key={c.id}><Badge tone={sub ? 'green' : 'amber'}>{c.name.split(' ')[0]} · {sub ? 'submitted' : 'not yet'}</Badge></li>;
            })}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title={v.role === 'client' ? 'Your check-in history' : 'Check-ins'} subtitle="Energy, progress, wins and challenges — week by week" icon={<HeartPulse className="h-5 w-5" />} />
        {list.length === 0 ? <Empty title="No check-ins yet" hint="They appear here as soon as they're submitted." /> : (
          <>
            {list.length > 1 && <Trend items={[...list].reverse().slice(-8)} />}
            <ul className="divide-y divide-brand-50">
              {list.map((c) => <CheckInRow key={c.id} c={c} showName={engagement.clientIds.length > 1 || v.isStaff} />)}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function Trend({ items }: { items: CheckIn[] }) {
  return (
    <div className="flex items-end gap-3 border-b border-brand-50 px-5 py-4" aria-label="Energy and progress trend">
      {items.map((c) => (
        <div key={c.id} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-14 items-end gap-0.5">
            <div className="w-2.5 rounded-t bg-brand-600" style={{ height: `${c.energy * 20}%` }} title={`Energy ${c.energy}/5`} />
            <div className="w-2.5 rounded-t bg-crimson-500" style={{ height: `${c.progress * 20}%` }} title={`Progress ${c.progress}/5`} />
          </div>
          <span className="text-[10px] text-brand-400">{fmtDate(c.weekOf, { month: 'numeric', day: 'numeric' })}</span>
        </div>
      ))}
      <div className="ml-2 space-y-1 text-[11px] text-brand-500"><div><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-600" />Energy</div><div><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-crimson-500" />Progress</div></div>
    </div>
  );
}

export function CheckInRow({ c, showName }: { c: CheckIn; showName: boolean }) {
  const { mutate } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const [reply, setReply] = React.useState('');
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">Week of {fmtDate(c.weekOf)}</span>
        {showName && <Badge tone="neutral">{dir.client(c.clientId)?.name}</Badge>}
        <Badge tone="teal">Energy {c.energy}/5</Badge>
        <Badge tone="crimson">Progress {c.progress}/5</Badge>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {([['Wins', c.wins], ['Challenges', c.challenges], ['Focus this week', c.focusNext], ['Support needed', c.supportNeeded]] as const).filter(([, t]) => t).map(([k, t]) => (
          <div key={k}><dt className="text-[11px] font-bold uppercase tracking-wide text-brand-400">{k}</dt><dd className="text-brand-700">{t}</dd></div>
        ))}
      </dl>
      {c.coachResponse ? (
        <p className="mt-3 flex gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700"><MessageCircleReply className="mt-0.5 h-4 w-4 shrink-0 text-crimson-600" /><span><b>Coach: </b>{c.coachResponse}</span></p>
      ) : v.isStaff ? (
        <div className="mt-3 flex gap-2">
          <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to this check-in…" aria-label="Reply to check-in" />
          <Btn className="self-end" disabled={!reply.trim()} icon={<Send className="h-4 w-4" />} onClick={() => mutate((d) => respondCheckIn(d, c.id, reply))}>Reply</Btn>
        </div>
      ) : null}
    </li>
  );
}

function CheckInForm({ engagement, existing, open }: { engagement: Engagement; existing?: CheckIn; open: boolean }) {
  const { mutate } = useStore();
  const v = useViewer();
  const [energy, setEnergy] = React.useState(existing?.energy ?? 0);
  const [progress, setProgress] = React.useState(existing?.progress ?? 0);
  const [wins, setWins] = React.useState(existing?.wins ?? '');
  const [challenges, setChallenges] = React.useState(existing?.challenges ?? '');
  const [focusNext, setFocusNext] = React.useState(existing?.focusNext ?? '');
  const [support, setSupport] = React.useState(existing?.supportNeeded ?? '');
  const [saved, setSaved] = React.useState(false);
  const valid = energy > 0 && progress > 0 && wins.trim().length > 0;

  if (!open && !existing) {
    return <Card className="p-5 text-sm text-brand-500">Your weekly check-in opens {fmtDate(checkInOpenDate(engagement.checkInDay), { weekday: 'long', month: 'short', day: 'numeric' })}.</Card>;
  }
  return (
    <Card>
      <CardHeader title={existing ? 'This week\'s check-in' : 'Weekly check-in'} subtitle={existing ? 'Submitted — you can update it until your coach replies.' : 'About three minutes. Your coach reads every one.'} icon={<HeartPulse className="h-5 w-5" />} action={existing && <Badge tone="green">Submitted</Badge>} />
      <form className="space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); if (!valid) return; mutate((d) => submitCheckIn(d, { engagementId: engagement.id, clientId: v.id, energy, progress, wins, challenges, focusNext, supportNeeded: support })); setSaved(true); setTimeout(() => setSaved(false), 4000); }}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="My energy this week"><Scale value={energy} onChange={setEnergy} labels={['Drained', 'Energized']} /></Field>
          <Field label="Progress toward my goals"><Scale value={progress} onChange={setProgress} labels={['Stuck', 'Moving fast']} /></Field>
        </div>
        <Field label="Wins — what went well?"><Textarea value={wins} onChange={(e) => setWins(e.target.value)} placeholder="Even small ones count" /></Field>
        <Field label="Challenges — what got in the way?"><Textarea value={challenges} onChange={(e) => setChallenges(e.target.value)} /></Field>
        <Field label="My focus for the coming week"><Textarea rows={2} value={focusNext} onChange={(e) => setFocusNext(e.target.value)} /></Field>
        <Field label="Support I'd like from my coach (optional)"><Textarea rows={2} value={support} onChange={(e) => setSupport(e.target.value)} /></Field>
        <div className="flex items-center gap-3">
          <Btn type="submit" variant="accent" disabled={!valid} icon={<Send className="h-4 w-4" />}>{existing ? 'Update check-in' : 'Submit check-in'}</Btn>
          {!valid && <span className="text-xs text-brand-400">Rate your energy and progress and add at least one win.</span>}
          <span className={cx('text-sm font-semibold text-emerald-700 transition', saved ? 'opacity-100' : 'opacity-0')} role="status">{saved ? 'Saved — thank you!' : ''}</span>
        </div>
      </form>
    </Card>
  );
}
