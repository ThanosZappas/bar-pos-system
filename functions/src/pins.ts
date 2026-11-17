import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { asData, audit, loadUser, requireAdmin, requireString, type Deps, type Role } from './users.js';

/**
 * PINs: a quick unlock for a phone that is already registered (see devices.ts), never stored in
 * plain text. A 4-digit PIN has only 10,000 values, so no hash protects it on its own once the
 * hashes leak. The defences are, together:
 *  1. the hashes live in pinSecrets/*, which no app can read (only these functions);
 *  2. a secret pepper (PIN_PEPPER, kept in Secret Manager) is mixed in before hashing, so leaked
 *     hashes cannot be tested without it;
 *  3. the lockout below, counted here on the server for every phone together;
 *  4. a PIN works only from a phone where that person has signed in with their password.
 *
 * There are no rules on which digits a PIN uses (the owner's choice), only on its length.
 */

export interface PinDeps extends Deps {
  pepper: string;
}

/** Who is calling, from the ID token: `provider` is how they signed in ('password' or 'custom' for a PIN). */
export interface Caller {
  uid?: string;
  provider?: string;
}

export const PIN_MAX_LENGTH = 8;
export const SERVER_PIN_MIN_LENGTH = 4;
/** Admin and barman run the bar, so their PIN is longer. */
export const LEAD_PIN_MIN_LENGTH = 6;

export function minPinLength(role: Role): number {
  return role === 'server' ? SERVER_PIN_MIN_LENGTH : LEAD_PIN_MIN_LENGTH;
}

export function checkPin(raw: unknown, role: Role): string {
  const min = minPinLength(role);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || raw.length < min || raw.length > PIN_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `The PIN must be ${min} to ${PIN_MAX_LENGTH} digits.`, { reason: 'pinFormat', min, max: PIN_MAX_LENGTH });
  }
  return raw;
}

// ── Hashing: scrypt (memory-hard, built into Node) over HMAC-SHA256(pepper, PIN), with a random salt.
// The parameters are stored with each hash so they can be raised later without breaking old PINs. ──

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keyLen: number;
}
/** 32 MiB and roughly 100 ms per hash. */
export const SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1, keyLen: 32 };

export interface PinHash extends ScryptParams {
  hash: string;
  salt: string;
  /** Kept so a PIN that became too short for a new role can be cleared (see users.updateUser). */
  length: number;
}

function derive(pin: string, salt: Buffer, pepper: string, params: ScryptParams): Promise<Buffer> {
  if (!pepper) throw new Error('PIN_PEPPER is not set.');
  const peppered = createHmac('sha256', pepper).update(pin).digest();
  const { N, r, p, keyLen } = params;
  return new Promise((resolve, reject) =>
    scrypt(peppered, salt, keyLen, { N, r, p, maxmem: 256 * N * r }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPin(pin: string, pepper: string, params: ScryptParams = SCRYPT_PARAMS): Promise<PinHash> {
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
