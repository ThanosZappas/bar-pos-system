import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attemptPin,
  checkPin,
  FIRST_LOCK_MS,
  FREE_TRIES,
  hashPin,
  lockMs,
  MAX_LOCK_MS,
  resetPin,
  SCRYPT_PARAMS,
  setPin,
  unlockPin,
  verifyPin,
  type PinDeps,
} from './pins';

const PEPPER = 'test-pepper-not-a-secret';
/** Cheap parameters where the test is about something other than the cost. */
const FAST = { N: 2 ** 10, r: 8, p: 1, keyLen: 32 };

describe('PIN hashing', () => {
  it('stores a salted scrypt hash, never the PIN', async () => {
    const stored = await hashPin('583920', PEPPER);
    expect(stored).toMatchObject({ ...SCRYPT_PARAMS, length: 6 });
    expect(JSON.stringify(stored)).not.toContain('583920');
    expect(Buffer.from(stored.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(stored.hash, 'base64')).toHaveLength(32);
    expect(await verifyPin('583920', stored, PEPPER)).toBe(true);
    expect(await verifyPin('583921', stored, PEPPER)).toBe(false);
  });

  it('salts every hash, so the same PIN never hashes the same way twice', async () => {
    const a = await hashPin('1234', PEPPER, FAST);
    const b = await hashPin('1234', PEPPER, FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPin('1234', a, PEPPER)).toBe(true);
    expect(await verifyPin('1234', b, PEPPER)).toBe(true);
  });

  it('is useless without the pepper', async () => {
    const stored = await hashPin('1234', PEPPER, FAST);
    expect(await verifyPin('1234', stored, 'another-pepper')).toBe(false);
    await expect(hashPin('1234', '', FAST)).rejects.toThrow('PIN_PEPPER');
  });

  it('verifies with the parameters stored next to the hash', async () => {
    const stored = await hashPin('0000', PEPPER, FAST);
    expect(stored).toMatchObject(FAST);
    expect(await verifyPin('0000', stored, PEPPER)).toBe(true);
    expect(await verifyPin('0000', { ...stored, N: 2 ** 11 }, PEPPER)).toBe(false);
  });
});

describe('PIN rules', () => {
  it('servers need 4 to 8 digits; admin and barman 6 to 8', () => {
    expect(checkPin('1234', 'server')).toBe('1234');
    expect(checkPin('12345678', 'server')).toBe('12345678');
    expect(() => checkPin('123', 'server')).toThrow('4 to 8 digits');
    expect(() => checkPin('123456789', 'server')).toThrow();
    expect(() => checkPin('12345', 'admin')).toThrow('6 to 8 digits');
    expect(() => checkPin('12345', 'barman')).toThrow('6 to 8 digits');
    expect(checkPin('123456', 'admin')).toBe('123456');
  });

  it('accepts any digits (no rules on which ones) but nothing else', () => {
    for (const pin of ['0000', '1111', '1234', '9876']) expect(checkPin(pin, 'server')).toBe(pin);
    for (const pin of ['12a4', ' 1234', '12 34', '١٢٣٤', 1234, null]) expect(() => checkPin(pin, 'server')).toThrow();
  });
});

describe('lockout schedule', () => {
  it('allows 5 tries, then locks 1 minute, doubling up to 1 hour', () => {
    for (let n = 0; n < FREE_TRIES; n++) expect(lockMs(n)).toBe(0);
    expect(lockMs(5)).toBe(FIRST_LOCK_MS);
    expect(lockMs(6)).toBe(2 * 60_000);
    expect(lockMs(7)).toBe(4 * 60_000);
    expect(lockMs(10)).toBe(32 * 60_000);
    expect(lockMs(11)).toBe(MAX_LOCK_MS);
    expect(lockMs(50)).toBe(MAX_LOCK_MS);
  });
});

// Runs only inside `firebase emulators:exec --only auth,firestore` (see root package.json).
const onEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-negroni';

describe.skipIf(!onEmulators)('PIN functions (emulators)', () => {
  let app: App;
  let deps: PinDeps;
  let adminUid: string;
  let serverUid: string;

  async function clearEmulators() {
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  }

  async function seedUser(username: string, role: string) {
    const u = await deps.auth.createUser({ email: `${username}@users.negronibarlab.invalid`, password: `${username}${username}` });
    await deps.db.doc(`users/${u.uid}`).set({ username, displayName: username, role, active: true, mustChangePassword: false });
    return u.uid;
  }

  const secret = async (uid: string) => (await deps.db.doc(`pinSecrets/${uid}`).get()).data();
  const profile = async (uid: string) => (await deps.db.doc(`users/${uid}`).get()).data();
  const asPassword = (uid: string) => ({ uid, provider: 'password' });
  const asPin = (uid: string) => ({ uid, provider: 'custom' });

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'pins-test');
    deps = { auth: getAuth(app), db: getFirestore(app), pepper: PEPPER };
  });
  afterAll(async () => deleteApp(app));
  beforeEach(async () => {
    await clearEmulators();
    adminUid = await seedUser('admin', 'admin');
    serverUid = await seedUser('user1', 'server');
  });

  it('the first PIN needs a password sign-in; it is stored hashed and marks the profile', async () => {
    await expect(setPin(deps, asPin(serverUid), { pin: '4821' })).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'needPassword' } });
    await setPin(deps, asPassword(serverUid), { pin: '4821' });
    const stored = await secret(serverUid);
    expect(stored).toMatchObject({ failed: 0, lockedUntil: null, pin: { length: 4 } });
    expect(JSON.stringify(stored)).not.toContain('4821');
    expect(await profile(serverUid)).toMatchObject({ pinSet: true });
    const log = await deps.db.collection('auditLog').where('action', '==', 'pin.set').get();
    expect(log.size).toBe(1);
    expect(JSON.stringify(log.docs[0]!.data())).not.toContain('4821');
  });

  it('refuses a PIN of the wrong length for the role, and before the password change', async () => {
    await expect(setPin(deps, asPassword(adminUid), { pin: '4821' })).rejects.toMatchObject({ code: 'invalid-argument', details: { min: 6 } });
    await setPin(deps, asPassword(adminUid), { pin: '482193' });
    await deps.db.doc(`users/${serverUid}`).update({ mustChangePassword: true });
    await expect(setPin(deps, asPassword(serverUid), { pin: '4821' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(setPin(deps, {}, { pin: '4821' })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('changing a PIN needs the current one, and a wrong one counts as a try', async () => {
    await setPin(deps, asPassword(serverUid), { pin: '4821' });
    await expect(setPin(deps, asPin(serverUid), { pin: '7777' })).rejects.toMatchObject({ details: { reason: 'currentPin' } });
    await expect(setPin(deps, asPin(serverUid), { pin: '7777', currentPin: '0000' })).rejects.toMatchObject({ details: { reason: 'wrongPin', triesLeft: 4 } });
    await setPin(deps, asPin(serverUid), { pin: '7777', currentPin: '4821' });
    expect(await attemptPin(deps, serverUid, '7777')).toEqual({ kind: 'ok' });
    expect((await secret(serverUid))!.failed).toBe(0);
  });

  it('locks after 5 wrong PINs, refuses even the right PIN while locked, then doubles the lock', async () => {
    await setPin(deps, asPassword(serverUid), { pin: '4821' });
    const t0 = Date.UTC(2026, 10, 17, 20, 0);
    for (let i = 1; i < FREE_TRIES; i++) {
      expect(await attemptPin(deps, serverUid, '0000', t0)).toEqual({ kind: 'wrong', triesLeft: FREE_TRIES - i, lockedUntilMs: null });
    }
    expect(await attemptPin(deps, serverUid, '0000', t0)).toEqual({ kind: 'wrong', triesLeft: 0, lockedUntilMs: t0 + 60_000 });
    expect((await profile(serverUid))!.pinLockedUntil.toMillis()).toBe(t0 + 60_000);

    expect(await attemptPin(deps, serverUid, '4821', t0 + 59_000)).toEqual({ kind: 'locked', lockedUntilMs: t0 + 60_000 });
    expect((await secret(serverUid))!.failed).toBe(5); // tries while locked are not counted

    const t1 = t0 + 60_000;
    expect(await attemptPin(deps, serverUid, '0000', t1)).toEqual({ kind: 'wrong', triesLeft: 0, lockedUntilMs: t1 + 120_000 });

    const t2 = t1 + 120_000;
    expect(await attemptPin(deps, serverUid, '4821', t2)).toEqual({ kind: 'ok' });
    expect(await secret(serverUid)).toMatchObject({ failed: 0, lockedUntil: null });
    expect((await profile(serverUid))!.pinLockedUntil).toBeUndefined();
  });

  it('counts parallel guesses one by one', async () => {
    await setPin(deps, asPassword(serverUid), { pin: '4821' });
    const results = await Promise.all(['0001', '0002', '0003', '0004', '0005', '0006'].map((pin) => attemptPin(deps, serverUid, pin)));
    expect(results.filter((r) => r.kind === 'wrong')).toHaveLength(FREE_TRIES);
    expect(results.filter((r) => r.kind === 'locked')).toHaveLength(1);
    expect((await secret(serverUid))!.failed).toBe(FREE_TRIES);
  }, 60_000);

  it('a profile without a PIN says so', async () => {
    expect(await attemptPin(deps, serverUid, '4821')).toEqual({ kind: 'noPin' });
  });

  it('admin unlocks a locked profile', async () => {
    await setPin(deps, asPassword(serverUid), { pin: '4821' });
    for (let i = 0; i < FREE_TRIES; i++) await attemptPin(deps, serverUid, '0000');
    await expect(unlockPin(deps, serverUid, { uid: serverUid })).rejects.toMatchObject({ code: 'permission-denied' });
    await unlockPin(deps, adminUid, { uid: serverUid });
    expect(await secret(serverUid)).toMatchObject({ failed: 0, lockedUntil: null });
    expect(await attemptPin(deps, serverUid, '4821')).toEqual({ kind: 'ok' });
  });

  it('admin resets a PIN: it is gone, the profile must choose a new one with its password', async () => {
    await setPin(deps, asPassword(serverUid), { pin: '4821' });
    await expect(resetPin(deps, serverUid, { uid: serverUid })).rejects.toMatchObject({ code: 'permission-denied' });
    await resetPin(deps, adminUid, { uid: serverUid });
    expect(await secret(serverUid)).toBeUndefined();
    expect(await profile(serverUid)).toMatchObject({ pinSet: false });
    expect(await attemptPin(deps, serverUid, '4821')).toEqual({ kind: 'noPin' });
    // A session opened with the old PIN cannot choose the new one.
    await expect(setPin(deps, asPin(serverUid), { pin: '1111' })).rejects.toMatchObject({ details: { reason: 'needPassword' } });
    await setPin(deps, asPassword(serverUid), { pin: '1111' });
    await expect(resetPin(deps, adminUid, { uid: 'nobody' })).rejects.toMatchObject({ code: 'not-found' });
  });
});
