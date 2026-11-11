import { activeLines, type Round } from './rounds';
import type { Payment } from './payments';

/**
 * Bar analytics, computed in the browser from rounds, payments and closed bills of a period.
 *
 * A bar's night runs past midnight, so a business day runs from 06:00 to 06:00: a drink served
 * at 01:30 belongs to the evening before. Weeks start on Monday. All times are local (Athens).
 */
export const DAY_START_HOUR = 6;

export type Period = 'day' | 'week' | 'month' | 'year';
export const PERIODS: Period[] = ['day', 'week', 'month', 'year'];

export interface Range {
  start: Date;
  end: Date; // exclusive
}

const at6 = (y: number, m: number, d: number) => new Date(y, m, d, DAY_START_HOUR);

/** The calendar date of the business day containing `ms` (local midnight of that date). */
export function businessDate(ms: number): Date {
  const d = new Date(ms - DAY_START_HOUR * 3_600_000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function periodRange(period: Period, anchor: Date): Range {
  const b = businessDate(anchor.getTime());
  const [y, m, d] = [b.getFullYear(), b.getMonth(), b.getDate()];
  switch (period) {
    case 'day':
      return { start: at6(y, m, d), end: at6(y, m, d + 1) };
    case 'week': {
      const monday = d - ((b.getDay() + 6) % 7);
      return { start: at6(y, m, monday), end: at6(y, m, monday + 7) };
    }
    case 'month':
      return { start: at6(y, m, 1), end: at6(y, m + 1, 1) };
    case 'year':
      return { start: at6(y, 0, 1), end: at6(y + 1, 0, 1) };
  }
}

/** The same kind of period, `delta` steps away (previous: -1). */
export function shiftAnchor(period: Period, anchor: Date, delta: number): Date {
  const b = businessDate(anchor.getTime());
  const [y, m, d] = [b.getFullYear(), b.getMonth(), b.getDate()];
  switch (period) {
    case 'day': return at6(y, m, d + delta);
    case 'week': return at6(y, m, d + 7 * delta);
    case 'month': return at6(y, m + delta, 1);
    case 'year': return at6(y + delta, 0, 1);
  }
}

/** Chart buckets: hours of the night for a day, days for a week/month, months for a year. */
export function bucketCount(period: Period, range: Range): number {
  switch (period) {
    case 'day': return 24;
    case 'week': return 7;
    case 'month': return Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000);
    case 'year': return 12;
  }
}

export function bucketOf(period: Period, range: Range, ms: number): number {
  if (period === 'day') return Math.floor((ms - range.start.getTime()) / 3_600_000);
  if (period === 'year') return businessDate(ms).getMonth();
  return Math.round((businessDate(ms).getTime() - businessDate(range.start.getTime()).getTime()) / 86_400_000);
}

/** Hour of the night, 0 = 06:00 … 23 = 05:00, for "busiest hours". */
export const nightHour = (ms: number) => (new Date(ms).getHours() - DAY_START_HOUR + 24) % 24;
export const nightHourLabel = (i: number) => String((i + DAY_START_HOUR) % 24).padStart(2, '0');

export interface ClosedBill {
  id: string;
  tableName: string;
  closedAtMs: number;
  totalCents: number;
  paidCents: number;
  roundCount: number;
}

export interface ItemSales {
  key: string;
  name: string;
  qty: number;
  revenueCents: number;
}

export interface Report {
  incomeCents: number;
  cashCents: number;
  cardCents: number;
  reversalCount: number;
  incomeByBucket: number[];
  billsClosed: number;
  averageBillCents: number;
  ordersCount: number;
  itemsSold: number;
  itemsPerBill: number;
  items: ItemSales[]; // most sold first
  categories: { name: string; qty: number; revenueCents: number }[]; // highest revenue first
  ordersByHour: number[]; // 24, index 0 = 06:00
  medianServeMinutes: number | null;
  cancelledOrders: number;
  cancelledItems: number;
  cancelledValueCents: number;
  editedOrders: number;
  staff: { name: string; orders: number; items: number; revenueCents: number }[]; // most orders first
}

const inRange = (ms: number, r: Range) => ms >= r.start.getTime() && ms < r.end.getTime();

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * `categoryOf` maps a menu item id to its category name (today's menu; items deleted since show
 * as "Other"). Rounds count by when they were ordered; sales exclude cancelled rounds and lines.
 */
export function analyze(
  period: Period,
  range: Range,
  data: { rounds: Round[]; payments: Payment[]; bills: ClosedBill[] },
  categoryOf: (itemId: string) => string | undefined = () => undefined,
): Report {
  const payments = data.payments.filter((p) => inRange(p.createdAtMs, range));
  const rounds = data.rounds.filter((r) => inRange(r.createdAtMs, range));
  const bills = data.bills.filter((b) => inRange(b.closedAtMs, range));
  const live = rounds.filter((r) => r.status !== 'cancelled');

  const incomeByBucket = new Array(bucketCount(period, range)).fill(0);
  for (const p of payments) {
    const i = bucketOf(period, range, p.createdAtMs);
    if (i >= 0 && i < incomeByBucket.length) incomeByBucket[i] += p.amountCents;
  }

  const items = new Map<string, ItemSales>();
  const categories = new Map<string, { name: string; qty: number; revenueCents: number }>();
  const staff = new Map<string, { name: string; orders: number; items: number; revenueCents: number }>();
  for (const r of live) {
    const who = staff.get(r.createdByName) ?? { name: r.createdByName, orders: 0, items: 0, revenueCents: 0 };
    who.orders += 1;
    for (const l of activeLines(r)) {
      const key = `${l.itemId}|${l.name}`;
      const it = items.get(key) ?? { key, name: l.name, qty: 0, revenueCents: 0 };
      it.qty += l.qty;
      it.revenueCents += l.qty * l.priceCents;
      items.set(key, it);
      const catName = categoryOf(l.itemId) ?? 'Other';
      const cat = categories.get(catName) ?? { name: catName, qty: 0, revenueCents: 0 };
      cat.qty += l.qty;
      cat.revenueCents += l.qty * l.priceCents;
      categories.set(catName, cat);
      who.items += l.qty;
      who.revenueCents += l.qty * l.priceCents;
    }
    staff.set(r.createdByName, who);
  }

  const ordersByHour = new Array(24).fill(0);
  for (const r of live) ordersByHour[nightHour(r.createdAtMs)] += 1;

  const cancelled = rounds.filter((r) => r.status === 'cancelled');
  const cancelledLines = rounds.flatMap((r) => (r.status === 'cancelled' ? r.lines : r.lines.filter((l) => l.cancelled)));
  const itemsSold = [...items.values()].reduce((s, i) => s + i.qty, 0);
  const billsTotal = bills.reduce((s, b) => s + b.totalCents, 0);

  return {
    incomeCents: payments.reduce((s, p) => s + p.amountCents, 0),
    cashCents: payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amountCents, 0),
    cardCents: payments.filter((p) => p.method === 'card').reduce((s, p) => s + p.amountCents, 0),
    reversalCount: payments.filter((p) => p.reversalOf).length,
    incomeByBucket,
    billsClosed: bills.length,
    averageBillCents: bills.length ? Math.round(billsTotal / bills.length) : 0,
    ordersCount: live.length,
    itemsSold,
    itemsPerBill: bills.length ? itemsSold / bills.length : 0,
    items: [...items.values()].sort((a, b) => b.qty - a.qty || b.revenueCents - a.revenueCents || a.name.localeCompare(b.name)),
    categories: [...categories.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    ordersByHour,
    medianServeMinutes: median(live.filter((r) => r.servedAtMs !== null).map((r) => (r.servedAtMs! - r.createdAtMs) / 60_000)),
    cancelledOrders: cancelled.length,
    cancelledItems: cancelledLines.reduce((s, l) => s + l.qty, 0),
    cancelledValueCents: cancelledLines.reduce((s, l) => s + l.qty * l.priceCents, 0),
    editedOrders: rounds.filter((r) => r.editCount > 0).length,
    staff: [...staff.values()].sort((a, b) => b.orders - a.orders),
  };
}

/** Change against the previous period in percent; null when there is nothing to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
