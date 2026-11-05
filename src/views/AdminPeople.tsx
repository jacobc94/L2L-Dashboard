import React from 'react';
import { Building2, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { Avatar, Badge, Btn, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui';
import { go, useStore } from '../store';
import { Client, Organization, Staff } from '../types';
import { uid } from '../utils/id';
import { removeStaff } from '../utils/actions';
import { InviteModal } from '../components/InviteModal';
import { DEMO_CODE } from '../data/seed';

export function PeoplePage() {
  const { state, mode } = useStore();
  const [inviting, setInviting] = React.useState<Client | null>(null);
  const [editing, setEditing] = React.useState<Client | 'new' | null>(null);
  const [orgOpen, setOrgOpen] = React.useState<Organization | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Clients & Organizations" subtitle="Everyone who takes part in a program." actions={<><Btn variant="secondary" icon={<Building2 className="h-4 w-4" />} onClick={() => setOrgOpen('new')}>Add organization</Btn><Btn variant="accent" icon={<UserPlus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add client</Btn></>} />
      <div className="space-y-5">
        {state.orgs.map((o) => {
          const clients = state.clients.filter((c) => c.orgId === o.id);
          return (
            <Card key={o.id}>
              <CardHeader title={o.name} subtitle={`${o.industry ?? ''}${o.industry ? ' · ' : ''}${clients.length} ${clients.length === 1 ? 'person' : 'people'}`} icon={<Building2 className="h-5 w-5" />} action={<Btn size="sm" variant="ghost" aria-label={`Edit ${o.name}`} icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setOrgOpen(o)}>Edit</Btn>} />
              {clients.length === 0 ? <Empty title="No clients yet" /> : (
                <ul className="divide-y divide-brand-50">
                  {clients.map((c) => {
                    const engs = state.engagements.filter((e) => e.clientIds.includes(c.id));
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <Avatar name={c.name} size={34} />
                        <div className="min-w-0 flex-1"><p className="text-sm font-bold">{c.name}</p><p className="text-xs text-brand-500">{c.title} · {c.email}{c.phone ? ` · ${c.phone}` : ''}</p></div>
                        <div className="flex flex-wrap gap-1.5">{engs.map((e) => <button key={e.id} onClick={() => go(`/engagements/${e.id}`)}><Badge tone={e.status === 'Active' ? 'green' : e.status === 'Completed' ? 'blue' : 'amber'}>{e.type} · {e.status}</Badge></button>)}{engs.length === 0 && <Badge>No program</Badge>}</div>
                        {mode === 'cloud' && <Btn size="sm" variant={c.joined ? 'ghost' : 'secondary'} onClick={() => setInviting(c)}>{c.joined ? 'Reset passcode' : 'Invite'}</Btn>}
                        {mode === 'cloud' && !c.joined && <Badge tone="amber">Not signed in yet</Badge>}
                        <Btn size="sm" variant="ghost" aria-label={`Edit ${c.name}`} icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(c)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
        {state.orgs.length === 0 && <Card><Empty title="No organizations yet" icon={<Users className="h-9 w-9" />} /></Card>}
      </div>
      {editing && <ClientModal client={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {orgOpen && <OrgModal org={orgOpen === 'new' ? undefined : orgOpen} onClose={() => setOrgOpen(null)} />}
      {inviting && <InviteModal person={inviting} onClose={() => setInviting(null)} />}
    </>
  );
}

function OrgModal({ org, onClose }: { org?: Organization; onClose: () => void }) {
  const { state, mutate } = useStore();
  const [name, setName] = React.useState(org?.name ?? '');
  const [industry, setIndustry] = React.useState(org?.industry ?? '');
  const [confirming, setConfirming] = React.useState(false);
  const people = org ? state.clients.filter((c) => c.orgId === org.id).length : 0;
  const programs = org ? state.engagements.filter((e) => e.orgId === org.id).length : 0;
  const canDelete = !!org && people === 0 && programs === 0;
  const save = () => {
    mutate((d) => {
      if (org) { const t = d.orgs.find((x) => x.id === org.id); if (t) Object.assign(t, { name: name.trim(), industry: industry.trim() || undefined }); }
      else d.orgs.push({ id: uid('o'), name: name.trim(), industry: industry.trim() || undefined });
    });
    onClose();
  };
  return (
    <Modal title={org ? 'Edit organization' : 'Add organization'} onClose={onClose} footer={<>
      {org && (confirming
        ? <Btn variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => { mutate((d) => { d.orgs = d.orgs.filter((x) => x.id !== org.id); }); onClose(); }}>Yes, delete {org.name}</Btn>
        : <Btn variant="danger" className="mr-auto" disabled={!canDelete} title={canDelete ? undefined : 'Only organizations with no clients or programs can be deleted'} icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirming(true)}>Delete…</Btn>)}
      <Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" disabled={!name.trim()} onClick={save}>{org ? 'Save' : 'Add'}</Btn>
    </>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Industry (optional)"><Input value={industry} onChange={(e) => setIndustry(e.target.value)} /></Field>
        {org && !canDelete && <p className="text-xs text-brand-400">{people} {people === 1 ? 'person' : 'people'} and {programs} {programs === 1 ? 'program' : 'programs'} belong to this organization, so it can't be deleted.</p>}
        {confirming && <p role="alert" className="rounded-lg bg-crimson-50 p-3 text-sm font-semibold text-crimson-700">This permanently deletes the organization. It has no clients or programs.</p>}
      </div>
    </Modal>
  );
}

function ClientModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const { state, mutate } = useStore();
  const [f, setF] = React.useState<Client>(client ?? { id: '', name: '', title: '', orgId: state.orgs[0]?.id ?? '', email: '', phone: '', accessCode: DEMO_CODE });
  const emailTaken = [...state.clients, ...state.staff].some((p) => p.email.toLowerCase() === f.email.trim().toLowerCase() && p.id !== client?.id);
  const valid = f.name.trim() && f.orgId && /.+@.+\..+/.test(f.email) && !emailTaken;
  const [confirming, setConfirming] = React.useState(false);
  const programs = client ? state.engagements.filter((e) => e.clientIds.includes(client.id)).length : 0;
  return (
    <Modal title={client ? 'Edit client' : 'Add client'} onClose={onClose} footer={<>
      {client && (confirming
        ? <Btn variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => { mutate((d) => { d.clients = d.clients.filter((c) => c.id !== client.id); }); onClose(); }}>Yes, delete {client.name.split(' ')[0]}</Btn>
        : <Btn variant="danger" className="mr-auto" disabled={programs > 0} title={programs > 0 ? 'Remove them from their program first' : undefined} icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirming(true)}>Delete…</Btn>)}<Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" disabled={!valid} onClick={() => { mutate((d) => { if (client) { const t = d.clients.find((c) => c.id === client.id); if (t) Object.assign(t, { ...f, name: f.name.trim(), email: f.email.trim() }); } else d.clients.push({ ...f, id: uid('c'), name: f.name.trim(), email: f.email.trim() }); }); onClose(); }}>{client ? 'Save' : 'Add client'}</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Organization"><Select value={f.orgId} onChange={(e) => setF({ ...f, orgId: e.target.value })}>{state.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Phone"><Input value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email (their sign-in)" className="sm:col-span-2" hint={emailTaken ? 'That email is already used by someone else.' : undefined}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      {client && programs > 0 && <p className="mt-3 text-xs text-brand-400">In {programs} program{programs === 1 ? '' : 's'}, so they can't be deleted until removed from {programs === 1 ? 'it' : 'them'}.</p>}
      {confirming && <p role="alert" className="mt-3 rounded-lg bg-crimson-50 p-3 text-sm font-semibold text-crimson-700">This permanently deletes {client?.name} and ends their sign-in. They aren't in any program.</p>}
    </Modal>
  );
}

export function TeamPage() {
  const { state, me, mode } = useStore();
  const [inviting, setInviting] = React.useState<Staff | null>(null);
  const [editing, setEditing] = React.useState<Staff | 'new' | null>(null);
  const [removing, setRemoving] = React.useState<Staff | null>(null);
  return (
    <>
      <PageHeader title="L2L Team" subtitle="Coaches and admins, their caseloads and availability." actions={<Btn variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add team member</Btn>} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {state.staff.map((s) => {
          const mine = state.engagements.filter((e) => e.coachId === s.id);
          const active = mine.filter((e) => e.status === 'Active').length;
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={s.name} size={44} tone={s.role === 'admin' ? 'crimson' : 'teal'} />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold">{s.name}{s.credentials && <span className="font-normal text-brand-400">, {s.credentials}</span>}</p>
                  <p className="text-xs text-brand-500">{s.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={s.role === 'admin' ? 'crimson' : 'teal'}>{s.role === 'admin' ? 'Admin' : 'Coach'}</Badge><Badge>{active} active · {mine.length} total</Badge><Badge tone={s.availability.length ? 'green' : 'neutral'}>{s.availability.length ? `${s.availability.length} availability windows` : 'Not bookable'}</Badge>{mode === 'cloud' && s.joined === false && <Badge tone="amber">Not signed in yet</Badge>}</div>
                  {s.role === 'coach' && !s.availability.length && <button onClick={() => go('/schedule')} className="mt-2 text-xs font-bold text-crimson-700 hover:underline">Set their availability →</button>}
                </div>
                {mode === 'cloud' && s.id !== me?.id && <Btn size="sm" variant={s.joined ? 'ghost' : 'secondary'} onClick={() => setInviting(s)}>{s.joined ? 'Reset passcode' : 'Invite'}</Btn>}
                <Btn size="sm" variant="ghost" aria-label={`Edit ${s.name}`} icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(s)} />
              </div>
              {s.bio && <p className="mt-3 text-sm text-brand-600">{s.bio}</p>}
              <p className="mt-2 text-xs text-brand-400">{s.email}</p>
            </Card>
          );
        })}
      </div>
      {editing && <StaffModal staff={editing === 'new' ? undefined : editing} isSelf={editing !== 'new' && editing.id === me?.id} onClose={() => setEditing(null)} onRemove={editing !== 'new' && editing.id !== me?.id ? () => { setRemoving(editing as Staff); setEditing(null); } : undefined} />}
      {removing && <RemoveStaffModal person={removing} onClose={() => setRemoving(null)} />}
      {inviting && <InviteModal person={inviting} onClose={() => setInviting(null)} />}
    </>
  );
}

function StaffModal({ staff, isSelf, onClose, onRemove }: { staff?: Staff; isSelf: boolean; onClose: () => void; onRemove?: () => void }) {
  const { state, mutate } = useStore();
  const [f, setF] = React.useState<Staff>(staff ?? { id: '', name: '', title: '', email: '', role: 'coach', accessCode: DEMO_CODE, availability: [], timezone: 'Pacific Time', credentials: '', bio: '' });
  const taken = [...state.clients, ...state.staff].some((p) => p.email.toLowerCase() === f.email.trim().toLowerCase() && p.id !== staff?.id);
  const valid = f.name.trim() && /.+@.+\..+/.test(f.email) && !taken;
  return (
    <Modal title={staff ? 'Edit team member' : 'Add team member'} onClose={onClose} footer={<>{onRemove && <Btn variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={onRemove}>Remove…</Btn>}<Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" disabled={!valid} onClick={() => { mutate((d) => { if (staff) { const t = d.staff.find((s) => s.id === staff.id); if (t) Object.assign(t, { ...f, name: f.name.trim(), email: f.email.trim() }); } else d.staff.push({ ...f, id: uid('st'), name: f.name.trim(), email: f.email.trim() }); }); onClose(); }}>Save</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Credentials"><Input value={f.credentials ?? ''} onChange={(e) => setF({ ...f, credentials: e.target.value })} placeholder="e.g. BCC, ICF" /></Field>
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Email (their sign-in)" hint={taken ? 'That email is already used by someone else.' : undefined}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role" hint={isSelf ? 'You can\'t change your own role.' : undefined}><Select value={f.role} disabled={isSelf} onChange={(e) => setF({ ...f, role: e.target.value as Staff['role'] })}><option value="coach">Coach — sees only their clients</option><option value="admin">Admin — sees everything</option></Select></Field>
        <Field label="Bio" className="sm:col-span-2"><Textarea rows={2} value={f.bio ?? ''} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-brand-400">Set bookable hours on the Schedule page.</p>
    </Modal>
  );
}

function RemoveStaffModal({ person, onClose }: { person: Staff; onClose: () => void }) {
  const { state, mutate } = useStore();
  const owned = state.engagements.filter((e) => e.coachId === person.id);
  const live = owned.filter((e) => e.status !== 'Completed');
  const upcoming = state.sessions.filter((s) => s.coachId === person.id && (s.status === 'scheduled' || s.status === 'requested')).length;
  const others = state.staff.filter((s) => s.id !== person.id);
  const [to, setTo] = React.useState(others.find((s) => s.availability.length > 0)?.id ?? others[0]?.id ?? '');
  const [error, setError] = React.useState('');
  const needsCover = owned.length > 0;
  const confirm = () => {
    let err: string | null = null;
    mutate((d) => { err = removeStaff(d, person.id, needsCover ? to : undefined); });
    if (err) setError(err); else onClose();
  };
  return (
    <Modal title={`Remove ${person.name}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Keep them</Btn><Btn variant="danger" disabled={needsCover && !to} onClick={confirm} icon={<Trash2 className="h-4 w-4" />}>Remove {person.name.split(' ')[0]}</Btn></>}>
      <p className="text-sm text-brand-600">They will no longer be able to sign in. {needsCover ? <>They coach <b>{owned.length}</b> engagement{owned.length === 1 ? '' : 's'} ({live.length} active or pre-program) with <b>{upcoming}</b> upcoming session{upcoming === 1 ? '' : 's'}.</> : 'They have no clients assigned.'}</p>
      {needsCover && (
        <>
          <Field label="Hand their clients to" className="mt-4" hint="Clients keep their history and hours. Upcoming sessions move to the new coach; sessions already delivered stay credited to the coach who ran them.">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((s) => <option key={s.id} value={s.id}>{s.name}{s.availability.length ? '' : ' (no availability set)'}</option>)}</Select>
          </Field>
          <ul className="mt-3 list-disc pl-5 text-sm text-brand-600">{owned.map((e) => <li key={e.id}>{e.title} <span className="text-brand-400">· {e.status}</span></li>)}</ul>
        </>
      )}
      <p className="mt-4 text-xs text-brand-400">Clients aren't notified automatically — let them know who their new coach is (a message from the engagement page works).</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-crimson-50 p-3 text-sm font-semibold text-crimson-700">{error}</p>}
    </Modal>
  );
}
