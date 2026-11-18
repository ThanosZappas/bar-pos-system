import { GoogleAccess, GoogleApiError } from './access.js';
import { decodeJwt, signRs256, unsignedJwt, verifyRs256 } from './jwt.js';

/**
 * Firebase Authentication over the Identity Toolkit REST API, shaped like the part of
 * firebase-admin's Auth the handlers use, plus ID-token checks for incoming calls and custom
 * tokens for PIN sign-in. Errors carry the Admin SDK's codes ("auth/user-not-found", …).
 */

export interface UserRecord {
  uid: string;
  email?: string;
  displayName?: string;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
}

/** What a verified ID token says about the caller. */
export interface DecodedIdToken {
  uid: string;
  /** "password", "custom" (a PIN or fingerprint sign-in), … */
  signInProvider?: string;
  authTimeSec?: number;
  claims: Record<string, unknown>;
}

export class AuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const AUTH_ERRORS: Record<string, string> = {
  EMAIL_EXISTS: 'auth/email-already-exists',
  DUPLICATE_EMAIL: 'auth/email-already-exists',
  USER_NOT_FOUND: 'auth/user-not-found',
  WEAK_PASSWORD: 'auth/invalid-password',
  INVALID_PASSWORD: 'auth/invalid-password',
  INVALID_EMAIL: 'auth/invalid-email',
};

const CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let jwks: { keys: Map<string, JsonWebKey>; expiresAtMs: number } | null = null;

async function securetokenKey(kid: string): Promise<JsonWebKey | undefined> {
  if (!jwks || jwks.expiresAtMs < Date.now() || !jwks.keys.has(kid)) {
    const res = await fetch(JWKS_URL);
    const body = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
    jwks = { keys: new Map(body.keys.map((k) => [k.kid, k])), expiresAtMs: Date.now() + maxAge * 1000 };
  }
  return jwks.keys.get(kid);
}

export class Auth {
  constructor(private readonly access: GoogleAccess) {}

  private get emulatorHost(): string | undefined {
    return this.access.config.authEmulatorHost;
  }

  private async call<T>(action: string, body: unknown): Promise<T> {
    const host = this.emulatorHost ? `http://${this.emulatorHost}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
    try {
      return await this.access.request<T>(`${host}/v1/projects/${this.access.projectId}/accounts${action}`, Boolean(this.emulatorHost), { body });
    } catch (e) {
      if (e instanceof GoogleApiError) {
        const reason = e.message.split(/[ :]/)[0] ?? '';
        if (AUTH_ERRORS[reason]) throw new AuthError(AUTH_ERRORS[reason]!, e.message);
      }
      throw e;
    }
  }

  async createUser(props: { email: string; password: string; displayName?: string }): Promise<UserRecord> {
    const res = await this.call<{ localId: string }>('', props);
    return this.getUser(res.localId);
  }

  private async lookup(query: { localId?: string[]; email?: string[] }): Promise<UserRecord> {
    const res = await this.call<{ users?: Record<string, any>[] }>(':lookup', query);
    const u = res.users?.[0];
    if (!u) throw new AuthError('auth/user-not-found', 'There is no user record corresponding to the provided identifier.');
    return {
      uid: u.localId,
      email: u.email,
      displayName: u.displayName,
      disabled: u.disabled === true,
      ...(u.customAttributes && { customClaims: JSON.parse(u.customAttributes) }),
    };
  }

  getUser(uid: string): Promise<UserRecord> {
    return this.lookup({ localId: [uid] });
  }

  getUserByEmail(email: string): Promise<UserRecord> {
    return this.lookup({ email: [email] });
  }

  async updateUser(uid: string, props: { displayName?: string; disabled?: boolean; password?: string }): Promise<void> {
    await this.call(':update', {
      localId: uid,
      ...(props.displayName !== undefined && { displayName: props.displayName }),
      ...(props.disabled !== undefined && { disableUser: props.disabled }),
      ...(props.password !== undefined && { password: props.password }),
    });
  }

  async setCustomUserClaims(uid: string, claims: Record<string, unknown> | null): Promise<void> {
    await this.call(':update', { localId: uid, customAttributes: JSON.stringify(claims ?? {}) });
  }

  /** Refresh tokens issued before now stop working (the person is signed out within the hour). */
  async revokeRefreshTokens(uid: string): Promise<void> {
    await this.call(':update', { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
  }

  async deleteUser(uid: string): Promise<void> {
    await this.call(':delete', { localId: uid });
  }

  /** A token the app exchanges with signInWithCustomToken; signed by the service account. */
  async createCustomToken(uid: string, claims?: Record<string, unknown>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const sa = this.access.config.serviceAccount;
    const email = sa?.clientEmail ?? 'firebase-auth-emulator@example.com';
    const payload = { iss: email, sub: email, aud: CUSTOM_TOKEN_AUDIENCE, iat: now, exp: now + 3600, uid, ...(claims && { claims }) };
    if (this.emulatorHost) return unsignedJwt(payload);
    if (!sa) throw new Error('No service account configured.');
    return signRs256(payload, sa.privateKey);
  }

  /**
   * Checks a Firebase ID token like the Admin SDK's verifyIdToken: Google's signature (skipped
   * only for the Auth emulator's unsigned tokens), this project, not expired.
   */
  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    let jwt;
    try {
      jwt = decodeJwt(token);
    } catch {
      throw new AuthError('auth/argument-error', 'Malformed ID token.');
    }
    const p = jwt.payload;
    const projectId = this.access.projectId;
    const now = Math.floor(Date.now() / 1000);
    if (this.emulatorHost) {
      if (jwt.header.alg !== 'none' && jwt.header.alg !== 'RS256') throw new AuthError('auth/argument-error', 'Bad algorithm.');
    } else {
      const key = jwt.header.alg === 'RS256' && typeof jwt.header.kid === 'string' ? await securetokenKey(jwt.header.kid) : undefined;
      if (!key || !(await verifyRs256(jwt, key))) throw new AuthError('auth/argument-error', 'Invalid ID token signature.');
    }
    if (p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError('auth/argument-error', 'ID token is for another project.');
    if (typeof p.sub !== 'string' || p.sub === '') throw new AuthError('auth/argument-error', 'ID token has no user.');
    if (typeof p.exp !== 'number' || p.exp <= now - 5) throw new AuthError('auth/id-token-expired', 'ID token expired.');
    if (typeof p.iat === 'number' && p.iat > now + 300) throw new AuthError('auth/argument-error', 'ID token issued in the future.');
    const firebase = (p.firebase ?? {}) as { sign_in_provider?: string };
    return { uid: p.sub, signInProvider: firebase.sign_in_provider, authTimeSec: p.auth_time as number | undefined, claims: p };
  }
}
