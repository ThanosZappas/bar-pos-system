import { AuthError, type Auth } from '../google/auth.js';
import { HttpsError } from './errors.js';

/**
 * Firebase's callable-functions protocol over plain HTTP, so the apps keep using the Firebase SDKs
 * (getHttpsCallableFromUrl / httpsCallableFromURL): POST /<name> with { data }, an optional
 * "Authorization: Bearer <Firebase ID token>", answered with { result } or { error }.
 */

export interface Caller {
  uid?: string;
  /** How the caller signed in: "password", or "custom" for a PIN or fingerprint sign-in. */
  provider?: string;
}

export type Handler = (caller: Caller, data: unknown) => Promise<unknown>;

const CORS = {
  'access-control-allow-origin': '*', // calls carry a bearer token, never cookies
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

/** The Android SDK sends Long values as { "@type": "…Int64Value", value: "123" }. */
export function decodeCallable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeCallable);
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o['@type'] === 'string' && /Int64Value$/.test(o['@type'] as string) && 'value' in o) return Number(o.value);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodeCallable(x)]));
  }
  return v;
}

export async function handleCall(request: Request, auth: Auth, handlers: Record<string, Handler>): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'access-control-allow-headers': request.headers.get('access-control-request-headers') ?? 'authorization, content-type' },
    });
  }
  const name = new URL(request.url).pathname.replace(/^\/+|\/+$/g, '');
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
  if (!handler) return json(new HttpsError('not-found', `No function "${name}".`).toJSON(), 404);
  if (request.method !== 'POST') return json(new HttpsError('invalid-argument', 'Use POST.').toJSON(), 405);

  let data: unknown;
  try {
    data = decodeCallable(((await request.json()) as { data?: unknown }).data ?? null);
  } catch {
    return json(new HttpsError('invalid-argument', 'The request body must be JSON with a "data" field.').toJSON(), 400);
  }

  const caller: Caller = {};
  const header = request.headers.get('authorization') ?? '';
  if (header) {
    const token = /^Bearer (.+)$/i.exec(header)?.[1];
    try {
      if (!token) throw new AuthError('auth/argument-error', 'Bad Authorization header.');
      const decoded = await auth.verifyIdToken(token);
      caller.uid = decoded.uid;
      caller.provider = decoded.signInProvider;
    } catch {
      return json(new HttpsError('unauthenticated', 'Sign in again.').toJSON(), 401);
    }
  }

  try {
    const result = await handler(caller, data);
    return json({ result: result ?? null });
  } catch (e) {
    if (e instanceof HttpsError) return json(e.toJSON(), e.httpStatus);
    console.error(`${name} failed`, e);
    return json(new HttpsError('internal', 'Internal error.').toJSON(), 500);
  }
}
