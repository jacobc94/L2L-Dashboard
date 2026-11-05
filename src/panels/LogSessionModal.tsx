import React from 'react';
import { Btn, Field, Input, Modal, Select, Textarea } from '../components/ui';
import { useStore } from '../store';
import { Engagement, Session, SessionType } from '../types';
import { logSession } from '../utils/actions';
import { uid } from '../utils/id';
import { fmtDateTime } from '../utils/dates';
import { sessionHours } from '../utils/hours';

/** Post-session log: hours delivered, what the client sees, private notes, and new action items. */
export function LogSessionModal({ engagement, session, onClose }: { engagement: Engagement; session?: Session; onClose: () => void }) {
  const { mutate } = useStore();
  const [outcome, setOutcome] = React.useState<'completed' | 'no-show'>(session?.status === 'no-show' ? 'no-show' : 'completed');
  const [hours, setHours] = React.useState(String(session ? sessionHours(session) : 1));
  const [summary, setSummary] = React.useState(session?.summary ?? '');
  const [nextFocus, setNextFocus] = React.useState(session?.nextFocus ?? '');
  const [priv, setPriv] = React.useState(session?.privateNotes ?? '');
  const [actions, setActions] = React.useState('');
  // Only used when logging a session that was never on the calendar
  const [when, setWhen] = React.useState('');
  const [type, setType] = React.useState<SessionType>('Coaching Session');

  const h = Number(hours);
  const valid = Number.isFinite(h) && h >= 0 && h <= 12 && (session || when);

  const save = () => {
    mutate((d) => {
      let id = session?.id;
      if (!id) {
        id = uid('s');
        d.sessions.push({ id, engagementId: engagement.id, coachId: engagement.coachId, type, mode: 'Zoom', start: when, durationMin: Math.round(h * 60) || 60, status: 'completed' });
      }
      logSession(d, id, { hours: h, summary, nextFocus, privateNotes: priv, status: outcome, actions: actions.split('\n') });
    });
    onClose();
  };

  return (
    <Modal
      title={session ? `Log session — ${fmtDateTime(session.start)}` : 'Log a past session'}
      onClose={onClose}
      wide
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" onClick={save} disabled={!valid}>Save log</Btn></>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {!session && (
          <>
            <Field label="Date & time"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as SessionType)}>
                {['Kickoff', 'Coaching Session', 'Check-in Call', 'Team Session', 'Debrief', 'Wrap-up', 'Consultation'].map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
          </>
        )}
        <Field label="Outcome">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as 'completed' | 'no-show')}>
            <option value="completed">Held</option>
            <option value="no-show">No-show / late cancel</option>
          </Select>
        </Field>
        <Field label="Hours to log" hint={outcome === 'no-show' ? 'Enter 0 to not charge the hours.' : 'Counts against the contract.'}>
          <Input type="number" step="0.25" min="0" max="12" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 space-y-4">
        <Field label="Session summary (client can see this)"><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What we explored, insights, decisions…" /></Field>
        <Field label="Focus for next time (client can see this)"><Textarea rows={2} value={nextFocus} onChange={(e) => setNextFocus(e.target.value)} placeholder="What the client will practice or prepare" /></Field>
        <Field label="New action steps for the client" hint="One per line — each is added to their action list, due in 7 days."><Textarea rows={3} value={actions} onChange={(e) => setActions(e.target.value)} /></Field>
        <Field label="Private coach notes" hint="Never shown to the client."><Textarea rows={3} value={priv} onChange={(e) => setPriv(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
