import React from 'react';
import { BookOpen, ExternalLink, FileText, Headphones, Plus, Puzzle, Trash2 } from 'lucide-react';
import { Badge, Btn, Card, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui';
import { useStore } from '../store';
import { useViewer } from '../hooks';
import { Resource } from '../types';
import { uid } from '../utils/id';

const ICON = { Assessment: Puzzle, Worksheet: FileText, 'Listen & Learn': Headphones, Framework: BookOpen } as const;

export function ResourcesPage() {
  const { state, mutate } = useStore();
  const v = useViewer();
  const [open, setOpen] = React.useState<Resource | null>(null);
  const [adding, setAdding] = React.useState(false);
  const cats = [...new Set(state.resources.map((r) => r.category))];
  return (
    <>
      <PageHeader title="Resources" subtitle="Assessments, worksheets and learning from the L2L team." actions={v.isAdmin && <Btn variant="accent" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add resource</Btn>} />
      {cats.map((c) => (
        <section key={c} className="mb-7">
          <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-[0.14em] text-brand-400">{c}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.resources.filter((r) => r.category === c).map((r) => {
              const Icon = ICON[r.category];
              return (
                <Card key={r.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between"><span className="rounded-lg bg-brand-50 p-2 text-crimson-600"><Icon className="h-5 w-5" /></span>{v.isAdmin && <button aria-label={`Delete ${r.title}`} className="text-brand-300 hover:text-crimson-600" onClick={() => mutate((d) => { d.resources = d.resources.filter((x) => x.id !== r.id); })}><Trash2 className="h-4 w-4" /></button>}</div>
                  <h3 className="mt-3 font-display text-[15px] font-bold leading-snug">{r.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-brand-500">{r.description}</p>
                  {r.url ? (
                    <a className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-crimson-700 hover:underline" href={r.url} target="_blank" rel="noreferrer">Open <ExternalLink className="h-3.5 w-3.5" /></a>
                  ) : (
                    <button className="mt-4 self-start text-sm font-bold text-crimson-700 hover:underline" onClick={() => setOpen(r)}>View worksheet</button>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)} footer={<Btn variant="secondary" onClick={() => window.print()}>Print</Btn>}>
          <Badge tone="teal">{open.category}</Badge>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{open.body}</p>
        </Modal>
      )}
      {adding && <AddResource onClose={() => setAdding(false)} />}
    </>
  );
}

function AddResource({ onClose }: { onClose: () => void }) {
  const { mutate } = useStore();
  const [r, setR] = React.useState<Resource>({ id: '', title: '', description: '', category: 'Worksheet', url: '', body: '' });
  const urlOk = !r.url?.trim() || /^https?:\/\//i.test(r.url.trim());
  const ok = r.title.trim() && urlOk && (r.url?.trim() || r.body?.trim());
  return (
    <Modal title="Add resource" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" disabled={!ok} onClick={() => { mutate((d) => d.resources.push({ ...r, id: uid('r'), url: r.url?.trim() || undefined, body: r.body?.trim() || undefined })); onClose(); }}>Add</Btn></>}>
      <div className="space-y-4">
        <Field label="Title"><Input value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} /></Field>
        <Field label="Category"><Select value={r.category} onChange={(e) => setR({ ...r, category: e.target.value as Resource['category'] })}>{['Assessment', 'Worksheet', 'Listen & Learn', 'Framework'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Description"><Textarea rows={2} value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} /></Field>
        <Field label="Link (https://…)" hint={urlOk ? 'Or leave blank and write the worksheet text below.' : 'Link must start with http:// or https://'}><Input value={r.url ?? ''} onChange={(e) => setR({ ...r, url: e.target.value })} /></Field>
        <Field label="Worksheet text"><Textarea rows={4} value={r.body ?? ''} onChange={(e) => setR({ ...r, body: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
