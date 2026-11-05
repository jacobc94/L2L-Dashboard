import React from 'react';
import { AlertTriangle, ArrowRight, Info, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Btn, Field, Input, Logo } from './ui';
import { useStore } from '../store';

type View = 'signin' | 'join' | 'setup';

function parseJoinHash() {
  const q = window.location.hash.split('?')[1] ?? '';
  const p = new URLSearchParams(q);
  return window.location.hash.startsWith('#/join') ? { email: p.get('email') ?? '', code: p.get('code') ?? '' } : null;
}

export function Login() {
  const { mode, signIn, signInAs, bootstrap, join, state, needsBootstrap } = useStore();
  const preset = React.useMemo(parseJoinHash, []);
  const [view, setView] = React.useState<View>(preset ? 'join' : needsBootstrap ? 'setup' : 'signin');
  const [email, setEmail] = React.useState(preset?.email ?? '');
  const [code, setCode] = React.useState('');
  const [invite, setInvite] = React.useState(preset?.code ?? '');
  const [pass2, setPass2] = React.useState('');
  const [name, setName] = React.useState('');
  const [key, setKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cloud = mode === 'cloud';

  React.useEffect(() => { if (needsBootstrap && view === 'signin') setView('setup'); }, [needsBootstrap, view]);

  const finish = (err: string | null) => {
    setBusy(false);
    setError(err);
    if (!err) window.location.hash = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (view !== 'signin' && code !== pass2) { setError('The two passcodes don\'t match.'); return; }
    setBusy(true);
    if (view === 'signin') finish(await signIn(email, code));
    else if (view === 'join') finish(await join({ email, code: invite, passcode: code }));
    else finish(await bootstrap({ key, name, email, passcode: code }));
  };

  const group = (title: string, items: Array<{ id: string; name: string; sub: string; role: 'admin' | 'coach' | 'client' }>) => (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-400">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <button key={i.id} onClick={() => { signInAs(i.role, i.id); window.location.hash = i.role === 'client' ? '/home' : '/dashboard'; }} className="rounded-lg bg-white px-2.5 py-1.5 text-left text-xs ring-1 ring-inset ring-brand-200 transition hover:bg-brand-50 hover:ring-brand-400">
            <span className="block font-bold text-brand-800">{i.name}</span>
            <span className="block text-[10px] text-brand-400">{i.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const heading = view === 'signin' ? 'Sign in' : view === 'join' ? 'Join the portal' : 'First-time setup';
  const sub = view === 'signin' ? 'Clients, coaches and L2L admins use the same door.'
    : view === 'join' ? 'Enter the invite code you were sent and choose your own passcode.'
    : 'Create the first admin account. You\'ll need the setup key stored as a secret on the server.';

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr,1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-800 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-700/60" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-crimson-600/25" />
        <div className="relative inline-block self-start rounded-xl bg-white px-4 py-2"><Logo className="h-10" /></div>
        <div className="relative">
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-crimson-300">Coaching Portal</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.05]">Engage, Align,<br />and Thrive.</h1>
          <p className="mt-5 max-w-md text-brand-100">Your program, sessions, hours, agreement and weekly progress — together in one place, with your coach one message away.</p>
          <ol className="mt-8 grid max-w-md grid-cols-2 gap-3 text-sm">
            {['Identify', 'Assess & Plan', 'Connect', 'Evolve'].map((p, i) => (
              <li key={p} className="flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-crimson-600 text-xs font-extrabold">{i + 1}</span>{p}</li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-brand-200">{state.settings.orgName} · {state.settings.phone}</p>
      </div>

      <div className="flex items-center justify-center bg-sand-50 p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo className="h-10" /></div>
          <h2 className="font-display text-2xl font-extrabold">{cloud ? heading : 'Sign in'}</h2>
          <p className="mt-1 text-sm text-brand-500">{cloud ? sub : 'Clients, coaches and L2L admins use the same door.'}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {view === 'setup' && (
              <>
                <Field label="Setup key"><Input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" required /></Field>
                <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
              </>
            )}
            <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            {view === 'join' && <Field label="Invite code"><Input value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="one-time-code" className="font-mono tracking-wider" required /></Field>}
            <Field label={view === 'signin' ? (cloud ? 'Passcode' : 'Access code') : 'Choose a passcode'} hint={view !== 'signin' ? 'At least 10 characters. A few random words works well.' : undefined}>
              <Input type="password" autoComplete={view === 'signin' ? 'current-password' : 'new-password'} value={code} onChange={(e) => setCode(e.target.value)} required />
            </Field>
            {view !== 'signin' && <Field label="Confirm passcode"><Input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} required /></Field>}
            {error && <p role="alert" className="rounded-lg bg-crimson-50 p-3 text-sm font-semibold text-crimson-700">{error}</p>}
            <Btn type="submit" variant="accent" className="w-full" disabled={busy} icon={view === 'signin' ? <Lock className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}>
              {busy ? 'One moment…' : view === 'signin' ? 'Sign in' : view === 'join' ? 'Create my account' : 'Create admin account'}
            </Btn>
          </form>

          {cloud && (
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {view !== 'signin' && !needsBootstrap && <button className="font-bold text-crimson-700 hover:underline" onClick={() => { setView('signin'); setError(null); }}>Back to sign in</button>}
              {view === 'signin' && <button className="font-bold text-crimson-700 hover:underline" onClick={() => { setView('join'); setError(null); }}>Join with an invite code</button>}
              {view === 'signin' && <span className="text-brand-400">Forgot your passcode? Ask your coach for a new invite.</span>}
            </div>
          )}

          {!cloud && (
            <div className="mt-8 rounded-2xl border border-dashed border-brand-200 bg-white/70 p-4">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-brand-600"><Info className="h-4 w-4 text-crimson-600" />Demo mode — jump in as anyone</p>
              <div className="space-y-3">
                {group('L2L admin', state.staff.filter((s) => s.role === 'admin').map((s) => ({ id: s.id, name: s.name, sub: 'Admin', role: 'admin' as const })))}
                {group('L2L coach', state.staff.filter((s) => s.role === 'coach').map((s) => ({ id: s.id, name: s.name, sub: 'Coach', role: 'coach' as const })))}
                {group('Client', state.clients.map((c) => ({ id: c.id, name: c.name, sub: state.orgs.find((o) => o.id === c.orgId)?.name ?? '', role: 'client' as const })))}
              </div>
              <p className="mt-3 flex items-center gap-1 text-[11px] text-brand-400">All fictional data. <ArrowRight className="h-3 w-3" /> Deploy with the API for real sign-in.</p>
            </div>
          )}
          {cloud && <p className="mt-8 flex items-center gap-1.5 text-xs text-brand-400"><ShieldCheck className="h-4 w-4" />Your passcode is stored only as a salted hash.</p>}
        </div>
      </div>
    </div>
  );
}

export function SetupProblems({ problems }: { problems: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-amber-800"><AlertTriangle className="h-5 w-5" /><h1 className="font-display text-lg font-extrabold">The server isn't fully set up yet</h1></div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-brand-700">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <p className="mt-4 text-sm text-brand-500">Follow the “Deploying with Cloudflare R2” steps in the README, then reload this page.</p>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50" role="status" aria-label="Loading">
      <div className="flex items-center gap-3 text-brand-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-crimson-600" />Loading…</div>
    </div>
  );
}
