import { Buffer } from 'node:buffer';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearEmulators, onEmulators, testDeps } from '../testkit';
import type { PinDeps } from '../pins';
import { FieldValue, Timestamp } from './firestore';
import { decodeJwt, signRs256, verifyRs256 } from './jwt';
import { decodeValue, encodeValue, fieldPath } from './values';

describe('Firestore values', () => {
  it('round-trip every kind the app stores', () => {
    const ts = Timestamp.fromMillis(1_800_000_000_123);
    const value = { a: null, b: true, n: 42, big: 1_800_000_000_123, d: 1.5, s: 'Μαρία', t: ts, bytes: Buffer.from([1, 2, 255]), list: [1, 'x'], empty: [], map: { x: { y: 1 } } };
    const back = decodeValue(encodeValue(value)) as typeof value;
    expect(back).toMatchObject({ a: null, b: true, n: 42, big: 1_800_000_000_123, d: 1.5, s: 'Μαρία', list: [1, 'x'], empty: [], map: { x: { y: 1 } } });
    expect(back.t.toMillis()).toBe(1_800_000_000_123);
    expect(Buffer.from(back.bytes).equals(Buffer.from([1, 2, 255]))).toBe(true);
  });

  it('reads the timestamps the REST API writes', () => {
    expect(Timestamp.fromString('2026-11-18T20:04:05.123456Z').toMillis()).toBe(Date.UTC(2026, 10, 18, 20, 4, 5, 123));
    expect(Timestamp.fromString('2026-11-18T20:04:05Z').toMillis()).toBe(Date.UTC(2026, 10, 18, 20, 4, 5));
    expect(Timestamp.fromMillis(1_500).toString()).toBe('1970-01-01T00:00:01.500000000Z');
  });

  it('quotes field path segments that are not plain names', () => {
    expect(fieldPath(['biometric', 'abcDEF123'])).toBe('biometric.abcDEF123');
    expect(fieldPath(['biometric', '1abc'])).toBe('biometric.`1abc`');
    expect(fieldPath(['a-b', 'c`d'])).toBe('`a-b`.`c\\`d`');
  });
});

describe('JWT', () => {
  it('signs with RS256 and verifies with the public key, and catches tampering', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n`;
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const token = await signRs256({ uid: 'u1', exp: 9 }, pem, 'k1');
    const jwt = decodeJwt(token);
    expect(jwt.header).toMatchObject({ alg: 'RS256', kid: 'k1' });
    expect(jwt.payload).toEqual({ uid: 'u1', exp: 9 });
    expect(await verifyRs256(jwt, jwk)).toBe(true);
    const [h, , s] = token.split('.');
    const forged = decodeJwt(`${h}.${Buffer.from(JSON.stringify({ uid: 'admin', exp: 9 })).toString('base64url')}.${s}`);
    expect(await verifyRs256(forged, jwk)).toBe(false);
  });
});

describe.skipIf(!onEmulators)('Firestore and Auth over REST (emulators)', () => {
  let deps: PinDeps;
  beforeAll(() => {
    deps = testDeps();
  });
  beforeEach(clearEmulators);

  it('set, merge, update by field path, markers, delete', async () => {
    const ref = deps.db.doc('things/a');
    await ref.set({ name: 'x', tags: ['a'], nested: { keep: 1, drop: 2 }, at: FieldValue.serverTimestamp() });
    expect((await ref.get()).get('at')).toBeInstanceOf(Timestamp);
    await ref.set({ nested: { drop: FieldValue.delete(), added: 3 } }, { merge: true });
    expect((await ref.get()).get('nested')).toEqual({ keep: 1, added: 3 });
    await ref.update({ 'map.1abc': 'h', tags: FieldValue.arrayUnion('b', 'a'), name: FieldValue.delete() });
    expect((await ref.get()).data()).toMatchObject({ map: { '1abc': 'h' }, tags: ['a', 'b'] });
    expect((await ref.get()).get('name')).toBeUndefined();
    await ref.update({ tags: FieldValue.arrayRemove('a'), 'map.1abc': FieldValue.delete() });
    expect((await ref.get()).data()).toMatchObject({ map: {}, tags: ['b'] });
    await expect(deps.db.doc('things/missing').update({ x: 1 })).rejects.toThrow();
    await expect(ref.create({ x: 1 })).rejects.toThrow();
    await ref.delete();
    expect((await ref.get()).exists).toBe(false);
  });

  it('queries with == and limit; batch reads keep order and report missing documents', async () => {
    await deps.db.doc('things/a').set({ kind: 'x', n: 1 });
    await deps.db.doc('things/b').set({ kind: 'x', n: 2 });
    await deps.db.doc('things/c').set({ kind: 'y', n: 3 });
    expect((await deps.db.collection('things').where('kind', '==', 'x').get()).size).toBe(2);
    expect((await deps.db.collection('things').where('kind', '==', 'x').where('n', '==', 2).get()).docs.map((d) => d.id)).toEqual(['b']);
    expect((await deps.db.collection('things').where('kind', '==', 'x').limit(1).get()).size).toBe(1);
    const snaps = await deps.db.getAll(deps.db.doc('things/c'), deps.db.doc('things/none'), deps.db.doc('things/a'));
    expect(snaps.map((s) => s.exists)).toEqual([true, false, true]);
    expect(snaps[2]!.get('n')).toBe(1);
    const added = await deps.db.collection('things').add({ kind: 'z' });
    expect(added.id).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it('transactions read, then write all or nothing, and retry under contention', async () => {
    const counter = deps.db.doc('things/counter');
    await counter.set({ n: 0 });
    await Promise.all(Array.from({ length: 5 }, () => deps.db.runTransaction(async (tx) => {
      const n = (await tx.get(counter)).get('n') as number;
      tx.update(counter, { n: n + 1 });
    }, { maxAttempts: 20 })));
    expect((await counter.get()).get('n')).toBe(5);
    await expect(deps.db.runTransaction(async (tx) => {
      tx.set(deps.db.doc('things/never'), { x: 1 });
      throw new Error('stop');
    })).rejects.toThrow('stop');
    expect((await deps.db.doc('things/never').get()).exists).toBe(false);
  }, 60_000);

  it('manages Auth accounts with the Admin SDK error codes', async () => {
    const u = await deps.auth.createUser({ email: 'x@users.negronibarlab.invalid', password: 'secret1', displayName: 'X' });
    await expect(deps.auth.createUser({ email: 'x@users.negronibarlab.invalid', password: 'secret1' })).rejects.toMatchObject({ code: 'auth/email-already-exists' });
    await expect(deps.auth.createUser({ email: 'y@users.negronibarlab.invalid', password: '123' })).rejects.toMatchObject({ code: 'auth/invalid-password' });
    await deps.auth.setCustomUserClaims(u.uid, { role: 'server' });
    await deps.auth.updateUser(u.uid, { disabled: true, displayName: 'Y' });
    expect(await deps.auth.getUser(u.uid)).toMatchObject({ uid: u.uid, displayName: 'Y', disabled: true, customClaims: { role: 'server' } });
    expect((await deps.auth.getUserByEmail('x@users.negronibarlab.invalid')).uid).toBe(u.uid);
    await deps.auth.deleteUser(u.uid);
    await expect(deps.auth.getUser(u.uid)).rejects.toMatchObject({ code: 'auth/user-not-found' });
    await expect(deps.auth.deleteUser(u.uid)).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });
});
