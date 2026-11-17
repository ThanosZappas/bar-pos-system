import { deleteApp, type App } from 'firebase-admin/app';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_PHOTO_BYTES, parsePhoto, setIcon } from './avatars';
import { deviceProfiles, registerDevice } from './devices';
import { defaultIcon, iconOf, ICONS } from './icons';
import type { PinDeps } from './pins';
import { asPassword, clearEmulators, onEmulators, seedUser, testDeps } from './testkit';
import { createUser } from './users';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);

describe('icons and pictures', () => {
  it('defaults by role: admin, barman, person', () => {
    expect(defaultIcon('admin')).toBe('admin');
    expect(defaultIcon('barman')).toBe('barman');
    expect(defaultIcon('server')).toBe('person');
    expect(iconOf({ role: 'server', icon: 'martini' })).toBe('martini');
    expect(iconOf({ role: 'barman', icon: 'not-an-icon' })).toBe('barman');
    expect(ICONS).toHaveLength(16);
  });

  it('accepts small JPEG, PNG and WebP pictures only', () => {
    expect(parsePhoto(JPEG.toString('base64')).type).toBe('image/jpeg');
    expect(parsePhoto(PNG.toString('base64')).type).toBe('image/png');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(50)]);
    expect(parsePhoto(webp.toString('base64')).type).toBe('image/webp');
    expect(() => parsePhoto(Buffer.from('<svg onload=alert(1)>').toString('base64'))).toThrow('JPEG, PNG or WebP');
    expect(() => parsePhoto(Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]).toString('base64'))).toThrow('too large');
    expect(() => parsePhoto('')).toThrow();
  });
});

describe.skipIf(!onEmulators)('setIcon (emulators)', () => {
  let app: App;
  let deps: PinDeps;
  let adminUid: string;
  let maria: string;
  let nikos: string;

  beforeAll(() => ({ app, deps } = testDeps('avatars-test')));
  afterAll(async () => deleteApp(app));
  beforeEach(async () => {
    await clearEmulators();
    adminUid = await seedUser(deps, 'admin', 'admin');
    maria = await seedUser(deps, 'maria', 'server');
    nikos = await seedUser(deps, 'nikos', 'server');
  });
  const profile = async (uid: string) => (await deps.db.doc(`users/${uid}`).get()).data()!;

  it('each person sets their own icon; only the admin sets someone else\'s', async () => {
    await setIcon(deps, maria, { icon: 'martini' });
    expect((await profile(maria)).icon).toBe('martini');
    await expect(setIcon(deps, maria, { uid: nikos, icon: 'star' })).rejects.toMatchObject({ code: 'permission-denied' });
    await setIcon(deps, adminUid, { uid: nikos, icon: 'anchor' });
    expect((await profile(nikos)).icon).toBe('anchor');
    await expect(setIcon(deps, maria, { icon: 'skull' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(setIcon(deps, undefined, { icon: 'star' })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('a picture is stored as bytes with a version; the phone downloads it only when it changed', async () => {
    const phone = await registerDevice(deps, asPassword(maria), {});
    const keys = { deviceId: phone.deviceId, deviceSecret: phone.deviceSecret! };
    await setIcon(deps, maria, { photo: JPEG.toString('base64') });
    const version = (await profile(maria)).photoVersion as number;
    expect(version).toBeGreaterThan(0);
    const avatar = (await deps.db.doc(`avatars/${maria}`).get()).data()!;
    expect(Buffer.from(avatar.photo).equals(JPEG)).toBe(true);
    expect(avatar.type).toBe('image/jpeg');

    const first = (await deviceProfiles(deps, keys)).profiles[0]!;
    expect(first.photo).toBe(JPEG.toString('base64'));
    expect(first.photoVersion).toBe(version);
    const cached = (await deviceProfiles(deps, { ...keys, photos: { [maria]: version } })).profiles[0]!;
    expect(cached.photo).toBeUndefined();
  });

  it('choosing an icon or removing the picture drops it', async () => {
    await setIcon(deps, maria, { photo: PNG.toString('base64') });
    await setIcon(deps, maria, { photo: null });
    expect((await profile(maria)).photoVersion).toBeUndefined();
    expect((await deps.db.doc(`avatars/${maria}`).get()).exists).toBe(false);
    await setIcon(deps, adminUid, { uid: maria, photo: PNG.toString('base64') });
    await setIcon(deps, maria, { icon: 'moon' });
    expect(await profile(maria)).toMatchObject({ icon: 'moon' });
    expect((await profile(maria)).photoVersion).toBeUndefined();
  });

  it('createUser takes an icon; new users start without a PIN', async () => {
    const { uid } = await createUser(deps, adminUid, { username: 'eleni', displayName: 'Eleni', role: 'barman', password: 'eleni-temp', icon: 'shaker' });
    expect(await profile(uid)).toMatchObject({ icon: 'shaker', pinSet: false });
    await expect(createUser(deps, adminUid, { username: 'kostas', displayName: 'K', role: 'server', password: 'kostas-temp', icon: 'nope' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
