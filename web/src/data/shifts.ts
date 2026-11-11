import { useEffect, useState } from 'preact/hooks';
import { listen } from './live';
import { collection, doc, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import { firebase } from '../firebase';
import { afterDenial, shiftEnd, shiftKey } from '../domain/shift';
import { send } from './sync';

/** A server's permission to work this shift (shifts/{uid}); see the Android ShiftRepository. */
export interface Shift {
  uid: string;
  displayName: string;
  shiftDay: string;
  status: 'requested' | 'approved' | 'denied' | 'revoked' | 'cleared';
  requestedAtMs: number | null;
  decidedByName: string | null;
  approvedUntilMs: number | null;
  denials: number;
  lastDeniedAtMs: number | null;
  blockedUntilMs: number | null;
}

const db = () => firebase!.db;
const ms = (v: unknown) => ((v as { toMillis?: () => number } | null)?.toMillis?.() ?? null);

function fromDoc(id: string, x: Record<string, unknown>): Shift {
  return {
    uid: id,
    displayName: String(x.displayName ?? ''),
    shiftDay: String(x.shiftDay ?? ''),
    status: (['requested', 'approved', 'denied', 'revoked', 'cleared'].includes(x.status as string) ? x.status : 'revoked') as Shift['status'],
    requestedAtMs: ms(x.requestedAt),
    decidedByName: (x.decidedByName as string) ?? null,
    approvedUntilMs: ms(x.approvedUntil),
    denials: Number(x.denials ?? 0),
    lastDeniedAtMs: ms(x.lastDeniedAt),
    blockedUntilMs: ms(x.blockedUntil),
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

type Me = { uid: string; displayName: string };

/** Barman/admin decisions replace the document (the rules check every field). */
async function decide(serverUid: string, serverName: string, status: Shift['status'], me: Me, extra: Record<string, unknown> = {}) {
  await send(
    setDoc(doc(db(), 'shifts', serverUid), {
      uid: serverUid,
      displayName: serverName,
      shiftDay: shiftKey(Date.now()),
      status,
      decidedAt: serverTimestamp(),
      decidedBy: me.uid,
      decidedByName: me.displayName,
      ...extra,
    }),
  );
}

/** Allowed until the next 18:00 (also without a request); clears any denials. */
export const approve = (uid: string, name: string, me: Me) =>
  decide(uid, name, 'approved', me, { approvedUntil: Timestamp.fromDate(shiftEnd(Date.now())), denials: 0 });

/** "Not now". The second in a row this shift blocks further requests until 18:00. */
export function deny(current: Shift | undefined, uid: string, name: string, me: Me) {
  const { denials, blockedUntil } = afterDenial(current, Date.now());
  return decide(uid, name, 'denied', me, { denials, lastDeniedAt: serverTimestamp(), ...(blockedUntil ? { blockedUntil: Timestamp.fromDate(blockedUntil) } : {}) });
}

/** Take permission back; the denial count stays as it was. */
export const revoke = (current: Shift | undefined, uid: string, name: string, me: Me) =>
  decide(uid, name, 'revoked', me, {
    denials: current?.denials ?? 0,
    ...(current?.lastDeniedAtMs ? { lastDeniedAt: Timestamp.fromMillis(current.lastDeniedAtMs) } : {}),
    ...(current?.blockedUntilMs ? { blockedUntil: Timestamp.fromMillis(current.blockedUntilMs) } : {}),
  });

/** Lift a block: the server may ask again. */
export const clearBlock = (uid: string, name: string, me: Me) => decide(uid, name, 'cleared', me, { denials: 0 });
