import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { moveTable, removeTable } from './tables';
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

  it('refuses when a moved bill sits on the table (its rounds carry another table id)', async () => {
    await deps.db.doc('rounds/r1').set({ tableId: 't9', sessionId: 'session-now' });
    await expect(removeTable(deps, 'admin', { tableId: 't1' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('is admin-only', async () => {
    await expect(removeTable(deps, 'server', { tableId: 't1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe.skipIf(!onEmulators)('moveTable (emulators)', () => {
  let app: App;
  let deps: Deps;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'move-test');
    deps = { auth: getAuth(app), db: getFirestore(app) };
  });
  afterAll(async () => deleteApp(app));
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await deps.db.doc('users/server').set({ username: 'user1', displayName: 'Server 1', role: 'server', active: true, mustChangePassword: false, rights: { noApproval: true } });
    await deps.db.doc('users/asks').set({ username: 'user3', displayName: 'Server 3', role: 'server', active: true, mustChangePassword: false });
    await deps.db.doc('users/locked').set({ username: 'user5', displayName: 'Server 5', role: 'server', active: true, mustChangePassword: false, rights: { noApproval: true, logIn: false } });
    await deps.db.doc('users/nomove').set({ username: 'user4', displayName: 'Server 4', role: 'server', active: true, mustChangePassword: false, rights: { noApproval: true, moveTables: false } });
    await deps.db.doc('users/new').set({ username: 'user2', displayName: 'Server 2', role: 'server', active: true, mustChangePassword: true });
    await deps.db.doc('tables/t1').set({ name: '1', order: 0, archived: false, currentSessionId: 'bill-1' });
    await deps.db.doc('tables/t5').set({ name: '5', order: 4, archived: false, currentSessionId: 'empty-5' });
    await deps.db.doc('rounds/r1').set({ tableId: 't1', sessionId: 'bill-1' });
    await deps.db.doc('payments/p1').set({ tableId: 't1', sessionId: 'bill-1', amountCents: 500 });
  });

  it('moves the open bill to a free table; the source gets a fresh session; rounds and payments are untouched', async () => {
    await moveTable(deps, 'server', { fromTableId: 't1', toTableId: 't5' });
    expect((await deps.db.doc('tables/t5').get()).get('currentSessionId')).toBe('bill-1');
    const fresh = (await deps.db.doc('tables/t1').get()).get('currentSessionId');
    expect(fresh).not.toBe('bill-1');
    expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
    expect((await deps.db.doc('rounds/r1').get()).data()).toEqual({ tableId: 't1', sessionId: 'bill-1' });
    expect((await deps.db.doc('payments/p1').get()).get('sessionId')).toBe('bill-1');
    expect((await deps.db.collection('auditLog').where('action', '==', 'table.move').get()).size).toBe(1);
  });

  it('refuses a target that is not free, an empty source, the same table, and users who must change password', async () => {
    await deps.db.doc('rounds/r5').set({ tableId: 't5', sessionId: 'empty-5' });
    await expect(moveTable(deps, 'server', { fromTableId: 't1', toTableId: 't5' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(moveTable(deps, 'server', { fromTableId: 't1', toTableId: 't1' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await deps.db.doc('rounds/r5').delete();
    await expect(moveTable(deps, 'server', { fromTableId: 't5', toTableId: 't1' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(moveTable(deps, 'new', { fromTableId: 't1', toTableId: 't5' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('needs permission for the shift and the move right', async () => {
    await expect(moveTable(deps, 'asks', { fromTableId: 't1', toTableId: 't5' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(moveTable(deps, 'nomove', { fromTableId: 't1', toTableId: 't5' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(moveTable(deps, 'locked', { fromTableId: 't1', toTableId: 't5' })).rejects.toMatchObject({ code: 'permission-denied' });
    await deps.db.doc('shifts/asks').set({ status: 'approved', approvedUntil: Timestamp.fromMillis(Date.now() + 3_600_000) });
    await moveTable(deps, 'asks', { fromTableId: 't1', toTableId: 't5' });
    expect((await deps.db.doc('tables/t5').get()).get('currentSessionId')).toBe('bill-1');
  });
});
