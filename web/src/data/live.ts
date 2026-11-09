import { useEffect, useState } from 'preact/hooks';
import { onSnapshot, serverTimestamp, type Query } from 'firebase/firestore';
import { firebase } from '../firebase';

/** Live query result; null until the first snapshot arrives. `key` must change when the query does. */
export function useLive<T>(makeQuery: () => Query, key = ''): (T & { id: string })[] | null {
  const [rows, setRows] = useState<(T & { id: string })[] | null>(null);
  useEffect(() => onSnapshot(makeQuery(), (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })))), [key]);
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
