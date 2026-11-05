// Thin client for the Cloudflare Pages Functions API in /functions and /server.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<{ status: number; data: T; headers: Headers }> {
  const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      // Required by the server on every state-changing request (CSRF defence)
      ...(method !== 'GET' ? { 'X-Requested-With': 'l2l' } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 304) return { status: 304, data: undefined as T, headers: res.headers };
  let data: unknown = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return { status: res.status, data: data as T, headers: res.headers };
}

export interface CloudStatus {
  mode: 'cloud';
  configured: boolean;
  problems?: string[];
  needsBootstrap: boolean;
  user?: { id: string; role: 'admin' | 'coach' | 'client' } | null;
  canEmail?: boolean;
}

/** Detects whether the real backend is present. Anything else (plain `vite` dev, static hosting) means demo mode. */
export async function detectBackend(): Promise<CloudStatus | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch('/api/auth/status', { credentials: 'same-origin', signal: ctl.signal });
    clearTimeout(t);
    if (!res.headers.get('content-type')?.includes('application/json')) return null;
    const data = (await res.json()) as CloudStatus;
    return data?.mode === 'cloud' ? data : null;
  } catch {
    return null;
  }
}
