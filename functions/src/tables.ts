import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin, type Deps } from './users.js';

/**
 * Removes (archives) a table, refusing while it has an open order: any round or payment in its
 * current session. Rules cannot query other documents, which is why this is a function.
 */
export async function removeTable(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const tableId = (raw as { tableId?: unknown } | null)?.tableId;
  if (typeof tableId !== 'string' || tableId === '') throw new HttpsError('invalid-argument', '"tableId" is required.');

  await deps.db.runTransaction(async (tx) => {
    const ref = deps.db.doc(`tables/${tableId}`);
    const table = await tx.get(ref);
    if (!table.exists || table.get('archived') === true) throw new HttpsError('not-found', 'Table not found.');
    const sessionId = table.get('currentSessionId');
    for (const collection of ['rounds', 'payments']) {
      const open = await tx.get(
        deps.db.collection(collection).where('tableId', '==', tableId).where('sessionId', '==', sessionId).limit(1),
      );
      if (!open.empty) throw new HttpsError('failed-precondition', 'This table has an open order. Close it first.');
    }
    tx.update(ref, { archived: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
    tx.create(deps.db.collection('auditLog').doc(), {
      action: 'table.remove',
      actorUid: actor,
      targetUid: null,
      details: { tableId, name: table.get('name') },
      at: FieldValue.serverTimestamp(),
    });
  });
}
