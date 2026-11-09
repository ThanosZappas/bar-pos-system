import { useEffect, useState } from 'preact/hooks';
import { collection, deleteField, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch, type DocumentData, type DocumentSnapshot, type Query, type Unsubscribe } from 'firebase/firestore';
import { firebase } from '../firebase';
import { roundFromDoc, type Round } from '../domain/rounds';
import { send } from './sync';

const db = () => firebase!.db;

function me() {
  const u = firebase?.auth.currentUser;
  if (!u) throw new Error('Not signed in');
  return u.uid;
}

/** Merges several live queries into one list keyed by document id. */
export function useMerged<T extends { id: string }>(
  queries: () => Query<DocumentData>[],
  key: string,
  map: (d: DocumentSnapshot) => T,
  keep: (x: T) => boolean,
  order: (a: T, b: T) => number,
): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    const parts = new Map<number, T[]>();
    const qs = queries();
    if (qs.length === 0) {
      setRows([]);
      return;
    }
    const unsubs: Unsubscribe[] = qs.map((q, i) =>
      onSnapshot(q, (snap) => {
        parts.set(i, snap.docs.map(map));
        if (parts.size < qs.length) return; // wait for every query's first snapshot
        const byId = new Map<string, T>();
        for (const list of parts.values()) for (const x of list) byId.set(x.id, x);
        setRows([...byId.values()].filter(keep).sort(order));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return rows;
}

const oldestFirst = (a: Round, b: Round) => a.createdAtMs - b.createdAtMs;
const useMergedRounds = (queries: () => Query<DocumentData>[], key: string, keep: (r: Round) => boolean) =>
  useMerged(queries, key, roundFromDoc, keep, oldestFirst);

/** Splits ids into whereIn-sized chunks (Firestore allows at most 30 values). */
export function chunks(ids: string[]): string[][] {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) out.push(unique.slice(i, i + 30));
  return out;
}

/**
 * The bar's to-do list: every Preparing round, plus cancelled rounds the barman has not yet
 * acknowledged. Two single-field queries, so no composite index is needed.
 */
export function useBoardRounds(): Round[] | null {
  return useMergedRounds(
    () => [
      query(collection(db(), 'rounds'), where('status', '==', 'preparing')),
      query(collection(db(), 'rounds'), where('editSeen', '==', false)),
    ],
    'board',
    (r) => r.status === 'preparing' || (r.status === 'cancelled' && !r.editSeen),
  );
}

/** All rounds of the given (current) sessions. whereIn takes at most 30 values per query. */
export function useSessionRounds(sessionIds: string[]): Round[] | null {
  const parts = chunks(sessionIds);
  return useMergedRounds(
    () => parts.map((c) => query(collection(db(), 'rounds'), where('sessionId', 'in', c))),
    parts.flat().join(','),
    () => true,
  );
}

/** The barman has seen the round (and its latest change): clears the highlight. */
export async function openRound(r: Round): Promise<void> {
  const uid = me();
  const b = writeBatch(db());
  b.update(doc(db(), 'rounds', r.id), { openedAt: serverTimestamp(), openedBy: uid, editSeen: true, updatedAt: serverTimestamp(), updatedBy: uid });
  await send(b.commit());
}

export async function serveRound(r: Round, byName: string): Promise<void> {
  const uid = me();
  const eventId = crypto.randomUUID();
  const b = writeBatch(db());
  b.update(doc(db(), 'rounds', r.id), {
    status: 'served', servedAt: serverTimestamp(), servedBy: uid, servedByName: byName,
    updatedAt: serverTimestamp(), updatedBy: uid, lastEventId: eventId,
  });
  b.set(doc(db(), 'rounds', r.id, 'events', eventId), { type: 'served', at: serverTimestamp(), by: uid, byName });
  await send(b.commit());
}

/** Seconds the board offers "Undo" after Served; the rules allow 120 s, leaving room for slow networks. */
export const UNDO_SERVED_SECONDS = 60;

/** Undo an accidental "Served": back to Preparing, logged. */
export async function unserveRound(r: Round, byName: string): Promise<void> {
  const uid = me();
  const eventId = crypto.randomUUID();
  const b = writeBatch(db());
  b.update(doc(db(), 'rounds', r.id), {
    status: 'preparing', servedAt: deleteField(), servedBy: deleteField(), servedByName: deleteField(),
    updatedAt: serverTimestamp(), updatedBy: uid, lastEventId: eventId,
  });
  b.set(doc(db(), 'rounds', r.id, 'events', eventId), { type: 'unserved', at: serverTimestamp(), by: uid, byName });
  await send(b.commit());
}

/** The barman cannot make it: cancel, logged; acknowledged at once since he did it himself. */
export async function cancelRound(r: Round, byName: string): Promise<void> {
  const uid = me();
  const eventId = crypto.randomUUID();
  const b = writeBatch(db());
  b.update(doc(db(), 'rounds', r.id), {
    status: 'cancelled', cancelledAt: serverTimestamp(), cancelledBy: uid, cancelledByName: byName, editSeen: false,
    updatedAt: serverTimestamp(), updatedBy: uid, lastEventId: eventId,
  });
  b.set(doc(db(), 'rounds', r.id, 'events', eventId), { type: 'cancelled', at: serverTimestamp(), by: uid, byName });
  await send(b.commit());
  await send(writeBatch(db()).update(doc(db(), 'rounds', r.id), { openedAt: serverTimestamp(), openedBy: uid, editSeen: true, updatedAt: serverTimestamp(), updatedBy: uid }).commit());
}

export interface LineChange {
  lineId: string;
  name: string;
  qtyFrom: number;
  qtyTo: number;
  noteFrom: string;
  noteTo: string;
  cancelled: boolean;
}
export interface RoundEvent {
  type: 'created' | 'edited' | 'served' | 'cancelled' | 'unserved';
  byName: string;
  changes?: LineChange[];
  note?: string;
}

const eventCache = new Map<string, Promise<RoundEvent | null>>();

/** The latest change to a round, to show the barman exactly what was edited. Events never change, so they are cached. */
export function fetchEvent(roundId: string, eventId: string): Promise<RoundEvent | null> {
  const key = `${roundId}/${eventId}`;
  if (!eventCache.has(key)) {
    eventCache.set(key, getDoc(doc(db(), 'rounds', roundId, 'events', eventId)).then((s) => (s.exists() ? (s.data() as RoundEvent) : null)));
  }
  return eventCache.get(key)!;
}
