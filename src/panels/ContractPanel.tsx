import React from 'react';
import { BadgeCheck, FilePlus2, FileSignature, Pencil, Printer, Send, ShieldAlert } from 'lucide-react';
import { Badge, Btn, Card, CardHeader, Empty, Field, Input, Logo, Modal, Textarea } from '../components/ui';
import { useStore } from '../store';
import { useDirectory, useViewer } from '../hooks';
import { Contract, Engagement } from '../types';
import { renderContract } from '../utils/contractText';
import { fmtDate, fmtHours } from '../utils/dates';
import { sendContract, signContract, voidContract } from '../utils/actions';
import { uid } from '../utils/id';

const longDate = (iso: string) => fmtDate(iso, { month: 'long', day: 'numeric', year: 'numeric' });

export function ContractPanel({ engagement }: { engagement: Engagement }) {
  const { state, mutate } = useStore();
  const v = useViewer();
  const dir = useDirectory();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState('');
  const [agree, setAgree] = React.useState(false);

  const contract = [...state.contracts].reverse().find((c) => c.engagementId === engagement.id && c.status !== 'void');
  const coach = dir.staff(engagement.coachId);
  const primary = dir.client(engagement.clientIds[0]);
  const org = dir.org(engagement.orgId);

  if (!contract) {
    return (
      <Card>
        <CardHeader title="Coaching agreement" icon={<FileSignature className="h-5 w-5" />} />
        <Empty
          title="No agreement yet"
          hint={v.isStaff ? 'Create a draft from the standard terms, review it, then send it for signature.' : 'Your coach will send your agreement before the program starts.'}
          icon={<FileSignature className="h-9 w-9" />}
          action={v.isStaff && (
            <Btn variant="accent" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => mutate((d) => d.contracts.push({ id: uid('ct'), engagementId: engagement.id, status: 'draft', title: `Coaching Agreement — ${engagement.title}`, totalHours: engagement.contractedHours, startDate: engagement.startDate, endDate: engagement.endDate, cancellationHours: d.settings.cancellationHours, additionalTerms: '' }))}>
              Create draft agreement
            </Btn>
          )}
        />
      </Card>
    );
  }

  // A client who isn't the signer (other team members) can read but not sign
  const isSigner = v.role === 'client' && v.id === engagement.clientIds[0];
  const canSign = isSigner && contract.status === 'sent';
  const nameOk = name.trim().toLowerCase() === (v.person.name).toLowerCase();
  const sections = renderContract(state, contract);

  if (v.role === 'client' && contract.status === 'draft') {
    return (
      <Card><CardHeader title="Coaching agreement" icon={<FileSignature className="h-5 w-5" />} />
        <Empty title="Your agreement is being prepared" hint="You'll get a reminder as soon as it's ready to review and sign." icon={<FileSignature className="h-9 w-9" />} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {canSign && (
        <div className="no-print flex items-start gap-3 rounded-2xl border border-crimson-200 bg-crimson-50 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-crimson-600" />
          <div className="text-sm"><p className="font-bold text-crimson-800">Action needed: review and sign below</p><p className="text-crimson-700">Read the agreement, then type your full name at the bottom to sign electronically.</p></div>
        </div>
      )}
      <Card className="print-area">
        <CardHeader
          title="Coaching agreement"
          subtitle={contract.title}
          icon={<FileSignature className="h-5 w-5" />}
          action={
            <div className="no-print flex flex-wrap items-center gap-2">
              <Badge tone={contract.status === 'signed' ? 'green' : contract.status === 'sent' ? 'amber' : 'neutral'}>
                {contract.status === 'signed' ? 'Signed' : contract.status === 'sent' ? 'Awaiting signature' : 'Draft'}
              </Badge>
              <Btn size="sm" variant="secondary" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>Print / PDF</Btn>
              {v.isStaff && contract.status !== 'signed' && <Btn size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>Edit terms</Btn>}
              {v.isStaff && contract.status === 'draft' && <Btn size="sm" variant="accent" icon={<Send className="h-3.5 w-3.5" />} onClick={() => mutate((d) => sendContract(d, contract.id, v.name))}>Send for signature</Btn>}
              {v.isStaff && contract.status === 'sent' && <Btn size="sm" variant="danger" onClick={() => mutate((d) => voidContract(d, contract))}>Void</Btn>}
            </div>
          }
        />
        <div className="px-6 py-6 sm:px-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 pb-5">
            <Logo className="h-10" />
            <div className="text-right text-xs text-brand-500"><div className="font-bold text-brand-700">{state.settings.orgName}</div><div>{state.settings.address}</div><div>{state.settings.phone}</div></div>
          </div>
          <h2 className="font-display text-xl font-extrabold">{contract.title}</h2>
          <div className="mt-4 grid gap-x-8 gap-y-2 rounded-xl bg-brand-50 p-4 text-sm sm:grid-cols-2">
            <div><span className="text-brand-400">Client: </span><b>{org?.name ?? primary?.name}</b>{org && primary && <> · {primary.name}</>}</div>
            <div><span className="text-brand-400">Coach: </span><b>{coach?.name}</b></div>
            <div><span className="text-brand-400">Term: </span><b>{longDate(contract.startDate)} – {longDate(contract.endDate)}</b></div>
            <div><span className="text-brand-400">Contracted hours: </span><b>{fmtHours(contract.totalHours)}</b></div>
          </div>
          <div className="mt-6 space-y-5">
            {sections.map((s) => (
              <section key={s.heading}>
                <h3 className="font-display text-sm font-bold text-brand-800">{s.heading}</h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-brand-600">{s.text}</p>
              </section>
            ))}
          </div>

          <div className="mt-8 grid gap-6 border-t border-brand-100 pt-6 sm:grid-cols-2">
            <SignatureBlock label={`For L2L Consulting Team`} name={contract.coachSignedName} at={contract.coachSignedAt} />
            <SignatureBlock label={`Client${primary ? ` — ${primary.name}` : ''}`} name={contract.signedByName} at={contract.signedAt} pending={contract.status !== 'signed'} />
          </div>

          {canSign && (
            <div className="no-print mt-6 rounded-xl border border-brand-200 bg-sand-50 p-4">
              <Field label="Type your full name to sign" hint={`Must match “${v.person.name}”.`}>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={v.person.name} autoComplete="off" />
              </Field>
              <label className="mt-3 flex items-start gap-2 text-sm text-brand-600">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-700" />
                I have read this agreement and agree to its terms. I understand typing my name is my electronic signature.
              </label>
              <Btn className="mt-4" variant="accent" icon={<BadgeCheck className="h-4 w-4" />} disabled={!nameOk || !agree} onClick={() => mutate((d) => signContract(d, contract.id, v.id, name))}>
                Sign agreement
              </Btn>
            </div>
          )}
          {contract.status === 'sent' && v.role === 'client' && !isSigner && (
            <p className="no-print mt-6 text-sm text-brand-500">{primary?.name} is the signer for this engagement. You'll be notified once it's signed.</p>
          )}
        </div>
      </Card>
      {editing && <EditContractModal contract={contract} onClose={() => setEditing(false)} />}
    </div>
  );
}

function SignatureBlock({ label, name, at, pending }: { label: string; name?: string; at?: string; pending?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">{label}</p>
      <div className="mt-2 flex h-14 items-end border-b border-brand-300 pb-1">
        {name ? <span className="font-display text-xl italic text-brand-800" style={{ fontFamily: "'Brush Script MT','Segoe Script',cursive" }}>{name}</span> : <span className="text-sm text-brand-300">{pending ? 'Awaiting signature' : 'Not yet signed'}</span>}
      </div>
      <p className="mt-1 text-xs text-brand-400">{at ? `Signed ${fmtDate(at, { month: 'long', day: 'numeric', year: 'numeric' })} at ${new Date(at.replace('T', ' ').replace(/-/g, '/')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ' '}</p>
    </div>
  );
}

function EditContractModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { mutate } = useStore();
  const [f, setF] = React.useState({ ...contract, fee: contract.fee ?? ('' as number | '') });
  const set = (k: keyof typeof f, val: unknown) => setF((p) => ({ ...p, [k]: val }));
  return (
    <Modal title="Edit agreement" wide onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" onClick={() => {
      mutate((d) => {
        const c = d.contracts.find((x) => x.id === contract.id);
        if (!c) return;
        Object.assign(c, { title: f.title, totalHours: Number(f.totalHours), fee: f.fee === '' ? undefined : Number(f.fee), billingNote: f.billingNote, startDate: f.startDate, endDate: f.endDate, cancellationHours: Number(f.cancellationHours), additionalTerms: f.additionalTerms });
        // Keep the engagement's hours in step with what was agreed
        const e = d.engagements.find((x) => x.id === c.engagementId);
        if (e) { e.contractedHours = c.totalHours; e.startDate = c.startDate; e.endDate = c.endDate; }
      });
      onClose();
    }}>Save changes</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Contracted hours"><Input type="number" step="0.5" min="0" value={f.totalHours} onChange={(e) => set('totalHours', e.target.value)} /></Field>
        <Field label="Late-cancel notice (hours)"><Input type="number" min="0" value={f.cancellationHours} onChange={(e) => set('cancellationHours', e.target.value)} /></Field>
        <Field label="Start date"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="End date"><Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Fee ($, optional)"><Input type="number" min="0" value={f.fee} onChange={(e) => set('fee', e.target.value)} /></Field>
        <Field label="Billing note"><Input value={f.billingNote ?? ''} onChange={(e) => set('billingNote', e.target.value)} placeholder="e.g. Invoiced monthly" /></Field>
        <Field label="Additional terms" className="sm:col-span-2" hint="Appended after the standard terms. Edit the standard terms in Settings."><Textarea rows={4} value={f.additionalTerms} onChange={(e) => set('additionalTerms', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

