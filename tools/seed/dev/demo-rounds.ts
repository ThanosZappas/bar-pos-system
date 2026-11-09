// Emulator only: writes a few demo rounds (shaped exactly like the Android app's) so the order
// board and table overview can be tried without phones.   node dev/demo-rounds.ts --emulator
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

if (!process.argv.includes('--emulator')) {
  console.error('Refusing to run without --emulator: this writes fake orders.');
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const db = getFirestore(initializeApp({ projectId: 'demo-negroni' }));

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const line = (name: string, priceCents: number, qty: number, note = '', cancelled = false) =>
  ({ lineId: randomUUID(), itemId: 'demo', name, priceCents, qty, note, cancelled });

async function round(tableNo: number, ago: number, items: ReturnType<typeof line>[], extra: Record<string, unknown> = {}, note = '') {
  const table = await db.doc(`tables/table-${String(tableNo).padStart(2, '0')}`).get();
  const id = randomUUID();
  const eventId = randomUUID();
  await db.doc(`rounds/${id}`).set({
    tableId: table.id, tableName: table.get('name'), sessionId: table.get('currentSessionId'), status: 'preparing',
    items, note, createdAt: minutesAgo(ago), createdBy: 'demo', createdByName: 'Server 1', clientCreatedAt: minutesAgo(ago),
    updatedAt: FieldValue.serverTimestamp(), updatedBy: 'demo', editCount: 0, editSeen: true, lastEventId: eventId, ...extra,
  });
  await db.doc(`rounds/${id}/events/${eventId}`).set({ type: 'created', at: minutesAgo(ago), by: 'demo', byName: 'Server 1' });
  return id;
}

await round(7, 14, [line('Classic Negroni', 1000, 2), line('Zombie', 1200, 1, 'no mint')], { openedAt: minutesAgo(12), openedBy: 'demo' });
await round(4, 6, [line('Mai Tai', 1000, 2), line('Coca Cola (330ml)', 350, 1)], {}, 'Birthday — bring candles');
const edited = await round(1, 3, [line('White Negroni', 1000, 3), line('Margarita', 800, 1, '', true)], {
  openedAt: minutesAgo(2), openedBy: 'demo', editCount: 1, editSeen: false, lastEditByName: 'Server 2',
});
const editEvent = randomUUID();
await db.doc(`rounds/${edited}/events/${editEvent}`).set({
  type: 'edited', at: FieldValue.serverTimestamp(), by: 'demo', byName: 'Server 2',
  changes: [
    { lineId: 'x', name: 'White Negroni', qtyFrom: 2, qtyTo: 3, noteFrom: '', noteTo: '', cancelled: false },
    { lineId: 'y', name: 'Margarita', qtyFrom: 1, qtyTo: 1, noteFrom: '', noteTo: '', cancelled: true },
  ],
});
await db.doc(`rounds/${edited}`).update({ lastEventId: editEvent });
const served = await round(9, 30, [line('Mythos Lager (330ml)', 500, 4)]);
await db.doc(`rounds/${served}`).update({ status: 'served', servedAt: minutesAgo(25), servedBy: 'demo', servedByName: 'Admin' });
console.log('Demo rounds written: tables 7 (opened), 4 (new), 1 (edited), 9 (served).');
