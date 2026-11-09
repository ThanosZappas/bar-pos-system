import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

type Profile = { role: string; active: boolean; mustChangePassword: boolean };
const people: Record<string, Profile> = {
  admin: { role: 'admin', active: true, mustChangePassword: false },
  newAdmin: { role: 'admin', active: true, mustChangePassword: true },
  barman: { role: 'barman', active: true, mustChangePassword: false },
  server: { role: 'server', active: true, mustChangePassword: false },
  gone: { role: 'admin', active: false, mustChangePassword: false },
};

const db = (uid: string) => env.authenticatedContext(uid).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    for (const [uid, p] of Object.entries(people)) await setDoc(doc(fs, 'users', uid), { username: uid, displayName: uid, ...p });
    await setDoc(doc(fs, 'auditLog', 'a1'), { action: 'user.create' });
  });
});

describe('users', () => {
  it('anyone signed in reads their own profile, even before the password change', async () => {
    await assertSucceeds(getDoc(doc(db('server'), 'users/server')));
    await assertSucceeds(getDoc(doc(db('newAdmin'), 'users/newAdmin')));
    await assertSucceeds(getDoc(doc(db('gone'), 'users/gone')));
  });
  it('non-admins cannot read other profiles or list users', async () => {
    await assertFails(getDoc(doc(db('server'), 'users/admin')));
    await assertFails(getDocs(collection(db('barman'), 'users')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/server')));
  });
  it('active admin lists users; deactivated or unconfirmed admin cannot', async () => {
    await assertSucceeds(getDocs(collection(db('admin'), 'users')));
    await assertFails(getDocs(collection(db('newAdmin'), 'users')));
    await assertFails(getDocs(collection(db('gone'), 'users')));
  });
  it('nobody writes profiles from a client, not even their own flags', async () => {
    await assertFails(updateDoc(doc(db('newAdmin'), 'users/newAdmin'), { mustChangePassword: false }));
    await assertFails(updateDoc(doc(db('server'), 'users/server'), { role: 'admin' }));
    await assertFails(setDoc(doc(db('admin'), 'users/x'), { role: 'admin' }));
    await assertFails(deleteDoc(doc(db('admin'), 'users/server')));
  });
});

describe('auditLog', () => {
  it('only an active admin reads it; nobody writes it', async () => {
    await assertSucceeds(getDocs(collection(db('admin'), 'auditLog')));
    await assertFails(getDocs(collection(db('server'), 'auditLog')));
    await assertFails(setDoc(doc(db('admin'), 'auditLog/x'), { action: 'fake' }));
    await assertFails(deleteDoc(doc(db('admin'), 'auditLog/a1')));
  });
});

describe('everything else', () => {
  it('stays closed', async () => {
    await assertFails(getDoc(doc(db('admin'), 'menuItems/x')));
    await assertFails(setDoc(doc(db('admin'), 'rounds/x'), { a: 1 }));
  });
});
