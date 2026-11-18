import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import worker, { type Env } from '../index';
import { HttpsError } from './errors';
import { decodeCallable, handleCall } from './callable';
import { PEPPER, PROJECT, clearEmulators, onEmulators, seedUser, testDeps } from '../testkit';
import type { PinDeps } from '../pins';

const fakeAuth = { verifyIdToken: async () => { throw new Error('no'); } } as never;
const post = (name: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://api.example/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('callable protocol', () => {
  it("decodes the Android SDK's Long values", () => {
    expect(decodeCallable({ photos: { u1: { '@type': 'type.googleapis.com/google.protobuf.Int64Value', value: '1800000000123' } }, n: [1] }))
      .toEqual({ photos: { u1: 1_800_000_000_123 }, n: [1] });
  });

  it('answers { result } and maps errors to { error: { status, message, details } }', async () => {
    const handlers = {
      ok: async () => ({ token: 't' }),
      nothing: async () => undefined,
      refused: async () => { throw new HttpsError('permission-denied', 'Wrong PIN.', { reason: 'wrongPin', triesLeft: 3 }); },
      broken: async () => { throw new Error('secret detail'); },
    };
    let res = await handleCall(post('ok', { data: {} }), fakeAuth, handlers);
    expect([res.status, await res.json()]).toEqual([200, { result: { token: 't' } }]);
    res = await handleCall(post('nothing', { data: null }), fakeAuth, handlers);
    expect(await res.json()).toEqual({ result: null });
    res = await handleCall(post('refused', { data: {} }), fakeAuth, handlers);
    expect([res.status, await res.json()]).toEqual([403, { error: { status: 'PERMISSION_DENIED', message: 'Wrong PIN.', details: { reason: 'wrongPin', triesLeft: 3 } } }]);
    res = await handleCall(post('broken', { data: {} }), fakeAuth, handlers);
    expect([res.status, await res.json()]).toEqual([500, { error: { status: 'INTERNAL', message: 'Internal error.' } }]); // never leaks details
    res = await handleCall(post('nope', { data: {} }), fakeAuth, handlers);
    expect(res.status).toBe(404);
    res = await handleCall(post('ok', { data: {} }, { authorization: 'Bearer forged' }), fakeAuth, handlers);
    expect([res.status, (await res.json()).error.status]).toEqual([401, 'UNAUTHENTICATED']);
    res = await handleCall(new Request('https://api.example/ok', { method: 'POST', body: 'not json' }), fakeAuth, handlers);
    expect(res.status).toBe(400);
  });

  it('allows the dashboard to call it from the browser (CORS)', async () => {
    const res = await handleCall(new Request('https://api.example/ok', { method: 'OPTIONS', headers: { 'access-control-request-headers': 'authorization,content-type' } }), fakeAuth, {});
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toBe('authorization,content-type');
  });
});

describe.skipIf(!onEmulators)('the Worker end to end (emulators)', () => {
  let deps: PinDeps;
  const env: Env = {
    FIREBASE_PROJECT_ID: PROJECT,
    PIN_PEPPER: PEPPER,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  };
  beforeAll(() => {
    deps = testDeps();
  });
  beforeEach(clearEmulators);

  async function idToken(email: string, password: string): Promise<string> {
    const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return ((await res.json()) as { idToken: string }).idToken;
  }

  it('a password sign-in registers the phone, then the PIN signs in with a custom token', async () => {
    const maria = await seedUser(deps, 'maria', 'server');
    const token = await idToken('maria@users.negronibarlab.invalid', 'mariamaria');
    const call = async (name: string, data: unknown, auth = true) => {
      const res = await worker.fetch(post(name, { data }, auth ? { authorization: `Bearer ${token}` } : {}), env);
      return (await res.json()) as { result?: any; error?: any };
    };
    const phone = (await call('registerDevice', { name: 'Test phone' })).result;
    expect(phone.deviceSecret).toBeDefined();
    expect((await call('setPin', { pin: '4821' })).result).toBeNull();
    const grid = (await call('deviceProfiles', { deviceId: phone.deviceId, deviceSecret: phone.deviceSecret }, false)).result;
    expect(grid.profiles).toMatchObject([{ uid: maria, hasPin: true, icon: 'person' }]);
    const wrong = await call('profileSignIn', { deviceId: phone.deviceId, deviceSecret: phone.deviceSecret, uid: maria, pin: '0000' }, false);
    expect(wrong.error).toMatchObject({ status: 'PERMISSION_DENIED', details: { reason: 'wrongPin', triesLeft: 4 } });
    const ok = await call('profileSignIn', { deviceId: phone.deviceId, deviceSecret: phone.deviceSecret, uid: maria, pin: '4821' }, false);
    expect(typeof ok.result.token).toBe('string');
    expect((await call('createUser', { username: 'x', displayName: 'X', role: 'server', password: 'xxxxxx' })).error.status).toBe('PERMISSION_DENIED');
  });
});
