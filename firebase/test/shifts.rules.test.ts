import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';

let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const SESSION = 'session-0000001';
const hours = (h: number) => Timestamp.fromMillis(Date.now() + h * 3_600_000);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni-shifts',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

const profile = (role: string, rights?: Record<string, boolean>) =>
  ({ username: role, displayName: role, role, active: true, mustChangePassword: false, ...(rights ? { rights } : {}) });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'users/admin'), profile('admin'));
    await setDoc(doc(fs, 'users/barman'), profile('barman'));
    await setDoc(doc(fs, 'users/server'), profile('server'));
    await setDoc(doc(fs, 'users/trusted'), profile('server', { noApproval: true }));
    await setDoc(doc(fs, 'users/locked'), profile('server', { noApproval: true, logIn: false }));
    await setDoc(doc(fs, 'users/limited'), profile('server', { noApproval: true, payments: false, reversePayments: false, cancelOrders: false, closeTables: false }));
    await setDoc(doc(fs, 'tables/table-01'), { name: '1', order: 0, archived: false, currentSessionId: SESSION, createdAt: hours(-9), createdBy: 'seed', updatedAt: hours(-9), updatedBy: 'seed' });
    await setDoc(doc(fs, 'payments/p1'), { tableId: 'table-01', tableName: '1', sessionId: SESSION, amountCents: 2000, method: 'card', createdAt: hours(-1), createdBy: 'x', createdByName: 'x', clientCreatedAt: hours(-1) });
  });
});

function submitRound(fs: Firestore, uid: string, roundId = crypto.randomUUID()) {
  const eventId = crypto.randomUUID();
  const b = writeBatch(fs);
  b.set(doc(fs, 'rounds', roundId), {
    tableId: 'table-01', tableName: '1', sessionId: SESSION, status: 'preparing',
    items: [{ lineId: 'a', itemId: 'i', name: 'Classic Negroni', priceCents: 1000, qty: 1, note: '', cancelled: false }], note: '',
    createdAt: serverTimestamp(), createdBy: uid, createdByName: uid, clientCreatedAt: Timestamp.now(),
    updatedAt: serverTimestamp(), updatedBy: uid, editCount: 0, editSeen: true, lastEventId: eventId,
  });
  b.set(doc(fs, 'rounds', roundId, 'events', eventId), { type: 'created', at: serverTimestamp(), by: uid, byName: uid });
  return b.commit();
}
const pay = (fs: Firestore, uid: string, extra = {}) => setDoc(doc(fs, 'payments', crypto.randomUUID()), {
  tableId: 'table-01', tableName: '1', sessionId: SESSION, amountCents: 500, method: 'cash',
  createdAt: serverTimestamp(), createdBy: uid, createdByName: uid, clientCreatedAt: Timestamp.now(), ...extra,
});
const request = (uid: string) => ({ uid, displayName: uid, shiftDay: '2026-11-11', status: 'requested', requestedAt: serverTimestamp() });
const decide = (by: string, uid: string, status: string, until?: Timestamp) => ({
  uid, displayName: uid, shiftDay: '2026-11-11', status, decidedAt: serverTimestamp(), decidedBy: by, decidedByName: by,
  ...(until ? { approvedUntil: until } : {}),
});

describe('permission to work', () => {
  it('a server without permission can read but cannot order or take payments', async () => {
    await assertSucceeds(getDoc(doc(db('server'), 'tables/table-01')));
    await assertFails(submitRound(db('server'), 'server'));
    await assertFails(pay(db('server'), 'server'));
  });

  it('asks; the barman approves until 18:00; then the server works', async () => {
    await assertSucceeds(setDoc(doc(db('server'), 'shifts/server'), request('server')));
    await assertSucceeds(getDoc(doc(db('barman'), 'shifts/server')));
    await assertSucceeds(setDoc(doc(db('barman'), 'shifts/server'), decide('barman', 'server', 'approved', hours(8))));
    await assertSucceeds(submitRound(db('server'), 'server'));
    await assertSucceeds(pay(db('server'), 'server'));
  });

  it('the admin may approve without being asked; denied or revoked means no work', async () => {
    await assertSucceeds(setDoc(doc(db('admin'), 'shifts/server'), decide('admin', 'server', 'approved', hours(8))));
    await assertSucceeds(submitRound(db('server'), 'server'));
    await assertSucceeds(setDoc(doc(db('admin'), 'shifts/server'), decide('admin', 'server', 'revoked')));
    await assertFails(submitRound(db('server'), 'server'));
    await assertSucceeds(setDoc(doc(db('barman'), 'shifts/server'), decide('barman', 'server', 'denied')));
    await assertFails(submitRound(db('server'), 'server'));
  });

  it('a server cannot approve themself, ask for someone else, or approve beyond a day', async () => {
    await assertFails(setDoc(doc(db('server'), 'shifts/server'), decide('server', 'server', 'approved', hours(8))));
    await assertFails(setDoc(doc(db('server'), 'shifts/trusted'), request('trusted')));
    await assertFails(setDoc(doc(db('server'), 'shifts/server'), { ...request('server'), approvedUntil: hours(8) }));
    await assertFails(setDoc(doc(db('barman'), 'shifts/server'), decide('barman', 'server', 'approved', hours(30))));
    await assertFails(getDoc(doc(db('trusted'), 'shifts/server')));
  });

  it('an approval that ran out works for two more hours (offline sync), then not', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'shifts/server'), { ...decide('barman', 'server', 'approved', hours(-1)), decidedAt: hours(-10) }));
    await assertSucceeds(submitRound(db('server'), 'server'));
    await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'shifts/server'), { approvedUntil: hours(-3) }));
    await assertFails(submitRound(db('server'), 'server'));
  });

  it('trusted servers, the barman and the admin work without asking', async () => {
    await assertSucceeds(submitRound(db('trusted'), 'trusted'));
    await assertSucceeds(submitRound(db('barman'), 'barman'));
    await assertSucceeds(submitRound(db('admin'), 'admin'));
  });
});

describe('asking again after "Not now"', () => {
  const deny = (by: string, uid: string, denials: number, blockedUntil?: Timestamp) => ({
    ...decide(by, uid, 'denied'), denials, lastDeniedAt: serverTimestamp(), ...(blockedUntil ? { blockedUntil } : {}),
  });
  const again = (uid: string) => ({ status: 'requested', requestedAt: serverTimestamp(), shiftDay: '2026-11-11', displayName: uid });

  it('cannot re-send while a request is waiting', async () => {
    await assertSucceeds(setDoc(doc(db('server'), 'shifts/server'), request('server')));
    await assertFails(updateDoc(doc(db('server'), 'shifts/server'), again('server')));
  });

  it('may ask once more after a first denial, not after the second (blocked until 18:00)', async () => {
    await setDoc(doc(db('server'), 'shifts/server'), request('server'));
    await assertSucceeds(setDoc(doc(db('barman'), 'shifts/server'), deny('barman', 'server', 1)));
    await assertSucceeds(updateDoc(doc(db('server'), 'shifts/server'), again('server')));
    await assertSucceeds(setDoc(doc(db('barman'), 'shifts/server'), deny('barman', 'server', 2, hours(6))));
    await assertFails(updateDoc(doc(db('server'), 'shifts/server'), again('server')));
  });

  it('a server cannot reset its denials or lift its own block', async () => {
    await setDoc(doc(db('server'), 'shifts/server'), request('server'));
    await setDoc(doc(db('barman'), 'shifts/server'), deny('barman', 'server', 2, hours(6)));
    await assertFails(updateDoc(doc(db('server'), 'shifts/server'), { ...again('server'), denials: 0 }));
    await assertFails(updateDoc(doc(db('server'), 'shifts/server'), { ...again('server'), blockedUntil: null }));
    await assertFails(setDoc(doc(db('server'), 'shifts/server'), request('server')));
  });

  it('the barman clears the block; the server may ask again', async () => {
    await setDoc(doc(db('server'), 'shifts/server'), request('server'));
    await setDoc(doc(db('barman'), 'shifts/server'), deny('barman', 'server', 2, hours(6)));
    await assertSucceeds(setDoc(doc(db('barman'), 'shifts/server'), { ...decide('barman', 'server', 'cleared'), denials: 0 }));
    await assertSucceeds(updateDoc(doc(db('server'), 'shifts/server'), again('server')));
  });

  it('a block that ran out (a new shift) no longer stops a request', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'shifts/server'), { ...decide('barman', 'server', 'denied'), decidedAt: hours(-30), denials: 2, lastDeniedAt: hours(-30), blockedUntil: hours(-1) }));
    await assertSucceeds(updateDoc(doc(db('server'), 'shifts/server'), again('server')));
  });

  it('the barman cannot block for more than a day', async () => {
    await assertFails(setDoc(doc(db('barman'), 'shifts/server'), deny('barman', 'server', 2, hours(30))));
  });
});

describe('the "can sign in" right', () => {
  it('when it is off, a server can read nothing and do nothing, even if trusted', async () => {
    await assertFails(getDoc(doc(db('locked'), 'tables/table-01')));
    await assertFails(submitRound(db('locked'), 'locked'));
    await assertSucceeds(getDoc(doc(db('locked'), 'users/locked'))); // so the app can say why
  });
});

describe('rights', () => {
  it('a server without payment rights cannot record or reverse payments', async () => {
    await assertFails(pay(db('limited'), 'limited'));
    await assertFails(setDoc(doc(db('limited'), 'payments/reversal-p1'), {
      tableId: 'table-01', tableName: '1', sessionId: SESSION, amountCents: -2000, method: 'card', reversalOf: 'p1', reason: 'x',
      createdAt: serverTimestamp(), createdBy: 'limited', createdByName: 'limited', clientCreatedAt: Timestamp.now(),
    }));
    await assertSucceeds(pay(db('trusted'), 'trusted')); // default: allowed
  });

  it('a server without the cancel right cannot cancel a round', async () => {
    const fs = db('limited');
    await submitRound(fs, 'limited', 'r1');
    const eventId = crypto.randomUUID();
    const b = writeBatch(fs);
    b.update(doc(fs, 'rounds/r1'), { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: 'limited', cancelledByName: 'limited', editSeen: false, updatedAt: serverTimestamp(), updatedBy: 'limited', lastEventId: eventId });
    b.set(doc(fs, 'rounds/r1/events', eventId), { type: 'cancelled', at: serverTimestamp(), by: 'limited', byName: 'limited' });
    await assertFails(b.commit());
  });

  it('a server without the close right cannot close a table', async () => {
    const fs = db('limited');
    const b = writeBatch(fs);
    b.set(doc(fs, 'sessions', SESSION), { tableId: 'table-01', tableName: '1', closedAt: serverTimestamp(), closedBy: 'limited', closedByName: 'limited', totalCents: 0, paidCents: 0, roundCount: 0 });
    b.update(doc(fs, 'tables/table-01'), { currentSessionId: 'session-0000002', updatedAt: serverTimestamp(), updatedBy: 'limited' });
    await assertFails(b.commit());
  });
});
