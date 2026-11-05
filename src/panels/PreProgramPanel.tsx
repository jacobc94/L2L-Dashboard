import React from 'react';
import { CheckCircle2, Circle, ClipboardList, ExternalLink, FileSignature, Plus, Trash2 } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, Field, Input, Modal, Progress, Select, Textarea, cx } from '../components/ui';
import { useStore, go } from '../store';
import { useDirectory, useViewer } from '../hooks';
import { Engagement, PreTask } from '../types';
import { diffDays, fmtDate, todayIso } from '../utils/dates';
import { setTaskDone } from '../utils/actions';
import { uid } from '../utils/id';

export function PreProgramPanel({ engagement }: { engagement: Engagement }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const [adding, setAdding] = React.useState(false);
  const tasks = state.preTasks.filter((t) => t.engagementId === engagement.id);
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? (done / tasks.length) * 100 : 0;
  const today = todayIso();
  const daysToStart = diffDays(engagement.startDate, today);
  const isTeam = engagement.clientIds.length > 1;

  const canToggle = (t: PreTask) => v.isStaff || (t.assignee === 'client' && (!t.clientId || t.clientId === v.id));
  const mine = v.role === 'client' ? tasks.filter((t) => t.assignee === 'client' && (!t.clientId || t.clientId === v.id)) : [];
  const ordered = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));

  return (
    <Card>
      <CardHeader
        title="Pre-program checklist"
        subtitle={engagement.status === 'Pre-program' ? (daysToStart > 0 ? `Program starts in ${daysToStart} day${daysToStart === 1 ? '' : 's'} (${fmtDate(engagement.startDate)})` : 'Program starts soon') : `${done} of ${tasks.length} steps complete`}
        icon={<ClipboardList className="h-5 w-5" />}
        action={v.isStaff && <Btn size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>Add step</Btn>}
      />
      <div className="px-5 pt-4">
        <div className="mb-1 flex justify-between text-xs font-bold text-brand-500"><span>{done}/{tasks.length} done</span><span>{Math.round(pct)}%</span></div>
        <Progress value={pct} tone={pct === 100 ? 'green' : 'teal'} />
        {v.role === 'client' && mine.length > 0 && mine.every((t) => t.done) && (
          <p className="mt-3 text-sm font-semibold text-emerald-700">You've finished everything on your side — nice work. 🎉</p>
        )}
      </div>
      {tasks.length === 0 ? (
        <Empty title="No steps yet" hint="Add the steps this client needs before the first session." />
      ) : (
        <ul className="divide-y divide-brand-50 pt-3">
          {ordered.map((t) => {
            const dueIn = t.dueDate ? diffDays(t.dueDate, today) : null;
            const overdue = !t.done && dueIn != null && dueIn < 0;
            const person = t.clientId ? dir.client(t.clientId)?.name : undefined;
            const toggleable = canToggle(t) && t.kind !== 'contract';
            return (
              <li key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                <button
                  aria-label={t.done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                  disabled={!toggleable}
                  onClick={() => mutate((d) => setTaskDone(d, t.id, !t.done))}
                  className={cx('mt-0.5 shrink-0 rounded-full', toggleable ? 'hover:scale-110' : 'cursor-default')}
                >
                  {t.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className={cx('h-5 w-5', overdue ? 'text-crimson-500' : 'text-brand-300')} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('font-bold', t.done && 'text-brand-400 line-through')}>{t.title}</span>
                    {isTeam && person && <Badge tone="neutral">{person}</Badge>}
                    {t.assignee !== 'client' && <Badge tone="blue">{t.assignee === 'coach' ? 'Coach task' : 'Admin task'}</Badge>}
                    {overdue && <Badge tone="crimson">Overdue</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-brand-500">{t.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-brand-400">
                    {t.dueDate && !t.done && <span>Due {fmtDate(t.dueDate)}</span>}
                    {t.done && t.completedAt && <span>Completed {fmtDate(t.completedAt)}</span>}
                    {t.kind === 'contract' && !t.done && <button className="inline-flex items-center gap-1 font-bold text-crimson-700 hover:underline" onClick={() => go(v.isStaff ? `/engagements/${engagement.id}/contract` : '/contract')}><FileSignature className="h-3.5 w-3.5" />Open agreement</button>}
                    {t.link && !t.done && <a className="inline-flex items-center gap-1 font-bold text-crimson-700 hover:underline" href={t.link} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Learn about this assessment</a>}
                  </div>
                </div>
                {v.isStaff && (
                  <button aria-label={`Delete ${t.title}`} className="rounded p-1 text-brand-300 hover:bg-crimson-50 hover:text-crimson-600" onClick={() => mutate((d) => { d.preTasks = d.preTasks.filter((x) => x.id !== t.id); })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && <AddTaskModal engagement={engagement} onClose={() => setAdding(false)} />}
    </Card>
  );
}

function AddTaskModal({ engagement, onClose }: { engagement: Engagement; onClose: () => void }) {
  const { mutate } = useStore();
  const dir = useDirectory();
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [assignee, setAssignee] = React.useState<'client' | 'coach'>('client');
  const [due, setDue] = React.useState('');
  const [who, setWho] = React.useState('');
  const people = dir.clientsOf(engagement);
  return (
    <Modal title="Add pre-program step" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" disabled={!title.trim()} onClick={() => {
      mutate((d) => d.preTasks.push({ id: uid('t'), engagementId: engagement.id, title: title.trim(), description: desc.trim(), kind: 'custom', assignee, clientId: assignee === 'client' && who ? who : undefined, dueDate: due || undefined, done: false }));
      onClose();
    }}>Add step</Btn></>}>
      <div className="space-y-4">
        <Field label="Step"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Share your org chart" autoFocus /></Field>
        <Field label="Details"><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assigned to"><Select value={assignee} onChange={(e) => setAssignee(e.target.value as 'client' | 'coach')}><option value="client">Client</option><option value="coach">Coach</option></Select></Field>
          <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        {assignee === 'client' && people.length > 1 && (
          <Field label="For"><Select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Whole team (primary contact)</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        )}
      </div>
    </Modal>
  );
}
