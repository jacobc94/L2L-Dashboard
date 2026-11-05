import React from 'react';
import { Award } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Field, Scale, Stars, Textarea } from '../components/ui';
import { useStore } from '../store';
import { useViewer } from '../hooks';
import { Engagement } from '../types';
import { submitCloseout } from '../utils/actions';
import { fmtDate } from '../utils/dates';

/** Post-program survey. Clients fill it in once the engagement is complete; staff see the result. */
export function CloseoutPanel({ engagement }: { engagement: Engagement }) {
  const { mutate } = useStore();
  const v = useViewer();
  const [overall, setOverall] = React.useState(0);
  const [goalsMet, setGoalsMet] = React.useState(0);
  const [nps, setNps] = React.useState(-1);
  const [highlight, setHighlight] = React.useState('');
  const [improve, setImprove] = React.useState('');
  const [ok, setOk] = React.useState(false);
  const c = engagement.closeout;

  if (engagement.status !== 'Completed') return null;
  if (c) {
    return (
      <Card>
        <CardHeader title="Program feedback" subtitle={`Submitted ${fmtDate(c.submittedAt)}`} icon={<Award className="h-5 w-5" />} action={<Badge tone="green">Thank you</Badge>} />
        <div className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <div><p className="label">Overall</p><Stars value={c.overall} /></div>
          <div><p className="label">Goals met</p><Stars value={c.goalsMet} /></div>
          <div><p className="label">Would recommend</p><p className="font-display text-2xl font-extrabold">{c.wouldRecommend}<span className="text-sm text-brand-400">/10</span></p></div>
          {c.highlight && <div className="sm:col-span-3"><p className="label">Highlight</p><p>{c.highlight}</p></div>}
          {c.improve && <div className="sm:col-span-3"><p className="label">What could be better</p><p>{c.improve}</p></div>}
          {v.isStaff && <p className="text-xs text-brand-400 sm:col-span-3">{c.testimonialOk ? 'Client is happy to be quoted as a testimonial.' : 'Client did not give testimonial permission.'}</p>}
        </div>
      </Card>
    );
  }
  if (v.role !== 'client') return <Card className="p-5 text-sm text-brand-500">Program complete — waiting on the client's feedback survey.</Card>;
  const valid = overall > 0 && goalsMet > 0 && nps >= 0;
  return (
    <Card>
      <CardHeader title="Tell us how it went" subtitle="Your program is complete. Two minutes of feedback helps us and your next steps." icon={<Award className="h-5 w-5" />} />
      <form className="space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); if (valid) mutate((d) => submitCloseout(d, engagement.id, { clientId: v.id, overall, goalsMet, wouldRecommend: nps, highlight, improve, testimonialOk: ok })); }}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Overall experience"><Scale value={overall} onChange={setOverall} labels={['Poor', 'Excellent']} /></Field>
          <Field label="Did you reach your goals?"><Scale value={goalsMet} onChange={setGoalsMet} labels={['Not at all', 'Fully']} /></Field>
        </div>
        <Field label="How likely are you to recommend L2L? (0–10)"><Scale min={0} max={10} value={nps} onChange={setNps} labels={['0 — Not likely', '10 — Extremely likely']} /></Field>
        <Field label="Biggest highlight"><Textarea rows={2} value={highlight} onChange={(e) => setHighlight(e.target.value)} /></Field>
        <Field label="What could be better?"><Textarea rows={2} value={improve} onChange={(e) => setImprove(e.target.value)} /></Field>
        <label className="flex items-start gap-2 text-sm text-brand-600"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={ok} onChange={(e) => setOk(e.target.checked)} />L2L may quote my comments as a testimonial.</label>
        <Btn type="submit" variant="accent" disabled={!valid}>Submit feedback</Btn>
      </form>
    </Card>
  );
}
