import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { changeOwnPassword, createUser, resetPassword, updateUser, type Deps } from './users';

// Runs only inside `firebase emulators:exec --only auth,firestore` (see root package.json).
const onEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-negroni';

describe.skipIf(!onEmulators)('user management (emulators)', () => {
  let app: App;
  let deps: Deps;
  let adminUid: string;

  async function clearEmulators() {
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  }

  async function seedAdmin(mustChangePassword = false) {
    const u = await deps.auth.createUser({ email: 'admin@users.negronibarlab.invalid', password: 'adminadmin' });
    await deps.db.doc(`users/${u.uid}`).set({ username: 'admin', displayName: 'Admin', role: 'admin', active: true, mustChangePassword });
    return u.uid;
  }

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'users-test');
    deps = { auth: getAuth(app), db: getFirestore(app) };
  });
  afterAll(async () => deleteApp(app));
  beforeEach(async () => {
    await clearEmulators();
    adminUid = await seedAdmin();
  });

  it('Firebase itself rejects passwords shorter than 6 characters', async () => {
    await expect(deps.auth.createUser({ email: 'x@users.negronibarlab.invalid', password: 'abcde' })).rejects.toThrow();
    await expect(deps.auth.createUser({ email: 'y@users.negronibarlab.invalid', password: 'user1user1' })).resolves.toBeTruthy();
  });

  it('admin creates a user with role claim, profile doc and audit entry', async () => {
    const { uid } = await createUser(deps, adminUid, { username: 'User1', displayName: 'Server 1', role: 'server', password: 'user1user1' });
    const record = await deps.auth.getUser(uid);
    expect(record.email).toBe('user1@users.negronibarlab.invalid');
    expect(record.customClaims).toEqual({ role: 'server' });
    const doc = (await deps.db.doc(`users/${uid}`).get()).data();
    expect(doc).toMatchObject({ username: 'user1', displayName: 'Server 1', role: 'server', active: true, mustChangePassword: true, createdBy: adminUid });
    const log = await deps.db.collection('auditLog').where('targetUid', '==', uid).get();
    expect(log.docs.map((d) => d.get('action'))).toEqual(['user.create']);
  });

  it('rejects duplicates, short passwords and non-admin callers', async () => {
    await createUser(deps, adminUid, { username: 'user1', displayName: 'Server 1', role: 'server', password: 'user1user1' });
    await expect(createUser(deps, adminUid, { username: 'user1', displayName: 'X', role: 'server', password: 'user1user1' })).rejects.toMatchObject({ code: 'already-exists' });
    await expect(createUser(deps, adminUid, { username: 'user2', displayName: 'X', role: 'server', password: '12345' })).rejects.toMatchObject({ code: 'invalid-argument' });
    const server = (await deps.auth.getUserByEmail('user1@users.negronibarlab.invalid')).uid;
    await deps.db.doc(`users/${server}`).update({ mustChangePassword: false });
    await expect(createUser(deps, server, { username: 'user3', displayName: 'X', role: 'admin', password: 'user3user3' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(createUser(deps, undefined, {})).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('admin with a pending password change cannot manage users', async () => {
    await deps.db.doc(`users/${adminUid}`).update({ mustChangePassword: true });
    await expect(createUser(deps, adminUid, { username: 'user1', displayName: 'S', role: 'server', password: 'user1user1' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('renames, changes role and deactivates', async () => {
    const { uid } = await createUser(deps, adminUid, { username: 'user1', displayName: 'Server 1', role: 'server', password: 'user1user1' });
    await updateUser(deps, adminUid, { uid, displayName: 'Maria', role: 'barman' });
    expect((await deps.auth.getUser(uid)).customClaims).toEqual({ role: 'barman' });
    await updateUser(deps, adminUid, { uid, active: false });
    expect((await deps.auth.getUser(uid)).disabled).toBe(true);
    expect((await deps.db.doc(`users/${uid}`).get()).data()).toMatchObject({ displayName: 'Maria', role: 'barman', active: false });
    await updateUser(deps, adminUid, { uid, active: true });
    expect((await deps.auth.getUser(uid)).disabled).toBe(false);
  });

  it('sets rights on create and merges them on update; refuses unknown or non-boolean rights', async () => {
    const { uid } = await createUser(deps, adminUid, { username: 'user1', displayName: 'Server 1', role: 'server', password: 'user1user1', rights: { noApproval: true } });
    await updateUser(deps, adminUid, { uid, rights: { payments: false } });
    expect((await deps.db.doc(`users/${uid}`).get()).get('rights')).toEqual({ noApproval: true, payments: false });
    await expect(updateUser(deps, adminUid, { uid, rights: { fly: true } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(updateUser(deps, adminUid, { uid, rights: { payments: 'yes' } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('admin cannot lock themselves out', async () => {
    await expect(updateUser(deps, adminUid, { uid: adminUid, active: false })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(updateUser(deps, adminUid, { uid: adminUid, role: 'server' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('reset password forces a change; own change clears the flag but not with the initial password', async () => {
    const { uid } = await createUser(deps, adminUid, { username: 'user1', displayName: 'Server 1', role: 'server', password: 'user1user1' });
    await deps.db.doc(`users/${uid}`).update({ mustChangePassword: false });
    await resetPassword(deps, adminUid, { uid, password: 'temp-123' });
    expect((await deps.db.doc(`users/${uid}`).get()).get('mustChangePassword')).toBe(true);

    await expect(changeOwnPassword(deps, uid, { password: 'user1user1' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await changeOwnPassword(deps, uid, { password: 'a-better-one' });
    expect((await deps.db.doc(`users/${uid}`).get()).get('mustChangePassword')).toBe(false);
    const actions = (await deps.db.collection('auditLog').where('targetUid', '==', uid).get()).docs.map((d) => d.get('action')).sort();
    expect(actions).toEqual(['user.changeOwnPassword', 'user.create', 'user.resetPassword']);
  });

  it('deactivated users cannot change their password', async () => {
    const { uid } = await createUser(deps, adminUid, { username: 'user1', displayName: 'Server 1', role: 'server', password: 'user1user1' });
    await updateUser(deps, adminUid, { uid, active: false });
    await expect(changeOwnPassword(deps, uid, { password: 'whatever-1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
