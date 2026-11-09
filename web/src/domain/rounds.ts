import type { DocumentSnapshot } from 'firebase/firestore';

// Mirrors android/.../domain/Orders.kt and TableStatus.kt. Keep both in sync (same test cases).

export type RoundStatus = 'preparing' | 'served' | 'cancelled';

export interface OrderLine {
  lineId: string;
  itemId: string;
  name: string;
  priceCents: number;
  qty: number;
  note: string;
  cancelled: boolean;
}

export interface Round {
  id: string;
  tableId: string;
  tableName: string;
  sessionId: string;
  status: RoundStatus;
  lines: OrderLine[];
  note: string;
  /** Epoch ms; the phone's clock, so rounds made offline keep their real order time. */
  createdAtMs: number;
  createdByName: string;
  openedAtMs: number | null;
  servedAtMs: number | null;
  servedByName: string | null;
  cancelledByName: string | null;
  editCount: number;
  editSeen: boolean;
  lastEditByName: string | null;
  lastEventId: string;
}

export const lineTotal = (l: OrderLine) => (l.cancelled ? 0 : l.priceCents * l.qty);
export const roundTotal = (r: Round) => (r.status === 'cancelled' ? 0 : r.lines.reduce((s, l) => s + lineTotal(l), 0));
export const activeLines = (r: Round) => r.lines.filter((l) => !l.cancelled);

/** Not yet looked at by the barman. */
export const isNew = (r: Round) => r.openedAtMs === null && r.status === 'preparing';
/** Edited or cancelled since the barman last looked. */
export const isChanged = (r: Round) => !r.editSeen;

type Ts = { toMillis(): number } | null | undefined;
const ms = (v: unknown): number | null => ((v as Ts)?.toMillis ? (v as { toMillis(): number }).toMillis() : null);

export function roundFromDoc(d: DocumentSnapshot): Round {
  const x = d.data({ serverTimestamps: 'estimate' }) ?? {};
  const lines = Array.isArray(x.items) ? x.items : [];
  return {
    id: d.id,
    tableId: x.tableId ?? '',
    tableName: x.tableName ?? '',
    sessionId: x.sessionId ?? '',
    status: (['preparing', 'served', 'cancelled'].includes(x.status) ? x.status : 'preparing') as RoundStatus,
    lines: lines.map((l: Partial<OrderLine>) => ({
      lineId: l.lineId ?? '',
      itemId: l.itemId ?? '',
      name: l.name ?? '',
      priceCents: Number(l.priceCents ?? 0),
      qty: Number(l.qty ?? 0),
      note: l.note ?? '',
      cancelled: l.cancelled === true,
    })),
    note: x.note ?? '',
    createdAtMs: ms(x.clientCreatedAt) ?? ms(x.createdAt) ?? 0,
    createdByName: x.createdByName ?? '',
    openedAtMs: ms(x.openedAt),
    servedAtMs: ms(x.servedAt),
    servedByName: x.servedByName ?? null,
    cancelledByName: x.cancelledByName ?? null,
    editCount: Number(x.editCount ?? 0),
    editSeen: x.editSeen !== false,
    lastEditByName: x.lastEditByName ?? null,
    lastEventId: x.lastEventId ?? '',
  };
}

export type TableStatus = 'free' | 'preparing' | 'served' | 'partiallyPaid' | 'paid';

export interface TableState {
  status: TableStatus;
  totalCents: number;
  paidCents: number;
  dueCents: number;
  roundCount: number;
}

/**
 * Preparing wins over payment states (the bar still has work to do). Otherwise:
 * nothing paid → served, part paid → partially paid, all paid → paid. No active rounds and
 * no payments → free.
 */
export function deriveTableState(rounds: Round[], paidCents = 0): TableState {
  const active = rounds.filter((r) => r.status !== 'cancelled' && activeLines(r).length > 0);
  const total = active.reduce((s, r) => s + roundTotal(r), 0);
  let status: TableStatus;
  if (active.length === 0 && paidCents === 0) status = 'free';
  else if (active.some((r) => r.status === 'preparing')) status = 'preparing';
  else if (paidCents <= 0) status = 'served';
  else if (paidCents < total) status = 'partiallyPaid';
  else status = 'paid';
  return { status, totalCents: total, paidCents, dueCents: Math.max(0, total - paidCents), roundCount: active.length };
}

/** "45 s", "12 min", "1 h 05" — how long a round has been waiting. */
export function elapsed(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/**
 * A round is late when no table currently holds its session: the bill was closed (the round was
 * sent offline and synced afterwards) or its table was removed. Accepted and flagged. A bill that
 * moved to another table is not late: the new table holds the same session.
 */
export function isLate(r: Round, currentSessions: Set<string>): boolean {
  return !currentSessions.has(r.sessionId);
}

/** The table a round is at now: after a move, its session belongs to another table. */
export function tableNameNow(r: Round, tableNameBySession: Map<string, string>): string {
  return tableNameBySession.get(r.sessionId) ?? r.tableName;
}
