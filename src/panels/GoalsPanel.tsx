import React from 'react';
import { Check, Plus, Target, Trash2 } from 'lucide-react';
import { Btn, Card, CardHeader, Empty, Input, Progress, cx } from '../components/ui';
import { useStore } from '../store';
import { useViewer } from '../hooks';
import { Engagement, Phase } from '../types';
import { uid } from '../utils/id';

export const PHASES: Array<{ id: Phase; blurb: string }> = [
  { id: 'Identify', blurb: 'Clarify needs, objectives and the desired future state.' },
  { id: 'Assess & Plan', blurb: 'Use validated assessments and a deep-dive to build the plan.' },
  { id: 'Connect', blurb: 'Link learning to the plan with accountability and practice.' },
  { id: 'Evolve', blurb: 'Retain new skills, evaluate progress and celebrate.' },
];

export function PhaseTracker({ engagement, editable = false }: { engagement: Engagement; editable?: boolean }) {
  const { mutate } = useStore();
  const idx = PHASES.findIndex((p) => p.id === engagement.phase);
  return (
    <Card>
      <CardHeader title="Your journey" subtitle="The L2L Link 2 Leadership framework" icon={<Target className="h-5 w-5" />} />
      <ol className="grid gap-3 p-5 sm:grid-cols-4">
        {PHASES.map((p, i) => {
          const state = i < idx ? 'done' : i === idx ? 'now' : 'next';
          const inner = (
            <>
              <span className={cx('mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold', state === 'done' ? 'bg-emerald-500 text-white' : state === 'now' ? 'bg-crimson-600 text-white' : 'bg-brand-50 text-brand-400')}>
                {state === 'done' ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <div className="font-display text-sm font-bold">{p.id}</div>
              <p className="mt-0.5 text-xs text-brand-500">{p.blurb}</p>
            </>
          );
          const cls = cx('rounded-xl border p-3 text-left', state === 'now' ? 'border-crimson-200 bg-crimson-50/60' : 'border-brand-100');
          return (
            <li key={p.id} aria-current={state === 'now' ? 'step' : undefined}>
              {editable ? <button className={cx(cls, 'w-full hover:border-brand-300')} onClick={() => mutate((d) => { const e = d.engagements.find((x) => x.id === engagement.id); if (e) e.phase = p.id; })}>{inner}</button> : <div className={cls}>{inner}</div>}
            </li>
          );
        })}
      </ol>
      {editable && <p className="px-5 pb-4 text-xs text-brand-400">Click a step to move this engagement to that phase.</p>}
    </Card>
  );
}

export function GoalsPanel({ engagement }: { engagement: Engagement }) {
  const { mutate } = useStore();
  const v = useViewer();
  const [text, setText] = React.useState('');
  const overall = engagement.goals.length ? engagement.goals.reduce((t, g) => t + g.progress, 0) / engagement.goals.length : 0;
  const upd = (fn: (e: Engagement) => void) => mutate((d) => { const e = d.engagements.find((x) => x.id === engagement.id); if (e) fn(e); });
  return (
    <Card>
      <CardHeader title="Goals" subtitle={engagement.goals.length ? `${Math.round(overall)}% average progress` : 'What this engagement is working toward'} icon={<Target className="h-5 w-5" />} />
      {engagement.goals.length === 0 ? <Empty title="No goals yet" hint="Goals are set during the kickoff session." /> : (
        <ul className="divide-y divide-brand-50">
          {engagement.goals.map((g) => (
            <li key={g.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">{g.text}</p>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-extrabold text-brand-700">{g.progress}%</span>
                  {v.isStaff && <button aria-label="Remove goal" className="text-brand-300 hover:text-crimson-600" onClick={() => upd((e) => { e.goals = e.goals.filter((x) => x.id !== g.id); })}><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
              {v.isStaff ? (
                <input type="range" min={0} max={100} step={5} value={g.progress} aria-label={`Progress for ${g.text}`} onChange={(ev) => upd((e) => { const t = e.goals.find((x) => x.id === g.id); if (t) t.progress = Number(ev.target.value); })} className="mt-2 w-full accent-crimson-600" />
              ) : <Progress className="mt-2" value={g.progress} tone="crimson" />}
            </li>
          ))}
        </ul>
      )}
      {v.isStaff && (
        <form className="flex gap-2 border-t border-brand-50 p-4" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; upd((en) => { en.goals.push({ id: uid('g'), text: text.trim(), progress: 0 }); }); setText(''); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a goal…" aria-label="New goal" />
          <Btn type="submit" icon={<Plus className="h-4 w-4" />} disabled={!text.trim()}>Add</Btn>
        </form>
      )}
    </Card>
  );
}
