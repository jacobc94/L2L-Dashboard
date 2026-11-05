import React from 'react';
import { CheckCircle2, Circle, ListChecks, Plus } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, Input, Select, cx } from '../components/ui';
import { useStore } from '../store';
import { useDirectory, useViewer } from '../hooks';
import { Engagement } from '../types';
import { diffDays, fmtDate, todayIso } from '../utils/dates';
import { addAction, toggleAction } from '../utils/actions';

export function ActionsPanel({ engagement }: { engagement: Engagement }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const [text, setText] = React.useState('');
  const [due, setDue] = React.useState('');
  const [owner, setOwner] = React.useState<'client' | 'coach'>('client');
  const today = todayIso();
  const items = state.actions.filter((a) => a.engagementId === engagement.id);
  const open = items.filter((a) => !a.done).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const done = items.filter((a) => a.done);
  const canToggle = (ownerRole: 'client' | 'coach', cid?: string) => v.isStaff || (ownerRole === 'client' && (!cid || cid === v.id));

  const row = (a: (typeof items)[number]) => {
    const dueIn = a.due ? diffDays(a.due, today) : null;
    const who = a.owner === 'coach' ? dir.staff(engagement.coachId)?.name.split(' ')[0] + ' (coach)' : a.clientId ? dir.client(a.clientId)?.name.split(' ')[0] : 'Client';
    return (
      <li key={a.id} className="flex items-start gap-3 px-5 py-3">
        <button aria-label={a.done ? 'Mark not done' : 'Mark done'} disabled={!canToggle(a.owner, a.clientId)} onClick={() => mutate((d) => toggleAction(d, a.id))} className="mt-0.5 shrink-0">
          {a.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className={cx('h-5 w-5', dueIn != null && dueIn < 0 ? 'text-crimson-500' : 'text-brand-300')} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cx('text-sm font-semibold', a.done && 'text-brand-400 line-through')}>{a.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-brand-400">
            <Badge tone={a.owner === 'coach' ? 'blue' : 'neutral'}>{who}</Badge>
            {a.due && !a.done && <span className={cx(dueIn! < 0 && 'font-bold text-crimson-600')}>{dueIn! < 0 ? `Overdue · was due ${fmtDate(a.due)}` : dueIn === 0 ? 'Due today' : `Due ${fmtDate(a.due)}`}</span>}
          </div>
        </div>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader title="Action items" subtitle="Commitments from sessions and between-session practice" icon={<ListChecks className="h-5 w-5" />} />
      {engagement.status !== 'Completed' && (
        <form className="flex flex-wrap gap-2 border-b border-brand-50 p-4" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; mutate((d) => addAction(d, { engagementId: engagement.id, text: text.trim(), owner: v.isStaff ? owner : 'client', clientId: v.role === 'client' ? v.id : owner === 'client' ? engagement.clientIds[0] : undefined, due: due || undefined })); setText(''); setDue(''); }}>
          <Input className="min-w-[200px] flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={v.role === 'client' ? 'Add something you committed to…' : 'Add an action item…'} aria-label="New action item" />
          {v.isStaff && <Select className="w-auto" value={owner} onChange={(e) => setOwner(e.target.value as 'client' | 'coach')} aria-label="Owner"><option value="client">For client</option><option value="coach">For coach</option></Select>}
          <Input type="date" className="w-auto" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <Btn type="submit" icon={<Plus className="h-4 w-4" />} disabled={!text.trim()}>Add</Btn>
        </form>
      )}
      {open.length === 0 && done.length === 0 ? <Empty title="No action items" hint="Steps from your sessions will show up here." /> : (
        <>
          <ul className="divide-y divide-brand-50">{open.map(row)}</ul>
          {done.length > 0 && (
            <details className="border-t border-brand-50">
              <summary className="cursor-pointer px-5 py-3 text-xs font-bold uppercase tracking-wide text-brand-400">Completed ({done.length})</summary>
              <ul className="divide-y divide-brand-50">{done.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
