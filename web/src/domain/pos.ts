import type { Payment } from './payments';
import type { Round } from './rounds';
import type { SummaryLine } from './payments';

/**
 * Seam for a future POS / fiscal integration (design only, no real POS yet). Mirrors
 * android/.../pos/PosGateway.kt. The apps call it when a round is sent and when a table is
 * closed; today it does nothing, or exports JSON for inspection.
 */
export interface Receipt {
  tableId: string;
  tableName: string;
  sessionId: string;
  lines: SummaryLine[];
  totalCents: number;
  payments: Pick<Payment, 'id' | 'amountCents' | 'method' | 'reversalOf' | 'createdAtMs' | 'createdByName'>[];
  closedAtMs: number;
  closedByName: string;
}

export interface PosGateway {
  sendOrder(round: Round): Promise<void>;
  sendReceipt(receipt: Receipt): Promise<void>;
}

export const noOpPosGateway: PosGateway = {
  async sendOrder() {},
  async sendReceipt() {},
};

/** Stable JSON for an external system: integer cents, ISO times, no Firestore types. */
export function receiptToJson(r: Receipt): string {
  return JSON.stringify({
    kind: 'receipt',
    fiscal: false,
    table: { id: r.tableId, name: r.tableName },
    sessionId: r.sessionId,
    currency: 'EUR',
    lines: r.lines,
    totalCents: r.totalCents,
    payments: r.payments.map((p) => ({ ...p, createdAt: new Date(p.createdAtMs).toISOString(), createdAtMs: undefined })),
    closedAt: new Date(r.closedAtMs).toISOString(),
    closedBy: r.closedByName,
  });
}
