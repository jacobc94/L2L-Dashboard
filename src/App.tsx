import React from 'react';
import { useHashRoute, useStore } from './store';
import { Loading, Login, SetupProblems } from './components/Login';
import { Shell } from './components/Shell';
import { ClientPageLayout } from './views/ClientPageLayout';
import { ClientPageBuilder } from './views/ClientPageBuilder';
import { StaffDashboard } from './views/StaffDashboard';
import { EngagementWorkspace, EngagementsList } from './views/StaffEngagements';
import { SchedulePage } from './views/StaffSchedule';
import { CheckInsInbox, StaffMessages } from './views/StaffInbox';
import { PeoplePage, TeamPage } from './views/AdminPeople';
import { ContractsPage, HoursPage, RemindersPage, SettingsPage } from './views/AdminOps';
import { ResourcesPage } from './views/ResourcesPage';
import { ProfilePage } from './views/ProfilePage';

export default function App() {
  const { auth, isAdmin, mode, configProblems } = useStore();
  const route = useHashRoute();

  if (mode === 'loading') return <Loading />;
  if (configProblems) return <SetupProblems problems={configProblems} />;
  if (!auth || route[0] === 'reset') return <Login />;

  const isClient = auth.role === 'client';
  const home = isClient ? 'home' : 'dashboard';
  const [page = home, a, b] = route;

  let el: React.ReactNode;
  if (isClient) {
    el = page === 'profile' ? <ProfilePage /> : <ClientPageLayout pageId={page === 'page' ? (a ?? '') : page} />;
  } else {
    const adminOnly: Record<string, React.ReactNode> = isAdmin
      ? { people: <PeoplePage />, team: <TeamPage />, contracts: <ContractsPage />, settings: <SettingsPage />, 'client-pages': <ClientPageBuilder /> }
      : {};
    el = adminOnly[page] ?? ({
      dashboard: <StaffDashboard />,
      engagements: a ? <EngagementWorkspace id={a} tab={b} /> : <EngagementsList />,
      schedule: <SchedulePage />, checkins: <CheckInsInbox />, messages: <StaffMessages />,
      hours: <HoursPage />, reminders: <RemindersPage />, resources: <ResourcesPage />,
      profile: <ProfilePage />,
    } as Record<string, React.ReactNode>)[page] ?? <StaffDashboard />;
  }

  return <Shell active={page === 'page' && a ? `page/${a}` : page}>{el}</Shell>;
}
