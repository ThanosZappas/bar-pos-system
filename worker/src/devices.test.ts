import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deviceProfiles, forgetProfile, profileSignIn, registerDevice, removeDevice, setBiometric } from './devices';
import { setPin, type PinDeps } from './pins';
import { asPassword, asPin, clearEmulators, onEmulators, seedUser, signInWithToken, testDeps } from './testkit';
import { deleteUser, updateUser } from './users';

describe.skipIf(!onEmulators)('phones and profile sign-in (emulators)', () => {
  let deps: PinDeps;
  let adminUid: string;
  let maria: string;
  let nikos: string;

  beforeAll(() => {
    deps = testDeps();
  });
  beforeEach(async () => {
    await clearEmulators();
    adminUid = await seedUser(deps, 'admin', 'admin');
    maria = await seedUser(deps, 'maria', 'server');
    nikos = await seedUser(deps, 'nikos', 'server');
  });

  /** Maria signs in with her password on a new phone and chooses PIN 4821. */
  async function mariasPhone() {
    const phone = await registerDevice(deps, asPassword(maria), { name: 'Xiaomi Mi 10T Pro' });
    await setPin(deps, asPassword(maria), { pin: '4821' });
    return { deviceId: phone.deviceId, deviceSecret: phone.deviceSecret! };
  }

  it('a password sign-in registers the phone once and returns its key only then', async () => {
    await expect(registerDevice(deps, asPin(maria), {})).rejects.toMatchObject({ details: { reason: 'needPassword' } });
    const first = await registerDevice(deps, asPassword(maria), { name: 'Xiaomi Mi 10T Pro' });
    expect(first.deviceId).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(first.deviceSecret!.length).toBeGreaterThanOrEqual(43);
    const device = (await deps.db.doc(`devices/${first.deviceId}`).get()).data();
    expect(device).toMatchObject({ name: 'Xiaomi Mi 10T Pro', profiles: [maria], createdBy: maria });
    expect(JSON.stringify(device)).not.toContain(first.deviceSecret);
    const stored = (await deps.db.doc(`deviceSecrets/${first.deviceId}`).get()).data();
    expect(JSON.stringify(stored)).not.toContain(first.deviceSecret);

    const again = await registerDevice(deps, asPassword(nikos), { deviceId: first.deviceId, deviceSecret: first.deviceSecret });
    expect(again).toEqual({ deviceId: first.deviceId });
    expect((await deps.db.doc(`devices/${first.deviceId}`).get()).get('profiles')).toEqual([maria, nikos]);
  });

  it('a wrong phone key registers a new phone instead', async () => {
    const first = await registerDevice(deps, asPassword(maria), {});
    const other = await registerDevice(deps, asPassword(nikos), { deviceId: first.deviceId, deviceSecret: 'guess' });
    expect(other.deviceId).not.toBe(first.deviceId);
    expect(other.deviceSecret).toBeDefined();
  });

  it('the grid shows name and icon (role default), PIN state and lock, never secrets', async () => {
    const phone = await mariasPhone();
    await registerDevice(deps, asPassword(nikos), phone);
    const { profiles } = await deviceProfiles(deps, phone);
    expect(profiles).toEqual([
      { uid: maria, displayName: 'maria', icon: 'person', hasPin: true, lockedUntilMs: null, biometric: false, photoVersion: null },
      { uid: nikos, displayName: 'nikos', icon: 'person', hasPin: false, lockedUntilMs: null, biometric: false, photoVersion: null },
    ]);
    await expect(deviceProfiles(deps, { ...phone, deviceSecret: 'wrong' })).rejects.toMatchObject({ details: { reason: 'device' } });
  });

  it('hides deactivated profiles and drops deleted ones from the phone', async () => {
    const phone = await mariasPhone();
    await registerDevice(deps, asPassword(nikos), phone);
    await updateUser(deps, adminUid, { uid: nikos, active: false });
    expect((await deviceProfiles(deps, phone)).profiles.map((p) => p.uid)).toEqual([maria]);
    await updateUser(deps, adminUid, { uid: nikos, active: true });
    await deleteUser(deps, adminUid, { uid: nikos });
    expect((await deviceProfiles(deps, phone)).profiles.map((p) => p.uid)).toEqual([maria]);
    expect((await deps.db.doc(`devices/${phone.deviceId}`).get()).get('profiles')).toEqual([maria]);
  });

  it('the right PIN on a registered phone returns a working custom token', async () => {
    const phone = await mariasPhone();
    const { token } = await profileSignIn(deps, { ...phone, uid: maria, pin: '4821' });
    const claims = await signInWithToken(token);
    expect(claims.user_id).toBe(maria);
    expect(claims.firebase.sign_in_provider).toBe('custom');
  });

  it('refuses a wrong PIN, another phone, a profile not on the phone, and deactivated or barred staff', async () => {
    const phone = await mariasPhone();
    await expect(profileSignIn(deps, { ...phone, uid: maria, pin: '0000' })).rejects.toMatchObject({ code: 'permission-denied', details: { reason: 'wrongPin', triesLeft: 4 } });
    await expect(profileSignIn(deps, { deviceId: phone.deviceId, deviceSecret: 'x', uid: maria, pin: '4821' })).rejects.toMatchObject({ details: { reason: 'device' } });
    await expect(profileSignIn(deps, { ...phone, uid: nikos, pin: '4821' })).rejects.toMatchObject({ details: { reason: 'notOnDevice' } });
    await deps.db.doc(`users/${maria}`).update({ rights: { logIn: false } });
    await expect(profileSignIn(deps, { ...phone, uid: maria, pin: '4821' })).rejects.toMatchObject({ details: { reason: 'loginNotAllowed' } });
    await deps.db.doc(`users/${maria}`).update({ rights: {} });
    await updateUser(deps, adminUid, { uid: maria, active: false });
    await expect(profileSignIn(deps, { ...phone, uid: maria, pin: '4821' })).rejects.toMatchObject({ details: { reason: 'deactivated' } });
  });

  it('a profile without a PIN must use the password; a locked one says until when', async () => {
    const phone = await mariasPhone();
    await registerDevice(deps, asPassword(nikos), phone);
    await expect(profileSignIn(deps, { ...phone, uid: nikos, pin: '1234' })).rejects.toMatchObject({ details: { reason: 'noPin' } });
    for (let i = 0; i < 5; i++) await profileSignIn(deps, { ...phone, uid: maria, pin: '0000' }).catch(() => undefined);
    await expect(profileSignIn(deps, { ...phone, uid: maria, pin: '4821' })).rejects.toMatchObject({ code: 'resource-exhausted', details: { reason: 'locked' } });
    expect((await deviceProfiles(deps, phone)).profiles[0]!.lockedUntilMs).toBeGreaterThan(Date.now());
    // Her password, on the phone, proves who she is and clears the lock.
    await registerDevice(deps, asPassword(maria), phone);
    expect((await profileSignIn(deps, { ...phone, uid: maria, pin: '4821' })).token).toBeTruthy();
  });

  it('remove from this phone; the admin removes a whole phone', async () => {
    const phone = await mariasPhone();
    await registerDevice(deps, asPassword(nikos), phone);
    await forgetProfile(deps, { ...phone, uid: nikos });
    expect((await deviceProfiles(deps, phone)).profiles.map((p) => p.uid)).toEqual([maria]);

    await expect(removeDevice(deps, maria, { deviceId: phone.deviceId })).rejects.toMatchObject({ code: 'permission-denied' });
    await removeDevice(deps, adminUid, { deviceId: phone.deviceId });
    await expect(profileSignIn(deps, { ...phone, uid: maria, pin: '4821' })).rejects.toMatchObject({ details: { reason: 'device' } });
    expect((await deps.db.doc(`deviceSecrets/${phone.deviceId}`).get()).exists).toBe(false);
  });

  it('fingerprint unlock: only with a PIN, only on a one-profile phone, off when a second profile arrives', async () => {
    const phone = await registerDevice(deps, asPassword(maria), {});
    const keys = { deviceId: phone.deviceId, deviceSecret: phone.deviceSecret! };
    await expect(setBiometric(deps, asPassword(maria), { ...keys, on: true })).rejects.toMatchObject({ details: { reason: 'noPin' } });
    await setPin(deps, asPassword(maria), { pin: '4821' });
    const { secret } = await setBiometric(deps, asPin(maria), { ...keys, on: true });
    expect((await deviceProfiles(deps, keys)).profiles[0]!.biometric).toBe(true);

    const { token } = await profileSignIn(deps, { ...keys, uid: maria, biometricSecret: secret });
    expect((await signInWithToken(token)).user_id).toBe(maria);
    await expect(profileSignIn(deps, { ...keys, uid: maria, biometricSecret: 'guess' })).rejects.toMatchObject({ details: { reason: 'biometric' } });

    await registerDevice(deps, asPassword(nikos), keys);
    await expect(profileSignIn(deps, { ...keys, uid: maria, biometricSecret: secret })).rejects.toMatchObject({ details: { reason: 'biometric' } });
    expect((await deviceProfiles(deps, keys)).profiles[0]!.biometric).toBe(false);
    await setPin(deps, asPassword(nikos), { pin: '1111' });
    await expect(setBiometric(deps, asPin(nikos), { ...keys, on: true })).rejects.toMatchObject({ details: { reason: 'sharedPhone' } });
  });

  it('turning fingerprint unlock off forgets the secret', async () => {
    const keys = await mariasPhone();
    const { secret } = await setBiometric(deps, asPin(maria), { ...keys, on: true });
    await setBiometric(deps, asPin(maria), { ...keys, on: false });
    await expect(profileSignIn(deps, { ...keys, uid: maria, biometricSecret: secret })).rejects.toMatchObject({ details: { reason: 'biometric' } });
  });
});
