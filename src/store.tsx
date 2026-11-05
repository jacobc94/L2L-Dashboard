import React from 'react';
import { AppState, AuthSession, Client, Role, Staff } from './types';
import { buildSeed, STATE_VERSION } from './data/seed';
import { DEFAULT_SETTINGS } from './data/defaults';
import { autoActivateAll } from './utils/actions';
import { diffState, StateChange } from './utils/diff';
import { setBusinessTimezone } from './utils/dates';
import { deriveReminders, remindersFor } from './utils/reminders';
import { api, ApiError, detectBackend } from './api';

const STATE_KEY = 'l2l_portal_state_v1';
const AUTH_KEY = 'l2l_portal_auth_v1';
const POLL_MS = 30_000;

/**
 * Two modes, chosen at startup:
 *  - cloud: the Pages Functions API exists. Data lives in R2 behind real sign-in; every edit is sent as record-level
 *    changes the server validates. The browser holds only what the server says this person may see.
 *  - demo: no API (plain `npm run dev`, or static hosting). Fictional data in localStorage, demo sign-in.
 */
export type Mode = 'loading' | 'demo' | 'cloud';

const demoStorage = {
  load(): AppState | null {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppState;
      return parsed.version === STATE_VERSION ? parsed : null;
    } catch {
      return null;
    }
  },
  save(s: AppState) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* private mode / quota */ }
  },
};

export const emptyState = (): AppState => ({
  version: STATE_VERSION, settings: DEFAULT_SETTINGS, staff: [], orgs: [], clients: [], engagements: [], preTasks: [],
  contracts: [], sessions: [], checkIns: [], actions: [], messages: [], outbox: [], resources: [],
});

interface StoreValue {
  mode: Mode;
  state: AppState;
  auth: AuthSession | null;
  /** The signed-in person (staff or client) */
  me: Staff | Client | null;
  isStaff: boolean;
  isAdmin: boolean;
  /** Cloud mode: server-reported setup problems (missing bucket binding, secret…) */
  configProblems: string[] | null;
  needsBootstrap: boolean;
  canEmail: boolean;
  signIn: (email: string, code: string) => Promise<string | null>;
  bootstrap: (v: { key: string; name: string; email: string; passcode: string }) => Promise<string | null>;
  join: (v: { email: string; code: string; passcode: string }) => Promise<string | null>;
  signInAs: (role: Role, id: string) => void;
  signOut: () => void;
  mutate: (fn: (draft: AppState) => void) => void;
  resetDemo: () => void;
  refresh: () => Promise<void>;
  /** Last save the server refused (cloud mode) */
  syncError: string | null;
  clearSyncError: () => void;
  saving: boolean;
  reminders: ReturnType<typeof deriveReminders>;
  myReminders: ReturnType<typeof deriveReminders>;
}

const Ctx = React.createContext<StoreValue | null>(null);

export const useStore = () => {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
};

export function StoreProvider({ children, initial }: { children: React.ReactNode; initial?: AppState }) {
  const [mode, setMode] = React.useState<Mode>(initial ? 'demo' : 'loading');
  const [state, setStateRaw] = React.useState<AppState>(() => initial ?? emptyState());
  // The ref is the source of truth for writes so `mutate` runs its callback exactly once, synchronously
  // (callers read values the callback computes, and StrictMode must not double-run it).
  const stateRef = React.useRef(state);
  const setState = React.useCallback((next: AppState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const [auth, setAuth] = React.useState<AuthSession | null>(null);
  const [configProblems, setConfigProblems] = React.useState<string[] | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = React.useState(false);
  const [canEmail, setCanEmail] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const modeRef = React.useRef<Mode>(mode);
  modeRef.current = mode;
  const etagRef = React.useRef<string | null>(null);
  const pendingRef = React.useRef(0);
  const chainRef = React.useRef<Promise<void>>(Promise.resolve());

  // A clock tick so time-based reminders (session in 24h, etc.) refresh while the tab stays open
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── startup: find out which mode we're in ──
  React.useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      const cloud = await detectBackend();
      if (cancelled) return;
      if (!cloud) {
        setState(demoStorage.load() ?? buildSeed());
        try { setAuth(JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')); } catch { setAuth(null); }
        setMode('demo');
        return;
      }
      setMode('cloud');
      setConfigProblems(cloud.configured ? null : cloud.problems ?? ['Server is not configured']);
      setNeedsBootstrap(cloud.needsBootstrap);
      setCanEmail(!!cloud.canEmail);
      if (cloud.user) await loadCloud(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pull this person's slice of the data from the server. */
  const loadCloud = React.useCallback(async (force = false) => {
    if (pendingRef.current > 0) return; // never overwrite edits that haven't been saved yet
    try {
      const { status, data, headers } = await api<{ state: AppState; user: AuthSession }>('state', {
        headers: !force && etagRef.current ? { 'If-None-Match': etagRef.current } : undefined,
      });
      if (status === 304) return;
      etagRef.current = headers.get('ETag');
      if (pendingRef.current > 0) return;
      setState(data.state);
      setAuth(data.user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuth(null);
        setState(emptyState());
        etagRef.current = null;
      }
      // other errors (offline, 5xx): keep what we have and try again on the next poll
    }
  }, [setState]);

  // Keep several people in sync: poll, and refresh when the tab regains focus
  React.useEffect(() => {
    if (mode !== 'cloud' || !auth) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadCloud(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') loadCloud(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [mode, auth, loadCloud]);

  // Demo mode: persist, and sync across tabs
  React.useEffect(() => {
    if (mode === 'demo' && !initial) demoStorage.save(state);
  }, [state, mode, initial]);
  React.useEffect(() => {
    if (mode !== 'demo') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STATE_KEY && e.newValue) { try { setState(JSON.parse(e.newValue)); } catch { /* ignore */ } }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mode, setState]);

  const sendChanges = React.useCallback((changes: StateChange[]) => {
    pendingRef.current++;
    setSaving(true);
    chainRef.current = chainRef.current.then(async () => {
      try {
        await api('mutate', { body: { changes } });
      } catch (e) {
        setSyncError(e instanceof ApiError ? e.message : 'We couldn\'t reach the server. Your last change was not saved.');
      } finally {
        pendingRef.current--;
        if (pendingRef.current === 0) {
          setSaving(false);
          // Re-read from the server: it stamps times, runs automatic steps, and undoes anything it refused
          await loadCloud(true);
        }
      }
    });
  }, [loadCloud]);

  const mutate = React.useCallback((fn: (d: AppState) => void) => {
    const before = stateRef.current;
    const draft = structuredClone(before);
    fn(draft);
    if (modeRef.current === 'cloud') {
      const changes = diffState(before, draft);
      if (changes.length === 0) return;
      setState(draft); // optimistic; replaced by the server's copy once saved
      sendChanges(changes);
    } else {
      autoActivateAll(draft);
      setState(draft);
    }
  }, [setState, sendChanges]);

  const persistDemoAuth = (a: AuthSession | null) => {
    setAuth(a);
    try {
      if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
      else localStorage.removeItem(AUTH_KEY);
    } catch { /* ignore */ }
  };

  const afterAuth = async () => {
    etagRef.current = null;
    setNeedsBootstrap(false);
    await loadCloud(true);
  };

  const signIn = async (email: string, code: string): Promise<string | null> => {
    if (modeRef.current === 'cloud') {
      try { await api('auth/login', { body: { email, passcode: code } }); await afterAuth(); return null; }
      catch (e) { return e instanceof ApiError ? e.message : 'Could not reach the server.'; }
    }
    const e = email.trim().toLowerCase();
    const s = state.staff.find((x) => x.email.toLowerCase() === e);
    if (s) {
      if (s.accessCode !== code.trim()) return 'That email and access code do not match.';
      persistDemoAuth({ role: s.role, id: s.id });
      return null;
    }
    const c = state.clients.find((x) => x.email.toLowerCase() === e);
    if (c) {
      if (c.accessCode !== code.trim()) return 'That email and access code do not match.';
      persistDemoAuth({ role: 'client', id: c.id });
      return null;
    }
    return 'That email and access code do not match.';
  };

  const bootstrap: StoreValue['bootstrap'] = async (v) => {
    try { await api('auth/bootstrap', { body: v }); await afterAuth(); return null; }
    catch (e) { return e instanceof ApiError ? e.message : 'Could not reach the server.'; }
  };
  const join: StoreValue['join'] = async (v) => {
    try { await api('auth/join', { body: v }); await afterAuth(); return null; }
    catch (e) { return e instanceof ApiError ? e.message : 'Could not reach the server.'; }
  };

  const signOut = () => {
    if (modeRef.current === 'cloud') {
      api('auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
      setAuth(null);
      setState(emptyState());
      etagRef.current = null;
    } else persistDemoAuth(null);
  };

  const me: Staff | Client | null = auth
    ? auth.role === 'client'
      ? state.clients.find((c) => c.id === auth.id) ?? null
      : state.staff.find((s) => s.id === auth.id) ?? null
    : null;

  // Every wall-clock time in the app is in the business timezone, whatever the device says
  setBusinessTimezone(state.settings.timezone);
  const reminders = mode === 'loading' ? [] : deriveReminders(state);
  const isAdmin = auth?.role === 'admin';
  const myReminders = auth && me ? remindersFor(reminders, { role: auth.role === 'admin' ? 'coach' : auth.role, id: auth.id, isAdmin }) : [];

  const value: StoreValue = {
    mode, state, auth: me ? auth : null, me,
    isStaff: auth?.role === 'admin' || auth?.role === 'coach',
    isAdmin, configProblems, needsBootstrap, canEmail,
    signIn, bootstrap, join,
    signInAs: (role, id) => persistDemoAuth({ role, id }),
    signOut, mutate,
    resetDemo: () => setState(buildSeed()),
    refresh: () => loadCloud(true),
    syncError, clearSyncError: () => setSyncError(null), saving,
    reminders, myReminders,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── Tiny hash router ──
export function useHashRoute(): string[] {
  const get = () => window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const [route, setRoute] = React.useState<string[]>(get);
  React.useEffect(() => {
    const on = () => setRoute(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (href: string) => {
  window.location.hash = href.replace(/^#/, '');
};
