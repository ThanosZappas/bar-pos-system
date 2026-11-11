import { useEffect, useState } from 'preact/hooks';
import { listen } from './live';
import { collection, doc, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import { firebase } from '../firebase';
import { shiftEnd, shiftKey } from '../domain/shift';
import { send } from './sync';

/** A server's permission to work this shift (shifts/{uid}); see the Android ShiftRepository. */
export interface Shift {
  uid: string;
  displayName: string;
  shiftDay: string;
  status: 'requested' | 'approved' | 'denied' | 'revoked';
  requestedAtMs: number | null;
  decidedByName: string | null;
  approvedUntilMs: number | null;
}

const db = () => firebase!.db;
const ms = (v: unknown) => ((v as { toMillis?: () => number } | null)?.toMillis?.() ?? null);

function fromDoc(id: string, x: Record<string, unknown>): Shift {
  return {
    uid: id,
    displayName: String(x.displayName ?? ''),
    shiftDay: String(x.shiftDay ?? ''),
    status: (['requested', 'approved', 'denied', 'revoked'].includes(x.status as string) ? x.status : 'revoked') as Shift['status'],
    requestedAtMs: ms(x.requestedAt),
    decidedByName: (x.decidedByName as string) ?? null,
    approvedUntilMs: ms(x.approvedUntil),
  };
}

export const isApproved = (s: Shift | undefined, nowMs: number) => s?.status === 'approved' && (s.approvedUntilMs ?? 0) > nowMs;

/** Every server's permission document, by uid (live). */
export function useShifts(): Map<string, Shift> {
  const [byUid, setByUid] = useState(new Map<string, Shift>());
  useEffect(
    () => listen(collection(db(), 'shifts'), (snap) => setByUid(new Map(snap.docs.map((d) => [d.id, fromDoc(d.id, d.data({ serverTimestamps: 'estimate' }))])))),
    [],
  );
  return byUid;
}

/** Requests waiting for an answer in the current shift, oldest first (live). */
export function usePendingRequests(): Shift[] {
  const [rows, setRows] = useState<Shift[]>([]);
  useEffect(
    () =>
      listen(query(collection(db(), 'shifts'), where('status', '==', 'requested')), (snap) => {
        const today = shiftKey(Date.now());
        setRows(
          snap.docs
            .map((d) => fromDoc(d.id, d.data({ serverTimestamps: 'estimate' })))
            .filter((s) => s.shiftDay === today)
            .sort((a, b) => (a.requestedAtMs ?? 0) - (b.requestedAtMs ?? 0)),
        );
      }),
    [],
  );
  return rows;
}

/** Approve until the next 18:00 (also without a request), deny, or take back. */
export async function decide(serverUid: string, serverName: string, status: 'approved' | 'denied' | 'revoked', me: { uid: string; displayName: string }) {
  const now = Date.now();
  await send(
    setDoc(doc(db(), 'shifts', serverUid), {
      uid: serverUid,
      displayName: serverName,
      shiftDay: shiftKey(now),
      status,
      decidedAt: serverTimestamp(),
      decidedBy: me.uid,
      decidedByName: me.displayName,
      ...(status === 'approved' ? { approvedUntil: Timestamp.fromDate(shiftEnd(now)) } : {}),
    }),
  );
}
