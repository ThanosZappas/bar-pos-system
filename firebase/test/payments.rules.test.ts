import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';

let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const old = Timestamp.fromMillis(0);
const SESSION = 'session-0000001';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni-payments',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    const profile = (role: string) => ({ username: role, displayName: role, role, active: true, mustChangePassword: false });
    for (const r of ['admin', 'barman', 'server']) await setDoc(doc(fs, 'users', r), profile(r));
    await setDoc(doc(fs, 'users/gone'), { ...profile('server'), active: false });
    await setDoc(doc(fs, 'tables/table-01'), { name: '1', order: 0, archived: false, currentSessionId: SESSION, createdAt: old, createdBy: 'seed', updatedAt: old, updatedBy: 'seed' });
    await setDoc(doc(fs, 'payments/p1'), { tableId: 'table-01', tableName: '1', sessionId: SESSION, amountCents: 2000, method: 'card', createdAt: old, createdBy: 'server', createdByName: 'server', clientCreatedAt: old });
  });
});

const payment = (uid: string, extra: Record<string, unknown> = {}) => ({
  tableId: 'table-01', tableName: '1', sessionId: SESSION, amountCents: 1500, method: 'cash',
  createdAt: serverTimestamp(), createdBy: uid, createdByName: uid, clientCreatedAt: Timestamp.now(), ...extra,
});
const reversal = (uid: string, extra: Record<string, unknown> = {}) =>
  payment(uid, { amountCents: -2000, method: 'card', reversalOf: 'p1', reason: 'Wrong table', ...extra });

describe('payments', () => {
  it('any active staff member records a payment; staff read them', async () => {
    await assertSucceeds(setDoc(doc(db('server'), 'payments/p2'), payment('server')));
    await assertSucceeds(setDoc(doc(db('barman'), 'payments/p3'), payment('barman', { method: 'card' })));
    await assertSucceeds(getDocs(collection(db('server'), 'payments')));
  });

  it('refuses zero, negative, fractional or absurd amounts, unknown methods, other authors, inactive users', async () => {
    for (const amountCents of [0, -100, 12.5, 10000001]) await assertFails(setDoc(doc(db('server'), 'payments/x'), payment('server', { amountCents })));
    await assertFails(setDoc(doc(db('server'), 'payments/x'), payment('server', { method: 'voucher' })));
    await assertFails(setDoc(doc(db('server'), 'payments/x'), payment('server', { createdBy: 'barman' })));
    await assertFails(setDoc(doc(db('gone'), 'payments/x'), payment('gone')));
  });

  it('can never be changed or deleted', async () => {
    await assertFails(updateDoc(doc(db('admin'), 'payments/p1'), { amountCents: 1 }));
    await assertFails(deleteDoc(doc(db('admin'), 'payments/p1')));
  });

  it('is corrected by one full reversal with a reason', async () => {
    await assertSucceeds(setDoc(doc(db('server'), 'payments/reversal-p1'), reversal('server')));
    // A second reversal of the same payment hits the same id → an update → refused.
    await assertFails(setDoc(doc(db('server'), 'payments/reversal-p1'), reversal('server')));
  });

  it('refuses partial, mismatched, unexplained or misnamed reversals', async () => {
    await assertFails(setDoc(doc(db('server'), 'payments/reversal-p1'), reversal('server', { amountCents: -1000 })));
    await assertFails(setDoc(doc(db('server'), 'payments/reversal-p1'), reversal('server', { method: 'cash' })));
    await assertFails(setDoc(doc(db('server'), 'payments/reversal-p1'), reversal('server', { reason: '' })));
    await assertFails(setDoc(doc(db('server'), 'payments/other-id'), reversal('server')));
    await assertFails(setDoc(doc(db('server'), 'payments/reversal-nope'), reversal('server', { reversalOf: 'nope' })));
  });
});

function closeBatch(fs: Firestore, uid: string, session: Record<string, unknown> = {}, nextSession = 'session-0000002') {
  const b = writeBatch(fs);
  b.set(doc(fs, 'sessions', SESSION), {
    tableId: 'table-01', tableName: '1', closedAt: serverTimestamp(), closedBy: uid, closedByName: uid,
    totalCents: 2000, paidCents: 2000, roundCount: 1, ...session,
  });
  b.update(doc(fs, 'tables/table-01'), { currentSessionId: nextSession, updatedAt: serverTimestamp(), updatedBy: uid });
  return b.commit();
}

describe('closing a table', () => {
  it('any staff member closes it: new session id plus an immutable session record', async () => {
    await assertSucceeds(closeBatch(db('server'), 'server'));
    await assertFails(updateDoc(doc(db('admin'), 'sessions', SESSION), { paidCents: 0 }));
  });

  it('needs the session record, and the record needs the table to move on', async () => {
    await assertFails(updateDoc(doc(db('server'), 'tables/table-01'), { currentSessionId: 'session-0000002', updatedAt: serverTimestamp(), updatedBy: 'server' }));
    await assertFails(setDoc(doc(db('server'), 'sessions', SESSION), { tableId: 'table-01', tableName: '1', closedAt: serverTimestamp(), closedBy: 'server', closedByName: 'server', totalCents: 0, paidCents: 0, roundCount: 0 }));
  });

  it('refuses an unpaid close and closing the same session twice', async () => {
    await assertFails(closeBatch(db('server'), 'server', { paidCents: 1000 }));
    await assertSucceeds(closeBatch(db('server'), 'server'));
    await assertFails(closeBatch(db('barman'), 'barman', {}, 'session-0000003'));
  });

  it('a server still cannot rename tables', async () => {
    await assertFails(updateDoc(doc(db('server'), 'tables/table-01'), { name: 'VIP', updatedAt: serverTimestamp(), updatedBy: 'server' }));
  });
});

describe('settings', () => {
  const settings = (uid: string, extra = {}) => ({ barName: 'Negroni Bar Lab', address: 'Κολοκοτρώνη 74–76', phone: '+30 211 215 8270', receiptFooter: '', updatedAt: serverTimestamp(), updatedBy: uid, ...extra });
  it('admin writes, staff read, servers cannot write', async () => {
    await assertSucceeds(setDoc(doc(db('admin'), 'settings/app'), settings('admin')));
    await assertSucceeds(getDocs(collection(db('server'), 'settings')));
    await assertFails(setDoc(doc(db('server'), 'settings/app'), settings('server')));
    await assertFails(setDoc(doc(db('admin'), 'settings/other'), settings('admin')));
    await assertFails(setDoc(doc(db('admin'), 'settings/app'), settings('admin', { barName: '' })));
  });
});
