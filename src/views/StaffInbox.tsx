import React from 'react';
import { Inbox, MessageSquare } from 'lucide-react';
import { Avatar, Badge, Card, Empty, PageHeader, Segmented, cx } from '../components/ui';
import { go, useStore } from '../store';
import { useDirectory, useMyEngagements, useViewer } from '../hooks';
import { CheckInRow } from '../panels/CheckInsPanel';
import { MessagesPanel } from '../panels/MessagesPanel';
import { fmtDate } from '../utils/dates';

export function CheckInsInbox() {
  const { state } = useStore();
  const dir = useDirectory();
  const engs = useMyEngagements();
  const ids = new Set(engs.map((e) => e.id));
  const [f, setF] = React.useState<'reply' | 'all'>('reply');
  const all = state.checkIns.filter((c) => ids.has(c.engagementId)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const list = f === 'reply' ? all.filter((c) => !c.coachResponse) : all;
  return (
    <>
      <PageHeader title="Weekly check-ins" subtitle="Read what clients shared this week and reply." actions={<Segmented value={f} onChange={setF} options={[{ id: 'reply', label: `Needs reply (${all.filter((c) => !c.coachResponse).length})` }, { id: 'all', label: 'All' }]} />} />
      {list.length === 0 ? <Card><Empty title={f === 'reply' ? 'All caught up' : 'No check-ins yet'} hint={f === 'reply' ? 'Every check-in has a reply.' : undefined} icon={<Inbox className="h-9 w-9" />} /></Card> : (
        <div className="space-y-4">
          {list.map((c) => {
            const e = engs.find((x) => x.id === c.engagementId)!;
            return (
              <Card key={c.id}>
                <div className="flex items-center justify-between border-b border-brand-50 px-5 py-2.5 text-xs">
                  <button onClick={() => go(`/engagements/${e.id}/checkins`)} className="font-bold text-crimson-700 hover:underline">{dir.label(e)}</button>
                  <span className="text-brand-400">Submitted {fmtDate(c.submittedAt)}</span>
                </div>
                <ul><CheckInRow c={c} showName /></ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function StaffMessages({ selected }: { selected?: string }) {
  const { state } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const engs = useMyEngagements().filter((e) => e.status !== 'Completed' || state.messages.some((m) => m.engagementId === e.id));
  const last = (id: string) => state.messages.filter((m) => m.engagementId === id).sort((a, b) => b.at.localeCompare(a.at))[0];
  const rows = [...engs].sort((a, b) => (last(b.id)?.at ?? '').localeCompare(last(a.id)?.at ?? ''));
  const [sel, setSel] = React.useState(selected ?? rows[0]?.id);
  const cur = engs.find((e) => e.id === sel);
  return (
    <>
      <PageHeader title="Messages" subtitle="Conversations with your clients." />
      {rows.length === 0 ? <Card><Empty title="No conversations" icon={<MessageSquare className="h-9 w-9" />} /></Card> : (
        <div className="grid gap-5 md:grid-cols-[280px,1fr]">
          <Card className="max-h-[560px] overflow-y-auto">
            <ul className="divide-y divide-brand-50">
              {rows.map((e) => {
                const m = last(e.id);
                const unread = state.messages.filter((x) => x.engagementId === e.id && !x.readBy.includes(v.id)).length;
                return (
                  <li key={e.id}><button onClick={() => setSel(e.id)} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50', sel === e.id && 'bg-brand-50')}>
                    <Avatar name={dir.label(e)} size={34} />
                    <div className="min-w-0 flex-1"><p className="flex items-center gap-2 truncate text-sm font-bold">{dir.label(e)}{unread > 0 && <Badge tone="crimson">{unread}</Badge>}</p><p className="truncate text-xs text-brand-500">{m ? m.text : 'No messages yet'}</p></div>
                  </button></li>
                );
              })}
            </ul>
          </Card>
          {cur && <MessagesPanel key={cur.id} engagement={cur} height="max-h-[400px] min-h-[300px]" />}
        </div>
      )}
    </>
  );
}
