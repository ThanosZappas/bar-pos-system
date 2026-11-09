/**
 * Offline sync verification against the Firestore emulator with the real security rules.
 *
 * A client goes offline (disableNetwork), writes rounds and payments with client-generated ids
 * exactly as the Android app shapes them, then reconnects. We check what reaches the server:
 * everything arrives, nothing twice, and conflicting offline changes are refused by the rules
 * instead of corrupting data. (Persistence across an app restart is covered by the on-phone
 * test in android/app/src/androidTest.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, disableNetwork, doc, enableNetwork, getDoc, getDocs, getDocsFromCache, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where, writeBatch, type Firestore,
} from 'firebase/firestore';

let env: RulesTestEnvironment;
const SESSION = 'session-0000001';
const NEXT_SESSION = 'session-0000002';
const old = Timestamp.fromMillis(0);
const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni-offline',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    const profile = (role: string) => ({ username: role, displayName: role, role, active: true, mustChangePassword: false });
    for (const r of ['barman', 'server', 'server2']) await setDoc(doc(fs, 'users', r), profile(r === 'server2' ? 'server' : r));
    await setDoc(doc(fs, 'tables/table-01'), { name: '1', order: 0, archived: false, currentSessionId: SESSION, createdAt: old, createdBy: 'seed', updatedAt: old, updatedBy: 'seed' });
  });
});

/** Server-side truth, bypassing rules and every client cache. */
async function onServer(path: string, sessionId = SESSION): Promise<number> {
  let n = 0;
  await env.withSecurityRulesDisabled(async (ctx) => {
    n = (await getDocs(query(collection(ctx.firestore(), path), where('sessionId', '==', sessionId)))).size;
  });
  return n;
}
async function serverDoc(path: string) {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return data;
}

// Same shapes as android/.../orders/OrdersRepository.kt.
function submitRound(fs: Firestore, uid: string, roundId: string, sessionId = SESSION): Promise<void> {
  const eventId = crypto.randomUUID();
  const b = writeBatch(fs);
  b.set(doc(fs, 'rounds', roundId), {
    tableId: 'table-01', tableName: '1', sessionId, status: 'preparing',
    items: [{ lineId: crypto.randomUUID(), itemId: 'negroni-c01-i01', name: 'Classic Negroni', priceCents: 1000, qty: 2, note: '', cancelled: false }],
    note: '', createdAt: serverTimestamp(), createdBy: uid, createdByName: uid, clientCreatedAt: Timestamp.now(),
    updatedAt: serverTimestamp(), updatedBy: uid, editCount: 0, editSeen: true, lastEventId: eventId,
  });
  b.set(doc(fs, 'rounds', roundId, 'events', eventId), { type: 'created', at: serverTimestamp(), by: uid, byName: uid });
  return b.commit();
}
function pay(fs: Firestore, uid: string, paymentId: string, amountCents: number, sessionId = SESSION): Promise<void> {
  return setDoc(doc(fs, 'payments', paymentId), {
    tableId: 'table-01', tableName: '1', sessionId, amountCents, method: 'cash',
    createdAt: serverTimestamp(), createdBy: uid, createdByName: uid, clientCreatedAt: Timestamp.now(),
  });
}

describe('offline sync (Firestore emulator, real rules)', () => {
  it('rounds and payments made offline are visible locally at once and reach the server exactly once', async () => {
    const phone = db('server');
    await disableNetwork(phone);
    const pending = [
      submitRound(phone, 'server', 'r1'),
      submitRound(phone, 'server', 'r2'),
      submitRound(phone, 'server', 'r3'),
      pay(phone, 'server', 'p1', 2000),
      pay(phone, 'server', 'p2', 1500),
    ];

    const local = await getDocsFromCache(query(collection(phone, 'rounds'), where('sessionId', '==', SESSION)));
    expect(local.size).toBe(3);
    expect(local.docs.every((d) => d.metadata.hasPendingWrites)).toBe(true);
    expect(await onServer('rounds')).toBe(0);
    expect(await onServer('payments')).toBe(0);

    await enableNetwork(phone);
    await Promise.all(pending);
    expect(await onServer('rounds')).toBe(3);
    expect(await onServer('payments')).toBe(2);
    for (const id of ['r1', 'r2', 'r3']) {
      let events = 0;
      await env.withSecurityRulesDisabled(async (ctx) => {
        events = (await getDocs(collection(ctx.firestore(), 'rounds', id, 'events'))).size;
      });
      expect(events).toBe(1);
    }
  });

  it('sending the same round twice (double tap or retry) leaves exactly one round', async () => {
    const phone = db('server');
    await disableNetwork(phone);
    const first = submitRound(phone, 'server', 'same-id');
    const second = submitRound(phone, 'server', 'same-id');
    await enableNetwork(phone);
    const [a, b] = await Promise.allSettled([first, second]);
    expect(a.status).toBe('fulfilled');
    expect(b.status).toBe('rejected'); // the second arrives as an overwrite, which the rules refuse
    expect(await onServer('rounds')).toBe(1);
    let events = 0;
    await env.withSecurityRulesDisabled(async (ctx) => {
      events = (await getDocs(collection(ctx.firestore(), 'rounds', 'same-id', 'events'))).size;
    });
    expect(events).toBe(1);
  });

  it('a payment retried with the same id is stored once', async () => {
    const phone = db('server');
    await disableNetwork(phone);
    const first = pay(phone, 'server', 'p-same', 2000);
    const retry = pay(phone, 'server', 'p-same', 2000);
    await enableNetwork(phone);
    await Promise.allSettled([first, retry]);
    expect(await onServer('payments')).toBe(1);
    expect((await serverDoc('payments/p-same'))?.amountCents).toBe(2000);
  });

  it('an offline edit to a round the barman served meanwhile is refused; the round stays served', async () => {
    const phone = db('server');
    const bar = db('barman');
    await submitRound(phone, 'server', 'r1');
    await disableNetwork(phone);

    const editEvent = crypto.randomUUID();
    const b = writeBatch(phone);
    b.update(doc(phone, 'rounds/r1'), {
      items: [{ lineId: 'x', itemId: 'negroni-c01-i01', name: 'Classic Negroni', priceCents: 1000, qty: 5, note: '', cancelled: false }],
      editCount: 1, editSeen: false, lastEditAt: serverTimestamp(), lastEditBy: 'server', lastEditByName: 'server',
      updatedAt: serverTimestamp(), updatedBy: 'server', lastEventId: editEvent,
    });
    b.set(doc(phone, 'rounds/r1/events', editEvent), { type: 'edited', at: serverTimestamp(), by: 'server', byName: 'server' });
    const edit = b.commit();

    const serveEvent = crypto.randomUUID();
    const s = writeBatch(bar);
    s.update(doc(bar, 'rounds/r1'), { status: 'served', servedAt: serverTimestamp(), servedBy: 'barman', servedByName: 'barman', updatedAt: serverTimestamp(), updatedBy: 'barman', lastEventId: serveEvent });
    s.set(doc(bar, 'rounds/r1/events', serveEvent), { type: 'served', at: serverTimestamp(), by: 'barman', byName: 'barman' });
    await s.commit();

    await enableNetwork(phone);
    await expect(edit).rejects.toMatchObject({ code: 'permission-denied' });
    const r1 = await serverDoc('rounds/r1');
    expect(r1).toMatchObject({ status: 'served', editCount: 0 });
  });

  it('a round sent offline after the table was closed arrives and keeps the old session (flagged as late)', async () => {
    const phone = db('server');
    await getDoc(doc(phone, 'tables/table-01')); // the phone knew the table's session before going offline
    await disableNetwork(phone);
    const late = submitRound(phone, 'server', 'late-1');
    const latePay = pay(phone, 'server', 'late-p', 500);

    const other = db('server2');
    const close = writeBatch(other);
    close.set(doc(other, 'sessions', SESSION), { tableId: 'table-01', tableName: '1', closedAt: serverTimestamp(), closedBy: 'server2', closedByName: 'server2', totalCents: 0, paidCents: 0, roundCount: 0 });
    close.update(doc(other, 'tables/table-01'), { currentSessionId: NEXT_SESSION, updatedAt: serverTimestamp(), updatedBy: 'server2' });
    await close.commit();

    await enableNetwork(phone);
    await Promise.all([late, latePay]);
    expect((await serverDoc('rounds/late-1'))?.sessionId).toBe(SESSION);
    expect((await serverDoc('tables/table-01'))?.currentSessionId).toBe(NEXT_SESSION);
    expect(await onServer('rounds', NEXT_SESSION)).toBe(0); // not silently added to the new bill
  });

  it('two phones closing the same table offline: the first wins, the second is refused', async () => {
    const a = db('server');
    const b2 = db('server2');
    await getDoc(doc(a, 'tables/table-01'));
    await getDoc(doc(b2, 'tables/table-01'));
    await disableNetwork(a);
    await disableNetwork(b2);
    const closeFrom = (fs: Firestore, uid: string, next: string) => {
      const w = writeBatch(fs);
      w.set(doc(fs, 'sessions', SESSION), { tableId: 'table-01', tableName: '1', closedAt: serverTimestamp(), closedBy: uid, closedByName: uid, totalCents: 0, paidCents: 0, roundCount: 0 });
      w.update(doc(fs, 'tables/table-01'), { currentSessionId: next, updatedAt: serverTimestamp(), updatedBy: uid });
      return w.commit();
    };
    const first = closeFrom(a, 'server', 'session-from-a-01');
    const second = closeFrom(b2, 'server2', 'session-from-b-01');
    await enableNetwork(a);
    await first;
    await enableNetwork(b2);
    await expect(second).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await serverDoc('tables/table-01'))?.currentSessionId).toBe('session-from-a-01');
  });

  it('offline writes by a user deactivated meanwhile are refused on reconnect', async () => {
    const phone = db('server');
    await disableNetwork(phone);
    const w = submitRound(phone, 'server', 'r-gone');
    await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'users/server'), { active: false }));
    await enableNetwork(phone);
    await expect(w).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await onServer('rounds')).toBe(0);
  });
});
