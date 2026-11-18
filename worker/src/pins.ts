import { Buffer } from 'node:buffer';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from './google/firestore.js';
import { HttpsError } from './http/errors.js';
import { checkPin } from './pinPolicy.js';
import { asData, audit, loadUser, requireAdmin, requireString, type Deps } from './users.js';

export * from './pinPolicy.js';

/**
 * PINs: a quick unlock for a phone that is already registered (see devices.ts), never stored in
 * plain text. A 4-digit PIN has only 10,000 values, so no hash protects it on its own once the
 * hashes leak. The defences are, together:
 *  1. the hashes live in pinSecrets/*, which no app can read (only these functions);
 *  2. a secret pepper (PIN_PEPPER, a Cloudflare secret) is mixed in before hashing, so leaked
 *     hashes cannot be tested without it;
 *  3. the lockout below, counted here on the server for every phone together;
 *  4. a PIN works only from a phone where that person has signed in with their password.
 *
 * Length rules are in pinPolicy.ts; there are no rules on which digits a PIN uses.
 */

export interface PinDeps extends Deps {
  pepper: string;
}

/** Who is calling, from the ID token: `provider` is how they signed in ('password' or 'custom' for a PIN). */
export interface Caller {
  uid?: string;
  provider?: string;
}

// ── Hashing: PBKDF2-HMAC-SHA256 (WebCrypto) over HMAC-SHA256(pepper, PIN), with a random 16-byte
// salt. The iteration count fits Cloudflare's free plan (10 ms of CPU per request; about 2 ms here):
// with 10,000 possible 4-digit PINs the pepper, not the iterations, is what makes a leaked hash
// useless. Parameters are stored with each hash, so they can be raised later without breaking
// old PINs. ──

export interface HashParams {
  alg: 'pbkdf2-sha256';
  iterations: number;
  keyLen: number;
}
export const HASH_PARAMS: HashParams = { alg: 'pbkdf2-sha256', iterations: 10_000, keyLen: 32 };

export interface PinHash extends HashParams {
  hash: string;
  salt: string;
  /** Kept so a PIN that became too short for a new role can be cleared (see users.updateUser). */
  length: number;
}

async function derive(pin: string, salt: Uint8Array, pepper: string, params: HashParams): Promise<Buffer> {
  if (!pepper) throw new Error('PIN_PEPPER is not set.');
  if (params.alg !== 'pbkdf2-sha256') throw new Error(`Unknown PIN hash ${params.alg}`);
  const peppered = createHmac('sha256', pepper).update(pin).digest();
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: params.iterations }, key, params.keyLen * 8);
  return Buffer.from(bits);
}

export async function hashPin(pin: string, pepper: string, params: HashParams = HASH_PARAMS): Promise<PinHash> {
  const salt = randomBytes(16);
  const key = await derive(pin, salt, pepper, params);
  return { hash: key.toString('base64'), salt: salt.toString('base64'), ...params, length: pin.length };
}

export async function verifyPin(pin: string, stored: PinHash, pepper: string): Promise<boolean> {
  const expected = Buffer.from(stored.hash, 'base64');
  const key = await derive(pin, Buffer.from(stored.salt, 'base64'), pepper, stored);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ── Lockout: 5 free tries, then the profile locks for 1 minute, doubling with each further wrong PIN
// up to 1 hour. Tries while locked are refused without being checked. A correct PIN, a password
// sign-in on a phone (devices.registerDevice) or the admin (unlockPin) clears the count. ──

export const FREE_TRIES = 5;
export const FIRST_LOCK_MS = 60_000;
export const MAX_LOCK_MS = 3_600_000;

/** How long the profile locks after `failures` wrong PINs in a row (0: not locked). */
export function lockMs(failures: number): number {
  if (failures < FREE_TRIES) return 0;
  return Math.min(FIRST_LOCK_MS * 2 ** (failures - FREE_TRIES), MAX_LOCK_MS);
}

export interface PinSecret {
  pin?: PinHash;
  failed?: number;
  lockedUntil?: Timestamp | null;
  /** deviceId → SHA-256 of that phone's fingerprint-unlock secret (see devices.setBiometric). */
  biometric?: Record<string, string>;
  /** deviceId → today's sign-in on that phone (see devices.issueTicket); gone with a PIN reset. */
  shift?: Record<string, { hash: string; untilMs: number }>;
}

export type Attempt =
  | { kind: 'ok' }
  | { kind: 'noPin' }
  | { kind: 'locked'; lockedUntilMs: number }
  | { kind: 'wrong'; triesLeft: number; lockedUntilMs: number | null };

export const pinSecretRef = (deps: Deps, uid: string) => deps.db.doc(`pinSecrets/${uid}`);

/**
 * Checks a PIN and counts the result, in one transaction, so parallel guesses cannot slip past
 * the count. The lock time is mirrored into users/{uid}.pinLockedUntil for the admin screens.
 */
export async function attemptPin(deps: PinDeps, uid: string, pin: string, nowMs = Date.now()): Promise<Attempt> {
  const ref = pinSecretRef(deps, uid);
  const userRef = deps.db.doc(`users/${uid}`);
  return deps.db.runTransaction<Attempt>(async (tx) => {
    const snap = await tx.get(ref);
    const secret = snap.data() as PinSecret | undefined;
    if (!secret?.pin) return { kind: 'noPin' };
    const lockedUntilMs = secret.lockedUntil?.toMillis() ?? 0;
    if (lockedUntilMs > nowMs) return { kind: 'locked', lockedUntilMs };

    if (await verifyPin(pin, secret.pin, deps.pepper)) {
      if (secret.failed || secret.lockedUntil) {
        tx.update(ref, { failed: 0, lockedUntil: null });
        tx.update(userRef, { pinLockedUntil: FieldValue.delete() });
      }
      return { kind: 'ok' };
    }
    const failed = (secret.failed ?? 0) + 1;
    const lock = lockMs(failed);
    const until = lock ? nowMs + lock : null;
    tx.update(ref, { failed, lockedUntil: until ? Timestamp.fromMillis(until) : null });
    if (until) tx.update(userRef, { pinLockedUntil: Timestamp.fromMillis(until) });
    return { kind: 'wrong', triesLeft: Math.max(0, FREE_TRIES - failed), lockedUntilMs: until };
  }, { maxAttempts: 20 }); // parallel guesses queue up on this one document
}

/** The error a phone shows for a failed attempt; `details.reason` tells the app which message to use. */
export function attemptError(a: Exclude<Attempt, { kind: 'ok' }>): HttpsError {
  switch (a.kind) {
    case 'noPin':
      return new HttpsError('failed-precondition', 'No PIN yet. Sign in with your password.', { reason: 'noPin' });
    case 'locked':
      return new HttpsError('resource-exhausted', 'Too many wrong PINs. Try again later.', { reason: 'locked', lockedUntilMs: a.lockedUntilMs });
    case 'wrong':
      return new HttpsError('permission-denied', 'Wrong PIN.', { reason: 'wrongPin', triesLeft: a.triesLeft, lockedUntilMs: a.lockedUntilMs });
  }
}

/** Clears the wrong-PIN count and lock (correct password, or the admin). */
export async function clearLock(deps: Deps, uid: string): Promise<void> {
  const ref = pinSecretRef(deps, uid);
  const secret = (await ref.get()).data() as PinSecret | undefined;
  if (!secret || (!secret.failed && !secret.lockedUntil)) return;
  await ref.update({ failed: 0, lockedUntil: null });
  await deps.db.doc(`users/${uid}`).update({ pinLockedUntil: FieldValue.delete() });
}

/**
 * Sets the caller's PIN. The first PIN (or the first after an admin reset) needs a password
 * sign-in, so a PIN session cannot choose a new PIN for a profile whose PIN was reset; changing an
 * existing PIN needs the current one, which counts towards the lockout like any other try.
 */
export async function setPin(deps: PinDeps, caller: Caller, raw: unknown): Promise<void> {
  if (!caller.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = caller.uid;
  const me = await loadUser(deps, uid);
  if (!me || me.deleted || !me.active) throw new HttpsError('permission-denied', 'This account is deactivated.');
  if (me.mustChangePassword) throw new HttpsError('failed-precondition', 'Change your password first.');
  const data = asData(raw);
  const pin = checkPin(data.pin, me.role);

  const ref = pinSecretRef(deps, uid);
  const existing = (await ref.get()).data() as PinSecret | undefined;
  if (existing?.pin) {
    if (typeof data.currentPin !== 'string') throw new HttpsError('failed-precondition', 'Enter your current PIN.', { reason: 'currentPin' });
    const attempt = await attemptPin(deps, uid, data.currentPin);
    if (attempt.kind !== 'ok') throw attemptError(attempt);
  } else if (caller.provider !== 'password') {
    throw new HttpsError('failed-precondition', 'Sign in with your password to choose a PIN.', { reason: 'needPassword' });
  }

  // merge: keeps this person's fingerprint unlocks.
  await ref.set({ pin: await hashPin(pin, deps.pepper), failed: 0, lockedUntil: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await deps.db.doc(`users/${uid}`).update({
    pinSet: true,
    pinLockedUntil: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  });
  await audit(deps, 'pin.set', uid, uid); // never log the PIN
}

/** Admin: deletes someone's PIN (and fingerprint unlocks) and signs them out everywhere. */
export async function resetPin(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const uid = requireString(asData(raw), 'uid');
  const target = await loadUser(deps, uid);
  if (!target || target.deleted) throw new HttpsError('not-found', 'User not found.');
  await pinSecretRef(deps, uid).delete();
  await deps.db.doc(`users/${uid}`).update({
    pinSet: false,
    pinLockedUntil: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor,
  });
  // A PIN may be reset because someone else learned it: end sessions opened with it.
  await deps.auth.revokeRefreshTokens(uid);
  await audit(deps, 'pin.reset', actor, uid);
}

/** Admin: clears someone's wrong-PIN count and lock. */
export async function unlockPin(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const uid = requireString(asData(raw), 'uid');
  const target = await loadUser(deps, uid);
  if (!target || target.deleted) throw new HttpsError('not-found', 'User not found.');
  await clearLock(deps, uid);
  await audit(deps, 'pin.unlock', actor, uid);
}
