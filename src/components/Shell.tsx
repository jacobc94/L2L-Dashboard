import React from 'react';
import {
  Bell, BookOpen, CalendarDays, CheckSquare, Clock, FileSignature, HeartPulse, Home, LayoutDashboard, LogOut,
  Mail, Menu, MessageSquare, Route, Settings, Users, Briefcase, X, Building2,
} from 'lucide-react';
import { Avatar, Badge, Logo, SEVERITY_DOT, cx } from './ui';
import { go, useStore } from '../store';
import { useMyEngagements, useViewer } from '../hooks';

export interface NavItem { id: string; label: string; icon: React.ReactNode; badge?: number }

export function useNav(): NavItem[] {
  const { state, myReminders } = useStore();
  const v = useViewer();
  const engs = useMyEngagements();
  const ids = new Set(engs.map((e) => e.id));
  const unreadMsgs = state.messages.filter((m) => ids.has(m.engagementId) && !m.readBy.includes(v.id)).length;
  const i = 'h-[18px] w-[18px]';
  if (v.role === 'client') {
    return [
      { id: 'home', label: 'Home', icon: <Home className={i} /> },
      { id: 'program', label: 'My Program', icon: <Route className={i} /> },
      { id: 'sessions', label: 'Sessions & Hours', icon: <CalendarDays className={i} /> },
      { id: 'contract', label: 'Agreement', icon: <FileSignature className={i} />, badge: myReminders.filter((r) => r.kind === 'contract-reminder').length },
      { id: 'checkin', label: 'Weekly Check-in', icon: <HeartPulse className={i} />, badge: myReminders.filter((r) => r.kind === 'checkin-reminder').length },
      { id: 'actions', label: 'Action Items', icon: <CheckSquare className={i} /> },
      { id: 'messages', label: 'Messages', icon: <MessageSquare className={i} />, badge: unreadMsgs },
      { id: 'resources', label: 'Resources', icon: <BookOpen className={i} /> },
    ];
  }
  const awaiting = state.checkIns.filter((c) => ids.has(c.engagementId) && !c.coachResponse).length;
  const requests = state.sessions.filter((s) => ids.has(s.engagementId) && s.status === 'requested').length;
  const common: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className={i} /> },
    { id: 'engagements', label: v.isAdmin ? 'Engagements' : 'My Clients', icon: <Briefcase className={i} /> },
    { id: 'schedule', label: 'Schedule', icon: <CalendarDays className={i} />, badge: requests },
    { id: 'checkins', label: 'Check-ins', icon: <HeartPulse className={i} />, badge: awaiting },
    { id: 'messages', label: 'Messages', icon: <MessageSquare className={i} />, badge: unreadMsgs },
  ];
  if (!v.isAdmin) return [...common, { id: 'hours', label: 'Hours', icon: <Clock className={i} /> }, { id: 'reminders', label: 'Reminders', icon: <Mail className={i} /> }, { id: 'resources', label: 'Resources', icon: <BookOpen className={i} /> }];
  return [
    ...common,
    { id: 'people', label: 'Clients & Orgs', icon: <Building2 className={i} /> },
    { id: 'team', label: 'L2L Team', icon: <Users className={i} /> },
    { id: 'contracts', label: 'Contracts', icon: <FileSignature className={i} /> },
    { id: 'hours', label: 'Hours & Billing', icon: <Clock className={i} /> },
    { id: 'reminders', label: 'Reminders & Email', icon: <Mail className={i} /> },
    { id: 'resources', label: 'Resources', icon: <BookOpen className={i} /> },
    { id: 'settings', label: 'Settings', icon: <Settings className={i} /> },
  ];
}

export function Shell({ active, children }: { active: string; children: React.ReactNode }) {
  const { signOut, myReminders, syncError, clearSyncError, saving, mode } = useStore();
  const v = useViewer();
  const nav = useNav();
  const [open, setOpen] = React.useState(false);
  const [bell, setBell] = React.useState(false);
  const roleLabel = v.role === 'client' ? 'Client' : v.role === 'coach' ? 'Coach' : 'Admin';
  const attention = myReminders.filter((r) => r.severity !== 'info').length;

  React.useEffect(() => { setOpen(false); setBell(false); }, [active]);

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-800 text-brand-100">
      <div className="px-5 pb-4 pt-5">
        <div className="inline-block rounded-lg bg-white px-3 py-1.5"><Logo className="h-8" /></div>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-crimson-300">{roleLabel} portal</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {nav.map((n) => (
          <a
            key={n.id}
            href={`#/${n.id}`}
            aria-current={active === n.id ? 'page' : undefined}
            className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition', active === n.id ? 'bg-white text-brand-800 shadow-sm' : 'text-brand-100 hover:bg-white/10')}
          >
            <span className={active === n.id ? 'text-crimson-600' : 'text-brand-300'}>{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            {!!n.badge && <span className="min-w-5 rounded-full bg-crimson-600 px-1.5 text-center text-[11px] font-extrabold text-white">{n.badge}</span>}
          </a>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <a href="#/profile" title="My profile" aria-current={active === 'profile' ? 'page' : undefined} className={cx('flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 -m-1 hover:bg-white/10', active === 'profile' && 'bg-white/10')}>
            <Avatar name={v.name} tone="crimson" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{v.name}</span><span className="block truncate text-xs text-brand-300">{roleLabel} · My profile</span></span>
          </a>
          <button aria-label="Sign out" title="Sign out" onClick={() => { signOut(); window.location.hash = ''; }} className="rounded-lg p-2 text-brand-300 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">{sidebar}</div>
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg bg-white p-2 text-brand-700"><X className="h-5 w-5" /></button>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-brand-100 bg-white/90 px-4 backdrop-blur sm:px-8">
        <button aria-label="Open menu" className="rounded-lg p-2 text-brand-700 hover:bg-brand-50 lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        <div className="hidden text-sm font-semibold text-brand-400 lg:block">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div className="relative">
          <button aria-label={`Notifications${attention ? `, ${attention} need attention` : ''}`} aria-expanded={bell} onClick={() => setBell((b) => !b)} className="relative rounded-lg p-2 text-brand-600 hover:bg-brand-50">
            <Bell className="h-5 w-5" />
            {attention > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-crimson-600 px-1 text-center text-[10px] font-extrabold text-white">{attention}</span>}
          </button>
          {bell && (
            <div className="absolute right-0 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-brand-50 px-4 py-3"><span className="font-display text-sm font-bold">Reminders</span><Badge tone="crimson">{myReminders.length}</Badge></div>
              <ul className="max-h-[60vh] overflow-y-auto">
                {myReminders.length === 0 && <li className="px-4 py-8 text-center text-sm text-brand-400">You're all caught up. ✨</li>}
                {myReminders.slice(0, 12).map((r) => (
                  <li key={r.key}>
                    <button onClick={() => { setBell(false); go(r.href); }} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-brand-50">
                      <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[r.severity])} />
                      <span className="min-w-0"><span className="block text-sm font-bold text-brand-800">{r.title}</span><span className="block text-xs text-brand-500">{r.detail}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>
      {syncError && (
        <div role="alert" className="no-print sticky top-14 z-10 flex items-start gap-3 border-b border-crimson-200 bg-crimson-50 px-4 py-3 text-sm text-crimson-800 sm:px-8">
          <span className="flex-1"><b>That change wasn't saved.</b> {syncError} Your screen has been refreshed to match the server.</span>
          <button onClick={clearSyncError} className="font-bold underline">Dismiss</button>
        </div>
      )}
      {mode === 'cloud' && saving && <div role="status" className="no-print fixed bottom-4 right-4 z-30 rounded-full bg-brand-800 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg">Saving…</div>}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}

