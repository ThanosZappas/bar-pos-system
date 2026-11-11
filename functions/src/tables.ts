import { randomUUID } from 'node:crypto';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin, RIGHT_DEFAULTS, type Deps, type Right, type Rights } from './users.js';

/**
 * A table's open bill is its current session: every round and payment carries the session id.
 * Rules cannot query other documents, which is why the checks below are functions.
 */
async function sessionIsEmpty(deps: Deps, tx: Transaction, sessionId: string): Promise<boolean> {
  for (const collection of ['rounds', 'payments']) {
    const open = await tx.get(deps.db.collection(collection).where('sessionId', '==', sessionId).limit(1));
    if (!open.empty) return false;
  }
  return true;
}

/**
 * Active staff member who has set their own password, is on shift (barman/admin, a trusted
 * server, or a server approved until the next 18:00, with the same 2 h grace as the rules) and
 * holds `right`. Mirrors canWork() and may() in firestore.rules.
 */
async function requireWorking(deps: Deps, callerUid: string | undefined, right: Right): Promise<string> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = (await deps.db.doc(`users/${callerUid}`).get()).data();
  if (!me || me.active !== true) throw new HttpsError('permission-denied', 'This account is deactivated.');
  if (me.mustChangePassword !== false) throw new HttpsError('failed-precondition', 'Change your password first.');
  if (me.role === 'admin' || me.role === 'barman') return callerUid;
  const rights = (me.rights ?? {}) as Rights;
  if (!(rights.noApproval ?? RIGHT_DEFAULTS.noApproval)) {
    const shift = (await deps.db.doc(`shifts/${callerUid}`).get()).data();
    const until = shift?.approvedUntil?.toMillis?.() ?? 0;
    if (shift?.status !== 'approved' || Date.now() >= until + 2 * 3_600_000) {
      throw new HttpsError('permission-denied', 'Ask the barman for permission first.');
    }
  }
  if (!(rights[right] ?? RIGHT_DEFAULTS[right])) throw new HttpsError('permission-denied', 'You do not have this right.');
  return callerUid;
}

function stringArg(raw: unknown, key: string): string {
  const v = (raw as Record<string, unknown> | null)?.[key];
  if (typeof v !== 'string' || v === '') throw new HttpsError('invalid-argument', `"${key}" is required.`);
  return v;
}

/** Removes (archives) a table, refusing while its current session has any round or payment. */
export async function removeTable(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const tableId = stringArg(raw, 'tableId');

  await deps.db.runTransaction(async (tx) => {
    const ref = deps.db.doc(`tables/${tableId}`);
    const table = await tx.get(ref);
    if (!table.exists || table.get('archived') === true) throw new HttpsError('not-found', 'Table not found.');
    // By session, not by table id: after a move, the open bill's rounds carry the old table's id.
    if (!(await sessionIsEmpty(deps, tx, table.get('currentSessionId')))) {
      throw new HttpsError('failed-precondition', 'This table has an open order. Close it first.');
    }
    tx.update(ref, { archived: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
    tx.create(deps.db.collection('auditLog').doc(), {
      action: 'table.remove', actorUid: actor, targetUid: null,
      details: { tableId, name: table.get('name') }, at: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Guests change table: the open bill (rounds and payments, which never change) moves with them.
 * The target takes over the source's session id, and the source gets a fresh, empty session.
 * Refused unless the target is free (its current session has no rounds or payments).
 */
export async function moveTable(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireWorking(deps, callerUid, 'moveTables');
  const fromId = stringArg(raw, 'fromTableId');
  const toId = stringArg(raw, 'toTableId');
  if (fromId === toId) throw new HttpsError('invalid-argument', 'Pick a different table.');

  await deps.db.runTransaction(async (tx) => {
    const fromRef = deps.db.doc(`tables/${fromId}`);
    const toRef = deps.db.doc(`tables/${toId}`);
    const [from, to] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    for (const t of [from, to]) {
      if (!t.exists || t.get('archived') === true) throw new HttpsError('not-found', 'Table not found.');
    }
    const session = from.get('currentSessionId') as string;
    if (await sessionIsEmpty(deps, tx, session)) throw new HttpsError('failed-precondition', `Table ${from.get('name')} has nothing to move.`);
    if (!(await sessionIsEmpty(deps, tx, to.get('currentSessionId')))) {
      throw new HttpsError('failed-precondition', `Table ${to.get('name')} is not free.`);
    }
    const now = FieldValue.serverTimestamp();
    tx.update(toRef, { currentSessionId: session, updatedAt: now, updatedBy: actor });
    tx.update(fromRef, { currentSessionId: randomUUID(), updatedAt: now, updatedBy: actor });
    tx.create(deps.db.collection('auditLog').doc(), {
      action: 'table.move', actorUid: actor, targetUid: null,
      details: { from: fromId, fromName: from.get('name'), to: toId, toName: to.get('name'), sessionId: session }, at: now,
    });
  });
}
