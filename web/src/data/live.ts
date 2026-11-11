import { useEffect, useState } from 'preact/hooks';
import {
  onSnapshot, serverTimestamp, type DocumentReference, type DocumentSnapshot, type FirestoreError, type Query, type QuerySnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { firebase } from '../firebase';

/** Live query result; null until the first snapshot arrives. `key` must change when the query does. */
export function useLive<T>(makeQuery: () => Query, key = ''): (T & { id: string })[] | null {
  const [rows, setRows] = useState<(T & { id: string })[] | null>(null);
  useEffect(() => listen(makeQuery(), (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })))), [key]);
  return rows;
}

function me(): string {
  const uid = firebase?.auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

/** Who/when on every write; security rules require exactly these values. */
export function created() {
  const uid = me();
  return { createdAt: serverTimestamp(), createdBy: uid, updatedAt: serverTimestamp(), updatedBy: uid };
}

export function updated() {
  return { updatedAt: serverTimestamp(), updatedBy: me() };
}

/**
 * Keeps a listener alive: when it fails (a "permission denied" right after sign-in, while the
 * rules are being updated, or a broken stream) it is attached again after `retryMs` instead of
 * going silent for the rest of the evening.
 */
export function resilient(attach: (onError: (e: FirestoreError) => void) => Unsubscribe, retryMs = 3_000): Unsubscribe {
  let current: Unsubscribe | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const start = () => {
    current = attach(() => {
      current?.();
      current = null;
      if (!stopped) timer = setTimeout(start, retryMs);
    });
  };
  start();
  return () => {
    stopped = true;
    clearTimeout(timer);
    current?.();
  };
}

/** onSnapshot that re-attaches itself after an error (see resilient). */
export function listen<T>(ref: Query<T>, next: (snap: QuerySnapshot<T>) => void): Unsubscribe;
export function listen<T>(ref: DocumentReference<T>, next: (snap: DocumentSnapshot<T>) => void): Unsubscribe;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function listen(ref: any, next: any): Unsubscribe {
  return resilient((onError) => onSnapshot(ref, next, onError));
}
