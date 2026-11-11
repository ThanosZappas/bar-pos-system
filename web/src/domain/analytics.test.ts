import { describe, expect, it } from 'vitest';
import { analyze, bucketCount, bucketOf, businessDate, change, nightHour, periodRange, shiftAnchor, type ClosedBill } from './analytics';
import type { Payment } from './payments';
import type { OrderLine, Round, RoundStatus } from './rounds';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('business days run 06:00–06:00', () => {
  it('puts 01:30 on the evening before', () => {
    expect(businessDate(local(2026, 11, 14, 1, 30).getTime())).toEqual(local(2026, 11, 13));
    expect(businessDate(local(2026, 11, 14, 6, 0).getTime())).toEqual(local(2026, 11, 14));
  });

  it('builds day, week (Monday), month and year ranges', () => {
    const fri2am = local(2026, 11, 14, 2); // Saturday 02:00 → still Friday 13th's night
    expect(periodRange('day', fri2am)).toEqual({ start: local(2026, 11, 13, 6), end: local(2026, 11, 14, 6) });
    expect(periodRange('week', fri2am)).toEqual({ start: local(2026, 11, 9, 6), end: local(2026, 11, 16, 6) });
    expect(periodRange('month', fri2am)).toEqual({ start: local(2026, 11, 1, 6), end: local(2026, 12, 1, 6) });
    expect(periodRange('year', local(2027, 1, 1, 3))).toEqual({ start: local(2026, 1, 1, 6), end: local(2027, 1, 1, 6) });
  });

  it('steps to the previous period', () => {
    expect(periodRange('week', shiftAnchor('week', local(2026, 11, 13, 20), -1)).start).toEqual(local(2026, 11, 2, 6));
    expect(periodRange('month', shiftAnchor('month', local(2026, 3, 31, 20), -1)).start).toEqual(local(2026, 2, 1, 6));
  });

  it('buckets hours, days and months', () => {
    const day = periodRange('day', local(2026, 11, 13, 20));
    expect(bucketCount('day', day)).toBe(24);
    expect(bucketOf('day', day, local(2026, 11, 14, 1, 30).getTime())).toBe(19);
    const month = periodRange('month', local(2026, 2, 10, 20));
    expect(bucketCount('month', month)).toBe(28);
    expect(bucketOf('month', month, local(2026, 2, 3, 2).getTime())).toBe(1); // 2nd's night
    expect(bucketOf('year', periodRange('year', local(2026, 5, 1)), local(2026, 5, 20, 22).getTime())).toBe(4);
    expect(nightHour(local(2026, 11, 13, 6, 59).getTime())).toBe(0);
    expect(nightHour(local(2026, 11, 14, 5, 0).getTime())).toBe(23);
  });
});

const line = (itemId: string, name: string, priceCents: number, qty: number, cancelled = false): OrderLine =>
  ({ lineId: `${itemId}-${qty}`, itemId, name, priceCents, qty, note: '', cancelled });
function round(at: Date, status: RoundStatus, lines: OrderLine[], extra: Partial<Round> = {}): Round {
  return {
    id: String(Math.random()), tableId: 't', tableName: '1', sessionId: 's', status, lines, note: '', createdAtMs: at.getTime(),
    createdByName: 'Server 1', openedAtMs: null, servedAtMs: null, servedByName: null, cancelledByName: null,
    editCount: 0, editSeen: true, lastEditByName: null, lastEventId: 'e', ...extra,
  };
}
const pay = (at: Date, amountCents: number, method: 'cash' | 'card', reversalOf: string | null = null): Payment => ({
  id: String(Math.random()), tableId: 't', tableName: '1', sessionId: 's', amountCents, method, reversalOf, reason: null,
  createdAtMs: at.getTime(), createdByName: 'Server 1',
});

describe('analyze', () => {
  const range = periodRange('day', local(2026, 11, 13, 20));
  const rounds = [
    round(local(2026, 11, 13, 21), 'served', [line('neg', 'Classic Negroni', 1000, 2), line('zom', 'Zombie', 1200, 1, true)], { servedAtMs: local(2026, 11, 13, 21, 8).getTime() }),
    round(local(2026, 11, 13, 23), 'served', [line('neg', 'Classic Negroni', 1000, 1), line('beer', 'Mythos', 500, 3)], { servedAtMs: local(2026, 11, 13, 23, 4).getTime(), createdByName: 'Server 2', editCount: 1 }),
    round(local(2026, 11, 14, 1, 30), 'cancelled', [line('neg', 'Classic Negroni', 1000, 4)]),
    round(local(2026, 11, 12, 22), 'served', [line('neg', 'Classic Negroni', 1000, 9)]), // previous night: excluded
  ];
  const payments = [pay(local(2026, 11, 13, 22), 2000, 'card'), pay(local(2026, 11, 14, 0, 30), 2500, 'cash'), pay(local(2026, 11, 14, 0, 40), -500, 'cash', 'x')];
  const bills: ClosedBill[] = [{ id: 'b', tableName: '1', closedAtMs: local(2026, 11, 14, 1).getTime(), totalCents: 4500, paidCents: 4500, roundCount: 2 }];
  const category = (id: string) => ({ neg: 'Negroni', beer: 'Beer' })[id];
  const r = analyze('day', range, { rounds, payments, bills }, category);

  it('sums income by method, net of reversals, into the right hours', () => {
    expect(r).toMatchObject({ incomeCents: 4000, cashCents: 2000, cardCents: 2000, reversalCount: 1 });
    expect(r.incomeByBucket[16]).toBe(2000); // 22:00
    expect(r.incomeByBucket[18]).toBe(2000); // 00:00–01:00, net
  });

  it('counts bills, orders and items without cancelled ones', () => {
    expect(r).toMatchObject({ billsClosed: 1, averageBillCents: 4500, ordersCount: 2, itemsSold: 6, itemsPerBill: 6 });
    expect(r).toMatchObject({ cancelledOrders: 1, cancelledItems: 5, cancelledValueCents: 5200, editedOrders: 1 });
  });

  it('ranks items and categories', () => {
    expect(r.items.map((i) => [i.name, i.qty, i.revenueCents])).toEqual([['Classic Negroni', 3, 3000], ['Mythos', 3, 1500]]);
    expect(r.categories.map((c) => c.name)).toEqual(['Negroni', 'Beer']);
  });

  it('finds busy hours, serve time and staff', () => {
    expect(r.ordersByHour[15]).toBe(1); // 21:00
    expect(r.ordersByHour[17]).toBe(1); // 23:00
    expect(r.medianServeMinutes).toBe(6);
    expect(r.staff.map((s) => [s.name, s.orders])).toEqual([['Server 1', 1], ['Server 2', 1]]);
  });
});

describe('change', () => {
  it('is a rounded percentage, or null without a base', () => {
    expect(change(1500, 1000)).toBe(50);
    expect(change(900, 1000)).toBe(-10);
    expect(change(100, 0)).toBeNull();
  });
});
