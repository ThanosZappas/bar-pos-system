import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDocs, collection, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, deleteDoc, type Firestore } from 'firebase/firestore';

let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni-rounds',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

const line = (id: string, extra = {}) => ({ lineId: id, itemId: 'negroni-c01-i01', name: 'Classic Negroni', priceCents: 1000, qty: 2, note: '', cancelled: false, ...extra });

function newRound(uid: string, eventId: string, extra = {}) {
  return {
    tableId: 'table-01', tableName: '1', sessionId: 'session-0000001', status: 'preparing',
    items: [line('a'), line('b', { name: 'Zombie', priceCents: 1200, qty: 1 })], note: '',
    createdAt: serverTimestamp(), createdBy: uid, createdByName: uid, clientCreatedAt: Timestamp.now(),
    updatedAt: serverTimestamp(), updatedBy: uid, editCount: 0, editSeen: true, lastEventId: eventId, ...extra,
  };
}
const event = (uid: string, type: string, extra = {}) => ({ type, at: serverTimestamp(), by: uid, byName: uid, ...extra });

/** Round write + event in one batch, like the app does. */
async function write(fs: Firestore, roundId: string, eventId: string, round: Record<string, unknown>, type: string, create: boolean) {
  const b = writeBatch(fs);
  if (create) b.set(doc(fs, 'rounds', roundId), round);
  else b.update(doc(fs, 'rounds', roundId), round);
  b.set(doc(fs, 'rounds', roundId, 'events', eventId), event(round.updatedBy as string, type));
  await b.commit();
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    const profile = (role: string) => ({ username: role, displayName: role, role, active: true, mustChangePassword: false });
    for (const r of ['admin', 'barman', 'server', 'server2']) await setDoc(doc(fs, 'users', r), profile(r === 'server2' ? 'server' : r));
    await setDoc(doc(fs, 'users/gone'), { ...profile('server'), active: false });
  });
  await write(db('server'), 'r1', 'e1', newRound('server', 'e1'), 'created', true);
});

describe('creating a round', () => {
  it('works for active staff, with its created event', async () => {
    await assertSucceeds(write(db('server2'), 'r2', 'e2', newRound('server2', 'e2'), 'created', true));
    await assertSucceeds(getDocs(collection(db('barman'), 'rounds')));
    await assertSucceeds(getDocs(collection(db('server'), 'rounds/r1/events')));
  });

  it('is refused without its event, with the wrong event type, or by an inactive user', async () => {
    await assertFails(setDoc(doc(db('server'), 'rounds/r2'), newRound('server', 'e2')));
    await assertFails(write(db('server'), 'r2', 'e2', newRound('server', 'e2'), 'served', true));
    await assertFails(write(db('gone'), 'r2', 'e2', newRound('gone', 'e2'), 'created', true));
  });

  it('is refused when it claims another author, a non-preparing status, no items or extra fields', async () => {
    await assertFails(write(db('server'), 'r2', 'e2', newRound('server', 'e2', { createdBy: 'server2' }), 'created', true));
    await assertFails(write(db('server'), 'r2', 'e2', newRound('server', 'e2', { status: 'served' }), 'created', true));
    await assertFails(write(db('server'), 'r2', 'e2', newRound('server', 'e2', { items: [] }), 'created', true));
    await assertFails(write(db('server'), 'r2', 'e2', newRound('server', 'e2', { discount: 100 }), 'created', true));
  });

  it('cannot overwrite an existing round as a "new" one', async () => {
    await assertFails(write(db('server2'), 'r1', 'e9', newRound('server2', 'e9'), 'created', true));
  });

  it('a standalone event is refused', async () => {
    await assertFails(setDoc(doc(db('server'), 'rounds/r1/events/x'), event('server', 'edited')));
  });
});

const touched = (uid: string, eventId: string) => ({ updatedAt: serverTimestamp(), updatedBy: uid, lastEventId: eventId });
const edit = (uid: string, eventId: string, extra = {}) => ({
  items: [line('a', { qty: 3 }), line('b', { name: 'Zombie', priceCents: 1200, qty: 1, cancelled: true })],
  editCount: 1, editSeen: false, lastEditAt: serverTimestamp(), lastEditBy: uid, lastEditByName: uid, ...touched(uid, eventId), ...extra,
});

describe('editing and cancelling while Preparing', () => {
  it('any staff member edits, logged and flagged unseen', async () => {
    await assertSucceeds(write(db('server2'), 'r1', 'e2', edit('server2', 'e2'), 'edited', false));
  });

  it('refuses edits without a log event, without the unseen flag, or that add lines', async () => {
    await assertFails(updateDoc(doc(db('server'), 'rounds/r1'), edit('server', 'e2')));
    await assertFails(write(db('server'), 'r1', 'e2', edit('server', 'e2', { editSeen: true }), 'edited', false));
    await assertFails(write(db('server'), 'r1', 'e2', edit('server', 'e2', { items: [line('a'), line('b'), line('c')] }), 'edited', false));
    await assertFails(write(db('server'), 'r1', 'e2', edit('server', 'e2', { editCount: 5 }), 'edited', false));
  });

  it('reusing the previous event id does not count as logging', async () => {
    await assertFails(write(db('server'), 'r1', 'e1', edit('server', 'e1'), 'edited', false));
  });

  it('cancels a whole round, flagged for the barman', async () => {
    await assertSucceeds(write(db('server'), 'r1', 'e2', { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: 'server', cancelledByName: 'server', editSeen: false, ...touched('server', 'e2') }, 'cancelled', false));
  });
});

describe('serving', () => {
  const serve = (uid: string, eventId: string) => ({ status: 'served', servedAt: serverTimestamp(), servedBy: uid, servedByName: uid, ...touched(uid, eventId) });

  it('barman or server marks served, logged', async () => {
    await assertSucceeds(write(db('barman'), 'r1', 'e2', serve('barman', 'e2'), 'served', false));
  });

  it('after Served, nothing can be edited, cancelled or served again', async () => {
    await write(db('barman'), 'r1', 'e2', serve('barman', 'e2'), 'served', false);
    await assertFails(write(db('server'), 'r1', 'e3', edit('server', 'e3', { editCount: 1 }), 'edited', false));
    await assertFails(write(db('server'), 'r1', 'e3', { status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: 'server', cancelledByName: 'server', editSeen: false, ...touched('server', 'e3') }, 'cancelled', false));
    await assertFails(write(db('server'), 'r1', 'e3', serve('server', 'e3'), 'served', false));
  });
});

describe('opening on the board', () => {
  const open = (uid: string) => ({ openedAt: serverTimestamp(), openedBy: uid, editSeen: true, updatedAt: serverTimestamp(), updatedBy: uid });
  it('barman and admin may, servers may not', async () => {
    await assertSucceeds(updateDoc(doc(db('barman'), 'rounds/r1'), open('barman')));
    await assertSucceeds(updateDoc(doc(db('admin'), 'rounds/r1'), open('admin')));
    await assertFails(updateDoc(doc(db('server'), 'rounds/r1'), open('server')));
  });
});

describe('history is immutable', () => {
  it('rounds and events cannot be deleted; events cannot be changed', async () => {
    await assertFails(deleteDoc(doc(db('admin'), 'rounds/r1')));
    await assertFails(deleteDoc(doc(db('admin'), 'rounds/r1/events/e1')));
    await assertFails(updateDoc(doc(db('admin'), 'rounds/r1/events/e1'), { type: 'served' }));
  });
});
