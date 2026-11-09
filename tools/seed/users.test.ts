import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultSeedUsers, seedUsers, validateSeedUsers } from './users';

describe('default seed users', () => {
  const users = defaultSeedUsers();
  it('are admin plus user1..user5 with the brief display names', () => {
    expect(users.map((u) => [u.username, u.displayName, u.role])).toEqual([
      ['admin', 'Admin', 'admin'],
      ['user1', 'Server 1', 'server'],
      ['user2', 'Server 2', 'server'],
      ['user3', 'Server 3', 'server'],
      ['user4', 'Server 4', 'server'],
      ['user5', 'Server 5', 'server'],
    ]);
  });
  it('use username twice as password, which meets the 6-character Firebase minimum', () => {
    for (const u of users) {
      expect(u.password).toBe(u.username + u.username);
      expect(u.password.length).toBeGreaterThanOrEqual(6);
    }
  });
  it('force only the admin to change password at first login', () => {
    expect(users.filter((u) => u.mustChangePassword).map((u) => u.username)).toEqual(['admin']);
  });
  it('pass validation', () => expect(validateSeedUsers(users)).toEqual([]));
});

describe('validateSeedUsers', () => {
  it('reports short passwords, bad usernames, duplicates and a missing admin', () => {
    const problems = validateSeedUsers([
      { username: 'ab', displayName: 'X', role: 'server', password: '12345', mustChangePassword: false },
      { username: 'user1', displayName: 'X', role: 'server', password: 'user1user1', mustChangePassword: false },
      { username: 'user1', displayName: 'X', role: 'server', password: 'user1user1', mustChangePassword: false },
    ]);
    expect(problems.join('\n')).toMatch(/invalid username/);
    expect(problems.join('\n')).toMatch(/at least 6/);
    expect(problems.join('\n')).toMatch(/duplicate/);
    expect(problems.join('\n')).toMatch(/at least one admin/);
  });
});

const onEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!onEmulators)('seedUsers (emulators)', () => {
  let app: App;
  beforeAll(async () => {
    app = initializeApp({ projectId: 'demo-negroni' }, 'seed-test');
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-negroni/accounts`, { method: 'DELETE' });
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-negroni/databases/(default)/documents`, { method: 'DELETE' });
  });
  afterAll(async () => deleteApp(app));

  it('creates everyone once and is safe to re-run', async () => {
    const auth = getAuth(app);
    const db = getFirestore(app);
    const first = await seedUsers(auth, db, defaultSeedUsers());
    expect(first.created).toHaveLength(6);

    const admin = await auth.getUserByEmail('admin@users.negronibarlab.invalid');
    expect(admin.customClaims).toEqual({ role: 'admin' });
    await db.doc(`users/${admin.uid}`).update({ mustChangePassword: false }); // admin already changed it

    const second = await seedUsers(auth, db, defaultSeedUsers());
    expect(second.created).toEqual([]);
    expect(second.existing).toHaveLength(6);
    expect((await db.doc(`users/${admin.uid}`).get()).get('mustChangePassword')).toBe(false);
    expect((await db.collection('users').get()).size).toBe(6);
  });
});
