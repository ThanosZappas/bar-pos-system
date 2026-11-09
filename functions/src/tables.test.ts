import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { removeTable } from './tables';
import type { Deps } from './users';

const onEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-negroni';

describe.skipIf(!onEmulators)('removeTable (emulators)', () => {
  let app: App;
  let deps: Deps;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'tables-test');
    deps = { auth: getAuth(app), db: getFirestore(app) };
  });
  afterAll(async () => deleteApp(app));
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await deps.db.doc('users/admin').set({ username: 'admin', displayName: 'Admin', role: 'admin', active: true, mustChangePassword: false });
    await deps.db.doc('users/server').set({ username: 'user1', displayName: 'Server 1', role: 'server', active: true, mustChangePassword: false });
    await deps.db.doc('tables/t1').set({ name: '1', order: 0, archived: false, currentSessionId: 'session-now' });
  });

  it('archives a free table and logs it', async () => {
    await removeTable(deps, 'admin', { tableId: 't1' });
    expect((await deps.db.doc('tables/t1').get()).get('archived')).toBe(true);
    const log = await deps.db.collection('auditLog').where('action', '==', 'table.remove').get();
    expect(log.size).toBe(1);
  });

  it('refuses while the current session has a round or a payment', async () => {
    await deps.db.doc('rounds/r1').set({ tableId: 't1', sessionId: 'session-now' });
    await expect(removeTable(deps, 'admin', { tableId: 't1' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await deps.db.doc('rounds/r1').delete();
    await deps.db.doc('payments/p1').set({ tableId: 't1', sessionId: 'session-now' });
    await expect(removeTable(deps, 'admin', { tableId: 't1' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('ignores rounds from closed (earlier) sessions', async () => {
    await deps.db.doc('rounds/r0').set({ tableId: 't1', sessionId: 'session-before' });
    await removeTable(deps, 'admin', { tableId: 't1' });
    expect((await deps.db.doc('tables/t1').get()).get('archived')).toBe(true);
  });

  it('is admin-only', async () => {
    await expect(removeTable(deps, 'server', { tableId: 't1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
