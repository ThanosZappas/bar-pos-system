import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { firebase } from '../firebase';
import type { ClosedBill, Range } from '../domain/analytics';
import { paymentFromDoc, type Payment } from '../domain/payments';
import { roundFromDoc, type Round } from '../domain/rounds';

const db = () => firebase!.db;

function between(collectionName: string, field: string, from: Date, to: Date) {
  return getDocs(query(collection(db(), collectionName), where(field, '>=', Timestamp.fromDate(from)), where(field, '<', Timestamp.fromDate(to))));
}

export interface PeriodData {
  rounds: Round[];
  payments: Payment[]; // current and previous period
  bills: ClosedBill[]; // current and previous period
}

/**
 * One-off reads (not live) for a period plus the previous one, for comparisons. Single-field
 * range queries, so Firestore needs no composite index. A year reads every round of that year;
 * at this bar's size that is a few thousand documents.
 */
export async function loadPeriod(range: Range, previous: Range): Promise<PeriodData> {
  const [rounds, payments, sessions] = await Promise.all([
    between('rounds', 'createdAt', range.start, range.end),
    between('payments', 'createdAt', previous.start, range.end),
    between('sessions', 'closedAt', previous.start, range.end),
  ]);
  return {
    rounds: rounds.docs.map(roundFromDoc),
    payments: payments.docs.map(paymentFromDoc),
    bills: sessions.docs.map((d) => {
      const x = d.data({ serverTimestamps: 'estimate' });
      return {
        id: d.id,
        tableName: x.tableName ?? '',
        closedAtMs: x.closedAt?.toMillis?.() ?? 0,
        totalCents: Number(x.totalCents ?? 0),
        paidCents: Number(x.paidCents ?? 0),
        roundCount: Number(x.roundCount ?? 0),
      };
    }),
  };
}
