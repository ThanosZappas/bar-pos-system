import { describe, expect, it } from 'vitest';
import { checkAmount, isReversed, paidCents, reversalId, summaryLines, type Payment } from './payments';
import { receiptToJson } from './pos';
import { deriveTableState, type OrderLine, type Round, type RoundStatus } from './rounds';

const line = (lineId: string, itemId: string, name: string, priceCents: number, qty: number, cancelled = false): OrderLine =>
  ({ lineId, itemId, name, priceCents, qty, note: '', cancelled });
const round = (status: RoundStatus, ...lines: OrderLine[]): Round => ({
  id: 'r', tableId: 't', tableName: '1', sessionId: 's', status, lines, note: '', createdAtMs: 0, createdByName: 'S',
  openedAtMs: null, servedAtMs: null, servedByName: null, cancelledByName: null, editCount: 0, editSeen: true, lastEditByName: null, lastEventId: 'e',
});
const pay = (id: string, amountCents: number, reversalOf: string | null = null): Payment => ({
  id, tableId: 't', tableName: '1', sessionId: 's', amountCents, method: 'cash', reversalOf, reason: reversalOf ? 'x' : null, createdAtMs: 0, createdByName: 'S',
});

// Same cases as android PaymentsTest.
describe('payments', () => {
  it('sums payments including reversals', () => expect(paidCents([pay('a', 2000), pay('b', 500), pay(reversalId('b'), -500, 'b')])).toBe(2000));
  it('knows which payments were reversed', () => {
    const all = [pay('a', 2000), pay(reversalId('a'), -2000, 'a')];
    expect(isReversed(all[0], all)).toBe(true);
    expect(isReversed(pay('b', 1), all)).toBe(false);
  });
  it('refuses non-positive amounts and overpayment', () => {
    expect(checkAmount(0, 1000)).toBe('notPositive');
    expect(checkAmount(1001, 1000)).toBe('moreThanDue');
    expect(checkAmount(1000, 1000)).toBeNull();
  });
  it('drives the table from served to partially paid to paid', () => {
    const rounds = [round('served', line('a', 'n', 'Classic Negroni', 1000, 2))];
    expect(deriveTableState(rounds, paidCents([pay('a', 500)])).status).toBe('partiallyPaid');
    expect(deriveTableState(rounds, paidCents([pay('a', 500), pay('b', 1500)])).status).toBe('paid');
    expect(deriveTableState(rounds, paidCents([pay('a', 2000), pay(reversalId('a'), -2000, 'a')])).status).toBe('served');
  });
});

describe('summaryLines', () => {
  it('merges the same item across rounds and skips cancelled lines and rounds', () => {
    const rounds = [
      round('served', line('a', 'n', 'Classic Negroni', 1000, 2), line('b', 'z', 'Zombie', 1200, 1, true)),
      round('served', line('c', 'n', 'Classic Negroni', 1000, 1), line('d', 'c', 'Coca Cola', 350, 2)),
      round('cancelled', line('e', 'n', 'Classic Negroni', 1000, 5)),
    ];
    expect(summaryLines(rounds)).toEqual([
      { name: 'Classic Negroni', priceCents: 1000, qty: 3, totalCents: 3000 },
      { name: 'Coca Cola', priceCents: 350, qty: 2, totalCents: 700 },
    ]);
  });
});

describe('receiptToJson', () => {
  it('is plain JSON with cents, ISO times and fiscal: false', () => {
    const json = JSON.parse(receiptToJson({
      tableId: 't', tableName: '1', sessionId: 's', lines: [], totalCents: 0,
      payments: [{ id: 'p', amountCents: 500, method: 'card', reversalOf: null, createdAtMs: 0, createdByName: 'S' }],
      closedAtMs: 0, closedByName: 'Admin',
    }));
    expect(json).toMatchObject({ kind: 'receipt', fiscal: false, currency: 'EUR', closedAt: '1970-01-01T00:00:00.000Z' });
    expect(json.payments[0]).toEqual({ id: 'p', amountCents: 500, method: 'card', reversalOf: null, createdByName: 'S', createdAt: '1970-01-01T00:00:00.000Z' });
  });
});
