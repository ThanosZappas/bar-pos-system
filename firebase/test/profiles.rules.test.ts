import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

const people: Record<string, { role: string; active: boolean; mustChangePassword: boolean }> = {
  admin: { role: 'admin', active: true, mustChangePassword: false },
  barman: { role: 'barman', active: true, mustChangePassword: false },
  server: { role: 'server', active: true, mustChangePassword: false },
  newServer: { role: 'server', active: true, mustChangePassword: true },
};

const db = (uid: string) => env.authenticatedContext(uid).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    for (const [uid, p] of Object.entries(people)) await setDoc(doc(fs, 'users', uid), { username: uid, displayName: uid, ...p });
    await setDoc(doc(fs, 'devices/phone1'), { name: 'Xiaomi', profiles: ['server'] });
    await setDoc(doc(fs, 'deviceSecrets/phone1'), { hash: 'abc' });
    await setDoc(doc(fs, 'pinSecrets/server'), { pin: { hash: 'abc', salt: 'def' }, failed: 0 });
    await setDoc(doc(fs, 'avatars/server'), { type: 'image/jpeg' });
  });
});

describe('profile sign-in data', () => {
  it('PIN hashes and phone keys are closed to everyone, including their owner and the admin', async () => {
    for (const who of [db('admin'), db('server'), anonymous()]) {
      await assertFails(getDoc(doc(who, 'pinSecrets/server')));
      await assertFails(getDoc(doc(who, 'deviceSecrets/phone1')));
      await assertFails(getDocs(collection(who, 'pinSecrets')));
      await assertFails(setDoc(doc(who, 'pinSecrets/server'), { failed: 0 }));
      await assertFails(updateDoc(doc(who, 'deviceSecrets/phone1'), { hash: 'mine' }));
    }
  });

  it('only the admin lists phones; nobody writes them from an app', async () => {
    await assertSucceeds(getDocs(collection(db('admin'), 'devices')));
    await assertFails(getDocs(collection(db('barman'), 'devices')));
    await assertFails(getDoc(doc(db('server'), 'devices/phone1')));
    await assertFails(getDoc(doc(anonymous(), 'devices/phone1')));
    await assertFails(updateDoc(doc(db('admin'), 'devices/phone1'), { profiles: ['admin'] }));
    await assertFails(deleteDoc(doc(db('admin'), 'devices/phone1')));
  });

  it('staff see pictures; nobody writes them from an app', async () => {
    await assertSucceeds(getDoc(doc(db('server'), 'avatars/server')));
    await assertSucceeds(getDoc(doc(db('barman'), 'avatars/server')));
    await assertFails(getDoc(doc(db('newServer'), 'avatars/server')));
    await assertFails(getDoc(doc(anonymous(), 'avatars/server')));
    await assertFails(setDoc(doc(db('server'), 'avatars/server'), { type: 'image/png' }));
    await assertFails(setDoc(doc(db('admin'), 'avatars/barman'), { type: 'image/png' }));
  });
});
