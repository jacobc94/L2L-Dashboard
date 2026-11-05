import React from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Avatar, Btn, Card, CardHeader, Empty, Textarea, cx } from '../components/ui';
import { useStore } from '../store';
import { useViewer } from '../hooks';
import { Engagement } from '../types';
import { markThreadRead, sendMessage } from '../utils/actions';
import { fmtDate, fmtTime } from '../utils/dates';

export function MessagesPanel({ engagement, height = 'max-h-[460px]' }: { engagement: Engagement; height?: string }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const [text, setText] = React.useState('');
  const endRef = React.useRef<HTMLDivElement>(null);
  const thread = state.messages.filter((m) => m.engagementId === engagement.id).sort((a, b) => a.at.localeCompare(b.at));
  const unread = thread.filter((m) => !m.readBy.includes(v.id)).length;

  React.useEffect(() => {
    if (unread > 0) mutate((d) => markThreadRead(d, engagement.id, v.id));
  }, [unread, engagement.id, v.id, mutate]);
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length]);

  const send = () => {
    if (!text.trim()) return;
    mutate((d) => sendMessage(d, { engagementId: engagement.id, fromRole: v.role, fromId: v.id, fromName: v.name, text: text.trim() }));
    setText('');
  };

  return (
    <Card>
      <CardHeader title="Messages" subtitle={engagement.clientIds.length > 1 ? (v.role === 'client' ? 'Shared thread with your team and coach' : 'Shared thread with the whole team') : v.role === 'client' ? 'Private thread with your coach' : 'Thread with the client — visible to the engagement\'s coach and admins'} icon={<MessageSquare className="h-5 w-5" />} />
      <div className={cx('space-y-3 overflow-y-auto p-5', height)} aria-live="polite">
        {thread.length === 0 ? <Empty title="No messages yet" hint="Send a note — quick questions are welcome here." /> : thread.map((m) => {
          const mine = m.fromId === v.id;
          return (
            <div key={m.id} className={cx('flex items-end gap-2', mine && 'flex-row-reverse')}>
              <Avatar name={m.fromName} size={28} tone={m.fromRole === 'client' ? 'crimson' : 'teal'} />
              <div className={cx('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'rounded-br-sm bg-brand-800 text-white' : 'rounded-bl-sm bg-brand-50 text-brand-800')}>
                {!mine && <div className="mb-0.5 text-[11px] font-bold opacity-70">{m.fromName}</div>}
                <p className="whitespace-pre-wrap">{m.text}</p>
                <div className={cx('mt-1 text-[10px]', mine ? 'text-white/60' : 'text-brand-400')}>{fmtDate(m.at)} · {fmtTime(m.at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2 border-t border-brand-50 p-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" aria-label="Message" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
        <Btn type="submit" variant="accent" className="self-end" icon={<Send className="h-4 w-4" />} disabled={!text.trim()}>Send</Btn>
      </form>
    </Card>
  );
}
