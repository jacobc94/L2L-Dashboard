import React from 'react';
import { Btn, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import { useStore } from '../store';
import type { CheckInQuestion, CheckInTextField, Client, ClientPortal, PortalPage, PortalSection } from '../types';
import { uid } from '../utils/id';
import { BUILT_IN_PAGES, CHECK_IN_LABELS, defaultPortalPage, SECTION_TYPES } from '../utils/portal';

const emptyPortal = (): ClientPortal => ({ pages: [], checkInQuestions: [] });

export function ClientPageBuilder() {
  const { state } = useStore();
  const [clientId, setClientId] = React.useState('');
  const client = state.clients.find((c) => c.id === clientId);
  return (
    <>
      <PageHeader title="Client pages" subtitle="Customize pages and check-in questions for each client." />
      <Card className="space-y-4 p-5">
        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select a client</option>
            {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}
          </Select>
        </Field>
      </Card>
      {client && <ClientEditor key={client.id} client={client} />}
    </>
  );
}

function ClientEditor({ client }: { client: Client }) {
  const { mutate } = useStore();
  const [pageId, setPageId] = React.useState('home');
  const [newPage, setNewPage] = React.useState<PortalPage | null>(null);
  const [editorVersion, setEditorVersion] = React.useState(0);
  const portal = client.portal ?? emptyPortal();
  const custom = portal.pages.filter((p) => p.id.startsWith('p_'));
  const page = portal.pages.find((p) => p.id === pageId) ?? (newPage?.id === pageId ? newPage : defaultPortalPage(pageId));
  const savePortal = (change: (p: ClientPortal) => void) => mutate((d) => {
    const target = d.clients.find((c) => c.id === client.id);
    if (!target) return;
    target.portal ??= emptyPortal();
    change(target.portal);
  });
  return (
    <div className="mt-5 space-y-5">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Page" className="min-w-60 flex-1">
            <Select value={pageId} onChange={(e) => { setNewPage(null); setPageId(e.target.value); }}>
              {BUILT_IN_PAGES.map((p) => <option key={p.id} value={p.id}>{portal.pages.find((x) => x.id === p.id)?.title ?? p.title}</option>)}
              {custom.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              {newPage && <option value={newPage.id}>{newPage.title} (unsaved)</option>}
            </Select>
          </Field>
          <Btn variant="secondary" disabled={portal.pages.length >= 30} onClick={() => {
            const p: PortalPage = { id: uid('p'), title: 'New page', sections: [] };
            setNewPage(p); setPageId(p.id);
          }}>Create page</Btn>
        </div>
        {page && <PageEditor key={`${page.id}-${editorVersion}`} page={page} isNew={newPage?.id === page.id} onSave={(next) => {
          savePortal((p) => { const i = p.pages.findIndex((x) => x.id === next.id); if (i < 0) p.pages.push(next); else p.pages[i] = next; });
          setNewPage(null);
        }} onDelete={() => {
          savePortal((p) => { p.pages = p.pages.filter((x) => x.id !== page.id); });
          setNewPage(null); setPageId('home'); setEditorVersion((v) => v + 1);
        }} />}
      </Card>
      <QuestionEditor key={client.id} questions={portal.checkInQuestions} labels={portal.checkInLabels} onSave={(questions, labels) => savePortal((p) => { p.checkInQuestions = questions; p.checkInLabels = labels; })} />
    </div>
  );
}

function PageEditor({ page, isNew, onSave, onDelete }: { page: PortalPage; isNew: boolean; onSave: (page: PortalPage) => void; onDelete: () => void }) {
  const [draft, setDraft] = React.useState<PortalPage>(() => structuredClone(page));
  const [type, setType] = React.useState<PortalSection['type']>('text');
  const [confirming, setConfirming] = React.useState(false);
  const builtIn = BUILT_IN_PAGES.some((p) => p.id === page.id);
  const valid = draft.title.trim().length > 0 && draft.title.length <= 100 && draft.sections.every((s) => (s.heading?.length ?? 0) <= 200 && (s.text?.length ?? 0) <= 10000);
  const update = (index: number, patch: Partial<PortalSection>) => setDraft((d) => ({ ...d, sections: d.sections.map((s, i) => i === index ? { ...s, ...patch } : s) }));
  const move = (index: number, delta: number) => setDraft((d) => {
    const sections = [...d.sections];
    const to = index + delta;
    if (to < 0 || to >= sections.length) return d;
    [sections[index], sections[to]] = [sections[to], sections[index]];
    return { ...d, sections };
  });
  return (
    <div className="space-y-4">
      <Field label={builtIn ? 'Navigation label' : 'Page title'} hint={builtIn ? 'The original section retains its own heading.' : undefined}>
        <Input maxLength={100} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </Field>
      <p className="text-sm text-brand-500">Sections appear in this order. The original section preserves the existing page and its functionality.</p>
      {draft.sections.map((section, index) => (
        <div key={section.id} className="space-y-3 rounded-xl border border-brand-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <b className="mr-auto text-sm">{section.type === 'original' ? 'Original page' : SECTION_TYPES.find((s) => s.type === section.type)?.label}</b>
            <Btn size="sm" variant="secondary" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move section up">Up</Btn>
            <Btn size="sm" variant="secondary" disabled={index === draft.sections.length - 1} onClick={() => move(index, 1)} aria-label="Move section down">Down</Btn>
            <Btn size="sm" variant="danger" onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) })}>Remove</Btn>
          </div>
          {section.type === 'text' && <>
            <Field label="Heading"><Input maxLength={200} value={section.heading ?? ''} onChange={(e) => update(index, { heading: e.target.value })} /></Field>
            <Field label="Text"><Textarea maxLength={10000} value={section.text ?? ''} onChange={(e) => update(index, { text: e.target.value })} /></Field>
          </>}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Add section" className="min-w-48 flex-1"><Select value={type} onChange={(e) => setType(e.target.value as PortalSection['type'])}>
          {SECTION_TYPES.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}
          {builtIn && !draft.sections.some((s) => s.type === 'original') && <option value="original">Original page</option>}
        </Select></Field>
        <Btn variant="secondary" disabled={draft.sections.length >= 30 || (type === 'original' && (!builtIn || draft.sections.some((s) => s.type === 'original')))} onClick={() => {
          setDraft({ ...draft, sections: [...draft.sections, { id: uid('sec'), type }] });
          if (type === 'original') setType('text');
        }}>Add section</Btn>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn variant="accent" disabled={!valid} onClick={() => onSave({ ...draft, title: draft.title.trim() })}>Save page</Btn>
        {!isNew && !builtIn && (confirming
          ? <Btn variant="danger" onClick={onDelete}>Confirm delete page</Btn>
          : <Btn variant="danger" onClick={() => setConfirming(true)}>Delete page…</Btn>)}
        {!isNew && builtIn && <Btn variant="ghost" onClick={() => { onDelete(); }}>Restore default page</Btn>}
      </div>
    </div>
  );
}

function QuestionEditor({ questions, labels, onSave }: { questions: CheckInQuestion[]; labels?: ClientPortal['checkInLabels']; onSave: (questions: CheckInQuestion[], labels: ClientPortal['checkInLabels']) => void }) {
  const [draft, setDraft] = React.useState(() => structuredClone(questions));
  const [prompts, setPrompts] = React.useState(() => ({ ...CHECK_IN_LABELS, ...labels }));
  const valid = draft.every((q) => q.label.trim().length > 0 && q.label.length <= 500) && Object.values(prompts).every((label) => label.trim().length > 0 && label.length <= 500);
  return (
    <Card className="space-y-4 p-5">
      <h2 className="font-display text-lg font-bold">Check-in questions</h2>
      <p className="text-sm text-brand-500">Edit the text prompts or add questions. The wins prompt remains required; the energy and progress ratings remain unchanged. Past answers retain their original questions.</p>
      {(Object.keys(CHECK_IN_LABELS) as CheckInTextField[]).map((field) => (
        <Field key={field} label={`Prompt: ${CHECK_IN_LABELS[field]}`}><Input maxLength={500} value={prompts[field]} onChange={(e) => setPrompts({ ...prompts, [field]: e.target.value })} /></Field>
      ))}
      {draft.map((q, index) => (
        <div key={q.id} className="space-y-2 rounded-xl border border-brand-100 p-4">
          <Field label="Question"><Input maxLength={500} value={q.label} onChange={(e) => setDraft(draft.map((x, i) => i === index ? { ...x, label: e.target.value } : x))} /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-auto text-sm"><input type="checkbox" checked={q.required} onChange={(e) => setDraft(draft.map((x, i) => i === index ? { ...x, required: e.target.checked } : x))} /> Required</label>
            <Btn size="sm" variant="secondary" disabled={index === 0} onClick={() => { const next = [...draft]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setDraft(next); }}>Up</Btn>
            <Btn size="sm" variant="secondary" disabled={index === draft.length - 1} onClick={() => { const next = [...draft]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setDraft(next); }}>Down</Btn>
            <Btn size="sm" variant="danger" onClick={() => setDraft(draft.filter((_, i) => i !== index))}>Remove</Btn>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Btn variant="secondary" disabled={draft.length >= 20} onClick={() => setDraft([...draft, { id: uid('q'), label: '', required: false }])}>Add question</Btn>
        <Btn variant="accent" disabled={!valid} onClick={() => {
          const nextLabels: NonNullable<ClientPortal['checkInLabels']> = {};
          for (const field of Object.keys(CHECK_IN_LABELS) as CheckInTextField[]) if (prompts[field].trim() !== CHECK_IN_LABELS[field]) nextLabels[field] = prompts[field].trim();
          onSave(draft.map((q) => ({ ...q, label: q.label.trim() })), Object.keys(nextLabels).length ? nextLabels : undefined);
        }}>Save questions</Btn>
      </div>
    </Card>
  );
}
