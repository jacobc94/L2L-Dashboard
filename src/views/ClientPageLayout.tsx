import React from 'react';
import { Card, PageHeader } from '../components/ui';
import { useStore } from '../store';
import { useViewer } from '../hooks';
import { BUILT_IN_PAGES } from '../utils/portal';
import { ClientActions, ClientCheckIn, ClientContract, ClientHome, ClientMessages, ClientProgram, ClientResources, ClientSessions } from './ClientViews';

const original: Record<string, React.ReactNode> = {
  home: <ClientHome />, program: <ClientProgram />, sessions: <ClientSessions />, contract: <ClientContract />,
  checkin: <ClientCheckIn />, actions: <ClientActions />, messages: <ClientMessages />, resources: <ClientResources />,
};

export function ClientPageLayout({ pageId }: { pageId: string }) {
  const { state } = useStore();
  const viewer = useViewer();
  const config = state.clients.find((c) => c.id === viewer.id)?.portal?.pages.find((p) => p.id === pageId);
  const builtIn = BUILT_IN_PAGES.some((p) => p.id === pageId);
  if (!config) return original[pageId] ?? <ClientHome />;
  return (
    <>
      {!builtIn && <PageHeader title={config.title} />}
      <div className="space-y-5">
        {config.sections.map((section) => (
          <React.Fragment key={section.id}>
            {section.type === 'original' ? original[pageId] : section.type === 'text' ? (
              <Card className="p-5">
                {section.heading && <h2 className="font-display text-lg font-bold">{section.heading}</h2>}
                <p className="whitespace-pre-wrap text-sm text-brand-700">{section.text}</p>
              </Card>
            ) : original[section.type]}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}
