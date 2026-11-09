import type { DocumentSnapshot } from 'firebase/firestore';
import { activeLines, type Round } from './rounds';

// Mirrors android/.../domain/Payments.kt. Same test cases on both sides.

export type PaymentMethod = 'cash' | 'card';

export interface Payment {
  id: string;
  tableId: string;
  tableName: string;
  sessionId: string;
  /** Negative for a reversal. */
  amountCents: number;
  method: PaymentMethod;
  reversalOf: string | null;
  reason: string | null;
  createdAtMs: number;
  createdByName: string;
}

type Ts = { toMillis(): number } | null | undefined;
const ms = (v: unknown) => ((v as Ts)?.toMillis ? (v as { toMillis(): number }).toMillis() : null);

export function paymentFromDoc(d: DocumentSnapshot): Payment {
  const x = d.data({ serverTimestamps: 'estimate' }) ?? {};
  return {
    id: d.id,
    tableId: x.tableId ?? '',
    tableName: x.tableName ?? '',
    sessionId: x.sessionId ?? '',
    amountCents: Number(x.amountCents ?? 0),
    method: x.method === 'card' ? 'card' : 'cash',
    reversalOf: x.reversalOf ?? null,
    reason: x.reason ?? null,
    createdAtMs: ms(x.clientCreatedAt) ?? ms(x.createdAt) ?? 0,
    createdByName: x.createdByName ?? '',
  };
}

export const paidCents = (payments: Payment[]) => payments.reduce((s, p) => s + p.amountCents, 0);

/** Reversal ids are derived from the original, so the rules allow only one reversal per payment. */
export const reversalId = (paymentId: string) => `reversal-${paymentId}`;

export const isReversed = (p: Payment, all: Payment[]) => all.some((x) => x.reversalOf === p.id);

export type AmountProblem = 'notPositive' | 'moreThanDue';

/** New payments must be positive and may not exceed what is still due (no overpayment, no tips). */
export function checkAmount(amountCents: number, dueCents: number): AmountProblem | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'notPositive';
  if (amountCents > dueCents) return 'moreThanDue';
  return null;
}

export interface SummaryLine {
  name: string;
  priceCents: number;
  qty: number;
  totalCents: number;
}

/**
 * Lines of the non-fiscal summary: all active lines of non-cancelled rounds, merged by item,
 * name and price, in order of first appearance.
 */
export function summaryLines(rounds: Round[]): SummaryLine[] {
  const merged = new Map<string, SummaryLine>();
  for (const r of rounds) {
    if (r.status === 'cancelled') continue;
    for (const l of activeLines(r)) {
      const key = `${l.itemId}|${l.name}|${l.priceCents}`;
      const line = merged.get(key) ?? { name: l.name, priceCents: l.priceCents, qty: 0, totalCents: 0 };
      line.qty += l.qty;
      line.totalCents += l.qty * l.priceCents;
      merged.set(key, line);
    }
  }
  return [...merged.values()];
}
