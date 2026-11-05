import React from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { Badge, Btn, Modal } from './ui';
import { api, ApiError } from '../api';
import { useStore } from '../store';

interface Result { code: string; link: string; expires: string; emailed: boolean }

/** Admin creates a one-time invite (also the way to reset a forgotten passcode). Only meaningful with the live server. */
export function InviteModal({ person, onClose }: { person: { id: string; name: string; email: string; joined?: boolean }; onClose: () => void }) {
  const { canEmail, refresh } = useStore();
  const [result, setResult] = React.useState<Result | null>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<'code' | 'link' | null>(null);

  const create = async (sendEmail: boolean) => {
    setBusy(true); setError('');
    try { setResult((await api<Result>('auth/invite', { body: { userId: person.id, sendEmail } })).data); await refresh(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not reach the server.'); }
    setBusy(false);
  };
  const copy = (what: 'code' | 'link') => { navigator.clipboard?.writeText(what === 'code' ? result!.code : result!.link); setCopied(what); setTimeout(() => setCopied(null), 1800); };

  return (
    <Modal title={person.joined ? `Reset passcode — ${person.name}` : `Invite ${person.name}`} onClose={onClose} footer={<Btn variant="secondary" onClick={onClose}>Done</Btn>}>
      {!result ? (
        <>
          <p className="text-sm text-brand-600">{person.joined ? 'This creates a one-time code so they can choose a new passcode. Their current passcode keeps working until they use it.' : 'This creates a one-time invite code. They use it to choose their own passcode — you never see or set it.'}</p>
          <p className="mt-2 text-sm text-brand-500">For <b>{person.email}</b>. The code works once and expires in 7 days.</p>
          {error && <p role="alert" className="mt-3 rounded-lg bg-crimson-50 p-3 text-sm font-semibold text-crimson-700">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Btn variant="accent" disabled={busy} onClick={() => create(false)}>Create invite</Btn>
            {canEmail && <Btn variant="secondary" disabled={busy} icon={<Mail className="h-4 w-4" />} onClick={() => create(true)}>Create & email it</Btn>}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {result.emailed && <Badge tone="green">Emailed to {person.email}</Badge>}
          <div>
            <p className="label">Invite code (shown once)</p>
            <div className="flex items-center gap-2"><code className="flex-1 rounded-lg bg-brand-50 px-3 py-2 font-mono text-lg font-bold tracking-widest">{result.code}</code><Btn variant="secondary" size="sm" icon={copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => copy('code')}>{copied === 'code' ? 'Copied' : 'Copy'}</Btn></div>
          </div>
          <div>
            <p className="label">Or send this link</p>
            <div className="flex items-center gap-2"><input readOnly aria-label="Invite link" className="field text-xs" value={result.link} onFocus={(e) => e.currentTarget.select()} /><Btn variant="secondary" size="sm" icon={copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => copy('link')}>{copied === 'link' ? 'Copied' : 'Copy'}</Btn></div>
          </div>
          <p className="text-xs text-brand-400">Expires {new Date(result.expires).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Treat it like a password: send it privately.</p>
        </div>
      )}
    </Modal>
  );
}
