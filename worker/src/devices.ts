import { Buffer } from 'node:buffer';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue } from './google/firestore.js';
import { HttpsError } from './http/errors.js';
import { iconOf } from './icons.js';
import { attemptError, attemptPin, clearLock, pinSecretRef, type Caller, type PinDeps, type PinSecret } from './pins.js';
import { asData, audit, loadUser, requireAdmin, requireString, type Data, type Deps, type UserDoc } from './users.js';

/**
 * Phones that may sign staff in with a PIN.
 *
 * A phone is registered the first time someone signs in on it with their password
 * (registerDevice): it gets an id and a random 256-bit key, which it keeps encrypted with the
 * Android Keystore. From then on that person's profile is on the phone's grid and signs in with
 * the phone key + PIN (profileSignIn), which returns a Firebase custom token. Anyone else adds
 * their profile to the same phone by signing in there once with their own password.
 *
 * devices/{id} (the admin can read it): name, profiles (uids), createdAt/By, lastUsedAt.
 * deviceSecrets/{id} (functions only): SHA-256 of the phone key. A fast hash is right here: the
 * key is 256 random bits, not something a person chose.
 */

export interface DeviceDoc {
  name: string;
  profiles: string[];
}

interface Device {
  id: string;
  data: DeviceDoc;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64');
const newKey = () => randomBytes(32).toString('base64url');

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'base64');
  const y = Buffer.from(b, 'base64');
  return x.length === y.length && timingSafeEqual(x, y);
}

const deviceRef = (deps: Deps, id: string) => deps.db.doc(`devices/${id}`);
const deviceSecretRef = (deps: Deps, id: string) => deps.db.doc(`deviceSecrets/${id}`);

/** The phone named by deviceId, if deviceSecret is its key. */
async function findDevice(deps: Deps, data: Data): Promise<Device | null> {
  const { deviceId, deviceSecret } = data;
  if (typeof deviceId !== 'string' || typeof deviceSecret !== 'string') return null;
  if (!/^[A-Za-z0-9]{1,40}$/.test(deviceId) || deviceSecret.length > 100) return null;
  const [secret, device] = await Promise.all([deviceSecretRef(deps, deviceId).get(), deviceRef(deps, deviceId).get()]);
  const hash = secret.get('hash');
  if (typeof hash !== 'string' || !device.exists || !sameHash(sha256(deviceSecret), hash)) return null;
  return { id: deviceId, data: device.data() as DeviceDoc };
}

async function requireDevice(deps: Deps, data: Data): Promise<Device> {
  const device = await findDevice(deps, data);
  if (!device) throw new HttpsError('permission-denied', 'This phone is not registered. Sign in with your password.', { reason: 'device' });
  return device;
}

/** Turns fingerprint unlock off on this phone for these profiles. */
async function dropBiometric(deps: Deps, deviceId: string, uids: string[]): Promise<void> {
  for (const uid of uids) {
    const ref = pinSecretRef(deps, uid);
    const secret = (await ref.get()).data() as PinSecret | undefined;
    if (secret?.biometric?.[deviceId]) await ref.update({ [`biometric.${deviceId}`]: FieldValue.delete() });
  }
}

function deviceName(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim().slice(0, 60) : 'Phone';
}

/**
 * Called by the phone right after a password sign-in: registers the phone (first time; returns
 * its key once) and puts the caller's profile on it. The password proves who it is, so it also
 * clears their wrong-PIN count. A second profile turns fingerprint unlock off on that phone,
 * because a fingerprint opens the whole phone, not one profile.
 */
export async function registerDevice(deps: Deps, caller: Caller, raw: unknown): Promise<{ deviceId: string; deviceSecret?: string }> {
  if (!caller.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (caller.provider !== 'password') throw new HttpsError('failed-precondition', 'Sign in with your password on this phone.', { reason: 'needPassword' });
  const uid = caller.uid;
  const me = await loadUser(deps, uid);
  if (!me || me.deleted || !me.active) throw new HttpsError('permission-denied', 'This account is deactivated.');
  const data = asData(raw ?? {});
  const name = deviceName(data.name);

  let result: { deviceId: string; deviceSecret?: string };
  const existing = await findDevice(deps, data);
  if (existing) {
    const isNew = !existing.data.profiles.includes(uid);
    if (isNew && existing.data.profiles.length > 0) await dropBiometric(deps, existing.id, existing.data.profiles);
    await deviceRef(deps, existing.id).update({ profiles: FieldValue.arrayUnion(uid), name, lastUsedAt: FieldValue.serverTimestamp() });
    if (isNew) await audit(deps, 'device.addProfile', uid, uid, { deviceId: existing.id, name });
    result = { deviceId: existing.id };
  } else {
    const id = deps.db.collection('devices').doc().id;
    const key = newKey();
    await deviceSecretRef(deps, id).set({ hash: sha256(key), createdAt: FieldValue.serverTimestamp() });
    await deviceRef(deps, id).set({
      name,
      profiles: [uid],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      lastUsedAt: FieldValue.serverTimestamp(),
    });
    await audit(deps, 'device.register', uid, uid, { deviceId: id, name });
    result = { deviceId: id, deviceSecret: key };
  }
  await clearLock(deps, uid);
  return result;
}

export interface DeviceProfile {
  uid: string;
  displayName: string;
  icon: string;
  hasPin: boolean;
  lockedUntilMs: number | null;
  /** Fingerprint unlock is on for this profile on this phone. */
  biometric: boolean;
  photoVersion: number | null;
  /** base64; only when the phone's copy (`photos[uid]` in the request) is out of date. */
  photo?: string;
}

/**
 * The grid for a phone before anyone signs in: name, icon (or picture), PIN state. Deactivated
 * profiles are left out (they come back if reactivated); deleted ones are removed from the phone.
 */
export async function deviceProfiles(deps: Deps, raw: unknown, nowMs = Date.now()): Promise<{ profiles: DeviceProfile[] }> {
  const data = asData(raw);
  const device = await requireDevice(deps, data);
  const known = (typeof data.photos === 'object' && data.photos !== null ? data.photos : {}) as Record<string, unknown>;
  const profiles: DeviceProfile[] = [];
  const gone: string[] = [];
  // Three batch reads for the whole grid: Cloudflare's free plan allows 50 requests per call.
  const uids = device.data.profiles;
  const [userSnaps, secretSnaps] = await Promise.all([
    deps.db.getAll(...uids.map((uid) => deps.db.doc(`users/${uid}`))),
    deps.db.getAll(...uids.map((uid) => pinSecretRef(deps, uid))),
  ]);
  const stale = uids.filter((uid, i) => {
    const v = userSnaps[i]!.get('photoVersion');
    return typeof v === 'number' && known[uid] !== v;
  });
  const photoSnaps = await deps.db.getAll(...stale.map((uid) => deps.db.doc(`avatars/${uid}`)));
  const photos = new Map(stale.map((uid, i) => [uid, photoSnaps[i]!.get('photo') as Buffer | undefined]));
  uids.forEach((uid, i) => {
    const user = userSnaps[i]!.data() as UserDoc | undefined;
    if (!user || user.deleted) {
      gone.push(uid);
      return;
    }
    if (!user.active) return;
    const secret = secretSnaps[i]!.data() as PinSecret | undefined;
    const lockedUntilMs = secret?.lockedUntil?.toMillis() ?? 0;
    const entry: DeviceProfile = {
      uid,
      displayName: user.displayName,
      icon: iconOf(user),
      hasPin: Boolean(secret?.pin),
      lockedUntilMs: lockedUntilMs > nowMs ? lockedUntilMs : null,
      biometric: Boolean(secret?.biometric?.[device.id]),
      photoVersion: user.photoVersion ?? null,
    };
    const photo = photos.get(uid);
    if (photo) entry.photo = Buffer.from(photo).toString('base64');
    profiles.push(entry);
  });
  if (gone.length) await deviceRef(deps, device.id).update({ profiles: FieldValue.arrayRemove(...gone) });
  return { profiles };
}

/**
 * Signs a profile in on a registered phone with its PIN, or with the fingerprint-unlock secret the
 * phone keeps behind the fingerprint. Returns a Firebase custom token for signInWithCustomToken.
 */
export async function profileSignIn(deps: PinDeps, raw: unknown): Promise<{ token: string }> {
  const data = asData(raw);
  const device = await requireDevice(deps, data);
  const uid = requireString(data, 'uid');
  if (!device.data.profiles.includes(uid)) {
    throw new HttpsError('permission-denied', 'This profile is not on this phone. Sign in with your password.', { reason: 'notOnDevice' });
  }
  const user = await loadUser(deps, uid);
  if (!user || user.deleted) throw new HttpsError('not-found', 'User not found.', { reason: 'gone' });
  const record = await deps.auth.getUser(uid).catch(() => null);
  if (!user.active || !record || record.disabled) throw new HttpsError('permission-denied', 'This account is deactivated.', { reason: 'deactivated' });
  if (user.role === 'server' && user.rights?.logIn === false) {
    throw new HttpsError('permission-denied', 'You are not allowed to sign in.', { reason: 'loginNotAllowed' });
  }

  if (typeof data.biometricSecret === 'string') {
    const expected = ((await pinSecretRef(deps, uid).get()).data() as PinSecret | undefined)?.biometric?.[device.id];
    if (device.data.profiles.length !== 1 || !expected || !sameHash(sha256(data.biometricSecret), expected)) {
      throw new HttpsError('permission-denied', 'Fingerprint unlock is off on this phone. Use your PIN.', { reason: 'biometric' });
    }
  } else {
    const pin = data.pin;
    if (typeof pin !== 'string' || !/^\d{1,8}$/.test(pin)) throw new HttpsError('invalid-argument', 'Enter your PIN.');
    const attempt = await attemptPin(deps, uid, pin);
    if (attempt.kind !== 'ok') throw attemptError(attempt);
  }
  await deviceRef(deps, device.id).update({ lastUsedAt: FieldValue.serverTimestamp() });
  return { token: await deps.auth.createCustomToken(uid) };
}

/** "Remove from this phone" on the grid. Anyone holding the phone may do it: it only hides the profile. */
export async function forgetProfile(deps: Deps, raw: unknown): Promise<void> {
  const data = asData(raw);
  const device = await requireDevice(deps, data);
  const uid = requireString(data, 'uid');
  if (!device.data.profiles.includes(uid)) return;
  await deviceRef(deps, device.id).update({ profiles: FieldValue.arrayRemove(uid) });
  await dropBiometric(deps, device.id, [uid]);
  await audit(deps, 'device.forgetProfile', `device:${device.id}`, uid, { deviceId: device.id });
}

/** Admin: a lost or replaced phone can no longer sign anyone in (a password sign-in registers it again). */
export async function removeDevice(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const id = requireString(asData(raw), 'deviceId');
  const device = await deviceRef(deps, id).get();
  if (!device.exists) throw new HttpsError('not-found', 'Phone not found.');
  await dropBiometric(deps, id, (device.get('profiles') as string[] | undefined) ?? []);
  await deviceSecretRef(deps, id).delete();
  await deviceRef(deps, id).delete();
  await audit(deps, 'device.remove', actor, id, { name: device.get('name') });
}

/**
 * Turns fingerprint unlock on (returns the secret the phone stores behind the fingerprint) or off,
 * for the caller on this phone. Only on a phone with one profile: a fingerprint opens the whole
 * phone, so on a shared phone anyone enrolled on it could open every profile.
 */
export async function setBiometric(deps: Deps, caller: Caller, raw: unknown): Promise<{ secret?: string }> {
  if (!caller.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = caller.uid;
  const data = asData(raw);
  const device = await requireDevice(deps, data);
  if (!device.data.profiles.includes(uid)) throw new HttpsError('permission-denied', 'This profile is not on this phone.', { reason: 'notOnDevice' });
  if (data.on !== true) {
    await dropBiometric(deps, device.id, [uid]);
    await audit(deps, 'biometric.off', uid, uid, { deviceId: device.id });
    return {};
  }
  if (device.data.profiles.length !== 1) {
    throw new HttpsError('failed-precondition', 'Fingerprint unlock works only on a phone with one profile.', { reason: 'sharedPhone' });
  }
  const ref = pinSecretRef(deps, uid);
  if (!((await ref.get()).data() as PinSecret | undefined)?.pin) throw new HttpsError('failed-precondition', 'Choose a PIN first.', { reason: 'noPin' });
  const secret = newKey();
  await ref.update({ [`biometric.${device.id}`]: sha256(secret) });
  await audit(deps, 'biometric.on', uid, uid, { deviceId: device.id });
  return { secret };
}
