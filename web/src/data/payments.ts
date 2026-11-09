import { useEffect, useState } from 'preact/hooks';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore';
import { firebase } from '../firebase';
import { paidCents, paymentFromDoc, reversalId, summaryLines, type Payment, type PaymentMethod } from '../domain/payments';
import { noOpPosGateway, type PosGateway } from '../domain/pos';
import { deriveTableState, type Round } from '../domain/rounds';
import type { Table } from './catalog';
import { chunks, useMerged } from './rounds';
import { send } from './sync';

const db = () => firebase!.db;
const uid = () => {
  const u = firebase?.auth.currentUser;
  if (!u) throw new Error('Not signed in');
  return u.uid;
};

/** Where receipts go when a table closes. No real POS yet (design only). */
export const pos: PosGateway = noOpPosGateway;

const oldestFirst = (a: Payment, b: Payment) => a.createdAtMs - b.createdAtMs;

export function useSessionPayments(sessionIds: string[]): Payment[] | null {
  const parts = chunks(sessionIds);
  return useMerged(
    () => parts.map((c) => query(collection(db(), 'payments'), where('sessionId', 'in', c))),
    parts.flat().join(','),
    paymentFromDoc,
    () => true,
    oldestFirst,
  );
}

/** Payments recorded since local midnight, newest first. */
export function useTodayPayments(): Payment[] | null {
  const [rows, setRows] = useState<Payment[] | null>(null);
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const q = query(collection(db(), 'payments'), where('createdAt', '>=', Timestamp.fromDate(midnight)), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setRows(snap.docs.map(paymentFromDoc)));
  }, []);
  return rows;
}

function base(table: Table & { id: string }, byName: string) {
  return {
    tableId: table.id, tableName: table.name, sessionId: table.currentSessionId,
    createdAt: serverTimestamp(), createdBy: uid(), createdByName: byName, clientCreatedAt: Timestamp.now(),
  };
}

export async function addPayment(table: Table & { id: string }, amountCents: number, method: PaymentMethod, byName: string): Promise<void> {
  await send(setDoc(doc(db(), 'payments', crypto.randomUUID()), { ...base(table, byName), amountCents, method }));
}

/** Full reversal of a mistaken payment; its id is derived from the original so it can happen only once. */
export async function reversePayment(p: Payment, reason: string, byName: string): Promise<void> {
  await send(setDoc(doc(db(), 'payments', reversalId(p.id)), {
    tableId: p.tableId, tableName: p.tableName, sessionId: p.sessionId,
    amountCents: -p.amountCents, method: p.method, reversalOf: p.id, reason,
    createdAt: serverTimestamp(), createdBy: uid(), createdByName: byName, clientCreatedAt: Timestamp.now(),
  }));
}

/**
 * Closes a fully paid table: records the session and gives the table a fresh session id, in one
 * batch (the rules check both halves). The table returns to Free.
 */
export async function closeTable(table: Table & { id: string }, rounds: Round[], payments: Payment[], byName: string): Promise<void> {
  const paid = paidCents(payments);
  const state = deriveTableState(rounds, paid);
  if (state.status !== 'paid') throw new Error('Only a fully paid table can be closed.');
  const b = writeBatch(db());
  b.set(doc(db(), 'sessions', table.currentSessionId), {
    tableId: table.id, tableName: table.name, closedAt: serverTimestamp(), closedBy: uid(), closedByName: byName,
    totalCents: state.totalCents, paidCents: paid, roundCount: state.roundCount,
  });
  b.update(doc(db(), 'tables', table.id), { currentSessionId: crypto.randomUUID(), updatedAt: serverTimestamp(), updatedBy: uid() });
  await send(b.commit());
  await pos.sendReceipt({
    tableId: table.id, tableName: table.name, sessionId: table.currentSessionId,
    lines: summaryLines(rounds), totalCents: state.totalCents, payments, closedAtMs: Date.now(), closedByName: byName,
  });
}

export interface Settings {
  barName: string;
  address: string;
  phone: string;
  receiptFooter: string;
}

export const DEFAULT_SETTINGS: Settings = { barName: 'Negroni Bar Lab', address: '', phone: '', receiptFooter: '' };

export function useSettings(): Settings {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => onSnapshot(doc(db(), 'settings', 'app'), (snap) => setS({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings>) })), []);
  return s;
}

export async function saveSettings(s: Settings): Promise<void> {
  await send(setDoc(doc(db(), 'settings', 'app'), { ...s, updatedAt: serverTimestamp(), updatedBy: uid() }));
}
