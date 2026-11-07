import React from 'react';
import { FlaskConical } from 'lucide-react';
import { StoreProvider, useStore } from '../store';
import { buildSeed } from '../data/seed';
import App from '../App';

const FLAG = 'l2l_demo_sandbox';

export const sandboxActive = () => {
  try { return sessionStorage.getItem(FLAG) === '1'; } catch { return false; }
};

/** Admin-only: open the fictional demo workspace (in memory, nothing saved, no API calls). */
export function enterSandbox() {
  try { sessionStorage.setItem(FLAG, '1'); } catch { return; }
  window.location.hash = '';
  window.location.reload();
}

export function exitSandbox() {
  try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
  window.location.hash = '';
  window.location.reload();
}

/**
 * Wraps the app. The sandbox only ever opens for a signed-in admin of the live site; for anyone else the flag is
 * ignored. Inside, a second in-memory store holds the fictional seed, so nothing is read from or written to R2.
 */
export function Root() {
  const { mode, auth } = useStore();
  const [seed] = React.useState(() => buildSeed());
  if (mode === 'cloud' && auth?.role === 'admin' && sandboxActive()) {
    return (
      <StoreProvider initial={seed} initialAuth={{ role: 'client', id: 'c_maria' }}>
        <SandboxBar />
        <App />
      </StoreProvider>
    );
  }
  return <App />;
}

function SandboxBar() {
  const { state, auth, signInAs, resetDemo, signOut } = useStore();
  // Signing out inside the sandbox just leaves it
  React.useEffect(() => { if (!auth) exitSandbox(); }, [auth]);
  return (
    <div role="status" className="no-print sticky top-0 z-50 flex flex-wrap items-center gap-x-4 gap-y-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-1.5 font-extrabold"><FlaskConical className="h-4 w-4" />Demo sandbox — fictional data, nothing is saved</span>
      <label className="flex items-center gap-2 font-bold">
        View as
        <select
          value={auth?.id ?? ''}
          onChange={(e) => { window.location.hash = ''; signInAs('client', e.target.value); }}
          className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm font-semibold"
        >
          {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <button onClick={resetDemo} className="font-bold underline">Reset data</button>
      <button onClick={signOut} className="ml-auto rounded-md bg-amber-900 px-3 py-1 font-bold text-white">Exit demo</button>
    </div>
  );
}
