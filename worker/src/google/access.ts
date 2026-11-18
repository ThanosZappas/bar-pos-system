import { signRs256 } from './jwt.js';

/**
 * How the Worker reaches Firebase: with a service account (production; the key is a Cloudflare
 * secret) or the local emulators, which accept "owner" as an all-access token.
 */
export interface GoogleConfig {
  projectId: string;
  serviceAccount?: { clientEmail: string; privateKey: string };
  firestoreEmulatorHost?: string;
  authEmulatorHost?: string;
}

const SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit',
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ');

/** An error from a Google API: HTTP status plus Google's status name and message. */
export class GoogleApiError extends Error {
  constructor(readonly httpStatus: number, readonly status: string, message: string) {
    super(message);
  }
}

export class GoogleAccess {
  private cached: { token: string; expiresAtMs: number } | null = null;

  constructor(readonly config: GoogleConfig) {}

  get projectId(): string {
    return this.config.projectId;
  }

  /** OAuth access token for Google APIs (cached until shortly before it expires). */
  async token(forEmulator: boolean): Promise<string> {
    if (forEmulator) return 'owner';
    const sa = this.config.serviceAccount;
    if (!sa) throw new Error('No service account configured (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).');
    if (this.cached && this.cached.expiresAtMs > Date.now() + 60_000) return this.cached.token;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signRs256({ iss: sa.clientEmail, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, sa.privateKey);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) throw new GoogleApiError(res.status, 'UNAUTHENTICATED', `Google sign-in for the service account failed: ${body.error_description ?? res.status}`);
    this.cached = { token: body.access_token, expiresAtMs: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.cached.token;
  }

  /** JSON request to a Google API; throws GoogleApiError with Google's status on failure. */
  async request<T>(url: string, forEmulator: boolean, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { authorization: `Bearer ${await this.token(forEmulator)}`, 'content-type': 'application/json' },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : {};
    if (!res.ok) {
      const err = (Array.isArray(json) ? json[0] : json) as { error?: { status?: string; message?: string } };
      throw new GoogleApiError(res.status, err?.error?.status ?? String(res.status), err?.error?.message ?? text);
    }
    return json as T;
  }
}
