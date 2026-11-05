import { HttpError } from './types';

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });

export const errorResponse = (e: unknown) => {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error('Unhandled error', e);
  return json({ error: 'Something went wrong on the server.' }, 500);
};

export async function readBody<T = Record<string, unknown>>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large.');
  try {
    const v = JSON.parse(text || '{}');
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as T;
  } catch {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
}

/**
 * CSRF defence for state-changing requests: the session cookie is SameSite=Lax, and we additionally require a
 * custom header (which cross-site forms cannot send) and a matching Origin when the browser supplies one.
 */
export function assertSameOriginWrite(request: Request) {
  if (request.headers.get('X-Requested-With') !== 'l2l') throw new HttpError(403, 'Missing request header.');
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin request blocked.');
}

export const clientIp = (request: Request) => request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'local';
