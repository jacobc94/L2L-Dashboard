import React from 'react';
import { Check, KeyRound, UserRound } from 'lucide-react';
import { Avatar, Badge, Btn, Card, CardHeader, Field, Input, PageHeader, Textarea } from '../components/ui';
import { ApiError, api } from '../api';
import { useStore } from '../store';
import { Client, Staff } from '../types';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isStaffRecord = (p: Staff | Client): p is Staff => 'role' in p;

/** Everyone's own profile: what they may edit about themselves, plus (live mode) their passcode. */
export function ProfilePage() {
  const { me, mode, state, isAdmin } = useStore();
  if (!me) return null;
  const org = !isStaffRecord(me) ? state.orgs.find((o) => o.id === me.orgId) : undefined;
  return (
    <>
      <PageHeader title="My profile" subtitle="Keep your details current — your coach and the L2L team see these." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {isStaffRecord(me) ? <StaffProfileCard staff={me} canEditEmail={isAdmin} /> : <ClientProfileCard client={me} orgName={org?.name} />}
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={me.name} size={48} tone={isStaffRecord(me) && me.role === 'admin' ? 'crimson' : 'teal'} />
              <div className="min-w-0">
                <p className="truncate font-display font-bold">{me.name}</p>
                <p className="truncate text-xs text-brand-500">{me.title || (isStaffRecord(me) ? 'L2L team' : org?.name)}</p>
                <div className="mt-1.5"><Badge tone={isStaffRecord(me) && me.role === 'admin' ? 'crimson' : 'teal'}>{isStaffRecord(me) ? (me.role === 'admin' ? 'Admin' : 'Coach') : 'Client'}</Badge></div>
              </div>
            </div>
          </Card>
          {mode === 'cloud' && <PasscodeCard />}
        </div>
      </div>
    </>
  );
}

function SavedNote({ show }: { show: boolean }) {
  return show ? <span role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" /> Saved</span> : null;
}

function useSavedFlash() {
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);
  return [saved, () => setSaved(true)] as const;
}

function StaffProfileCard({ staff, canEditEmail }: { staff: Staff; canEditEmail: boolean }) {
  const { state, mutate } = useStore();
  const [f, setF] = React.useState({ name: staff.name, title: staff.title, credentials: staff.credentials ?? '', bio: staff.bio ?? '', timezone: staff.timezone, email: staff.email });
  const [saved, flash] = useSavedFlash();
  const taken = canEditEmail && [...state.clients, ...state.staff].some((p) => p.email.toLowerCase() === f.email.trim().toLowerCase() && p.id !== staff.id);
  const valid = f.name.trim() && (!canEditEmail || (EMAIL_RE.test(f.email.trim()) && !taken));
  const dirty = f.name !== staff.name || f.title !== staff.title || f.credentials !== (staff.credentials ?? '') || f.bio !== (staff.bio ?? '') || f.timezone !== staff.timezone || (canEditEmail && f.email !== staff.email);
  return (
    <Card>
      <CardHeader title="Your details" icon={<UserRound className="h-5 w-5" />} />
      <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        mutate((d) => {
          const t = d.staff.find((s) => s.id === staff.id);
          if (!t) return;
          Object.assign(t, {
            name: f.name.trim(), title: f.title.trim(), credentials: f.credentials.trim() || undefined, bio: f.bio.trim() || undefined,
            timezone: f.timezone.trim() || 'Pacific Time', ...(canEditEmail ? { email: f.email.trim() } : {}),
          });
        });
        flash();
      }}>
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Credentials"><Input value={f.credentials} onChange={(e) => setF({ ...f, credentials: e.target.value })} placeholder="e.g. BCC, ICF" /></Field>
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Email (your sign-in)" hint={taken ? 'That email is already used by someone else.' : canEditEmail ? undefined : 'Ask an admin if this needs to change.'}>
          <Input type="email" value={f.email} disabled={!canEditEmail} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Time zone shown to clients"><Input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} placeholder="e.g. Pacific Time" /></Field>
        <Field label="Bio" className="sm:col-span-2" hint="Shown on your team card."><Textarea rows={3} value={f.bio} maxLength={1000} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
        <div className="flex items-center gap-3 sm:col-span-2"><Btn type="submit" variant="accent" disabled={!valid || !dirty}>Save changes</Btn><SavedNote show={saved} /></div>
      </form>
    </Card>
  );
}

function ClientProfileCard({ client, orgName }: { client: Client; orgName?: string }) {
  const { mutate } = useStore();
  const [f, setF] = React.useState({ name: client.name, title: client.title, phone: client.phone ?? '' });
  const [saved, flash] = useSavedFlash();
  const dirty = f.name !== client.name || f.title !== client.title || f.phone !== (client.phone ?? '');
  return (
    <Card>
      <CardHeader title="Your details" icon={<UserRound className="h-5 w-5" />} />
      <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return;
        mutate((d) => {
          const t = d.clients.find((c) => c.id === client.id);
          if (t) Object.assign(t, { name: f.name.trim(), title: f.title.trim(), phone: f.phone.trim() || undefined });
        });
        flash();
      }}>
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Organization"><Input value={orgName ?? ''} disabled /></Field>
        <Field label="Email (your sign-in)" className="sm:col-span-2" hint="Ask your coach or an L2L admin if this needs to change."><Input type="email" value={client.email} disabled /></Field>
        <div className="flex items-center gap-3 sm:col-span-2"><Btn type="submit" variant="accent" disabled={!f.name.trim() || !dirty}>Save changes</Btn><SavedNote show={saved} /></div>
      </form>
    </Card>
  );
}

/** Live mode: change your own passcode. Signs out your other devices. */
export function PasscodeCard() {
  const [cur, setCur] = React.useState('');
  const [next, setNext] = React.useState('');
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Card>
      <CardHeader title="Change my passcode" icon={<KeyRound className="h-5 w-5" />} />
      <form className="space-y-4 p-5" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null);
        try { await api('auth/change-passcode', { body: { current: cur, next } }); setMsg({ ok: true, text: 'Passcode changed. Other devices have been signed out.' }); setCur(''); setNext(''); }
        catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not reach the server.' }); }
        setBusy(false);
      }}>
        <Field label="Current passcode"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
        <Field label="New passcode" hint="At least 10 characters."><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        <div className="flex flex-wrap items-center gap-3"><Btn type="submit" variant="accent" disabled={busy || next.length < 10}>Change passcode</Btn>{msg && <span role="status" className={`text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-crimson-700'}`}>{msg.text}</span>}</div>
      </form>
    </Card>
  );
}
