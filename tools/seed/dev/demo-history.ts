// Emulator only: three weeks of closed bills (rounds, payments, sessions) so the dashboard's
// analytics have something to show.   node dev/demo-history.ts --emulator
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

if (!process.argv.includes('--emulator')) {
  console.error('Refusing to run without --emulator: this writes fake history.');
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const db = getFirestore(initializeApp({ projectId: 'demo-negroni' }, 'history'));

type MenuItem = { id: string; name: string; priceCents: number };
const menu = JSON.parse(readFileSync(new URL('../menu/menu.json', import.meta.url), 'utf8'));
const items: MenuItem[] = menu.sections.flatMap((s: { categories: { items: MenuItem[] }[] }) => s.categories.flatMap((c) => c.items));
// Negronis and cocktails sell most; a few favourites weigh more.
const weighted = items.flatMap((i) => Array(i.id.startsWith('negroni') ? 6 : i.id.startsWith('cocktails') || i.id.startsWith('tropical') ? 3 : 1).fill(i));
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const servers = ['Server 1', 'Server 2', 'Server 3'];

let bills = 0;
let batch = db.batch();
let ops = 0;
const put = async (path: string, data: Record<string, unknown>) => {
  batch.set(db.doc(path), data);
  if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
};

const today = new Date();
for (let back = 21; back >= 1; back--) {
  const night = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  const weekend = [5, 6].includes(night.getDay());
  const count = (weekend ? 14 : 6) + Math.floor(rand() * 6);
  for (let b = 0; b < count; b++) {
    const session = randomUUID();
    const table = String(1 + Math.floor(rand() * 20));
    const server = pick(servers);
    const startMin = 20 * 60 + Math.floor(rand() * 300); // 20:00–01:00
    let total = 0;
    const rounds = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < rounds; r++) {
      const at = new Date(night.getTime() + (startMin + r * 40) * 60_000);
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
        const it = pick(weighted);
        return { lineId: randomUUID(), itemId: it.id, name: it.name, priceCents: it.priceCents, qty: 1 + Math.floor(rand() * 2), note: '', cancelled: rand() < 0.03 };
      });
      const cancelledRound = rand() < 0.03;
      if (!cancelledRound) total += lines.filter((l) => !l.cancelled).reduce((s, l) => s + l.qty * l.priceCents, 0);
      await put(`rounds/${randomUUID()}`, {
        tableId: `table-${table.padStart(2, '0')}`, tableName: table, sessionId: session, status: cancelledRound ? 'cancelled' : 'served', items: lines, note: '',
        createdAt: Timestamp.fromDate(at), clientCreatedAt: Timestamp.fromDate(at), createdBy: 'demo', createdByName: server,
        servedAt: cancelledRound ? null : Timestamp.fromMillis(at.getTime() + (3 + Math.floor(rand() * 9)) * 60_000),
        updatedAt: Timestamp.fromDate(at), updatedBy: 'demo', editCount: rand() < 0.08 ? 1 : 0, editSeen: true, lastEventId: 'demo',
      });
    }
    if (total === 0) continue;
    const closeAt = new Date(night.getTime() + (startMin + rounds * 40 + 20) * 60_000);
    await put(`payments/${randomUUID()}`, {
      tableId: `table-${table.padStart(2, '0')}`, tableName: table, sessionId: session, amountCents: total, method: rand() < 0.6 ? 'card' : 'cash',
      createdAt: Timestamp.fromDate(closeAt), clientCreatedAt: Timestamp.fromDate(closeAt), createdBy: 'demo', createdByName: server,
    });
    await put(`sessions/${session}`, {
      tableId: `table-${table.padStart(2, '0')}`, tableName: table, closedAt: Timestamp.fromDate(closeAt), closedBy: 'demo', closedByName: server,
      totalCents: total, paidCents: total, roundCount: rounds,
    });
    bills++;
  }
}
await batch.commit();
console.log(`Demo history written: ${bills} closed bills over the last 21 nights.`);
