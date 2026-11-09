import { useState } from 'preact/hooks';
import { t, type Key } from '../i18n';
import { moveTable, useCatalog, type Table } from '../data/catalog';
import { errorKey } from './errors';
import { serveRound, useSessionRounds } from '../data/rounds';
import { useSessionPayments } from '../data/payments';
import { paidCents, type Payment } from '../domain/payments';
import { deriveTableState, roundTotal, type Round, type TableState, type TableStatus } from '../domain/rounds';
import { formatCents } from '../lib/money';
import { clock } from '../lib/time';
import type { StaffUser } from '../session';
import { PaymentsPanel } from './PaymentsPanel';
import { RoundLines } from './RoundLines';

const statusKey = (s: TableStatus) => `status.${s}` as Key;
const roundKey = (r: Round) => `round.${r.status}` as Key;

/** Live table grid with derived status colours; click a table for its rounds and totals. */
export function TablesOverview({ user }: { user: StaffUser }) {
  const tables = useCatalog<Table>('tables');
  const rounds = useSessionRounds(tables?.map((x) => x.currentSessionId) ?? []);
  const payments = useSessionPayments(tables?.map((x) => x.currentSessionId) ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  if (!tables || !rounds || !payments) return <section class="page"><p class="desc">{t('app.loading')}</p></section>;

  const bySession = new Map<string, Round[]>();
  for (const r of rounds) bySession.set(r.sessionId, [...(bySession.get(r.sessionId) ?? []), r]);
  const paysBySession = new Map<string, Payment[]>();
  for (const p of payments) paysBySession.set(p.sessionId, [...(paysBySession.get(p.sessionId) ?? []), p]);
  const stateOf = (x: Table) => deriveTableState(bySession.get(x.currentSessionId) ?? [], paidCents(paysBySession.get(x.currentSessionId) ?? []));
  const open = tables.find((x) => x.id === selected);

  return (
    <section class="page">
      <div class="board-head">
        <h1 class="section-label">{t('tables.overview')}</h1>
        <a class="link-button" href="#/tables-admin">{t('tables.manage')}</a>
      </div>
      <div class="overview">
        <div class="status-grid">
          {tables.map((x) => {
            const s = stateOf(x);
            return (
              <button class={`status-tile status-${s.status}${x.id === selected ? ' selected' : ''}`} onClick={() => setSelected(x.id === selected ? null : x.id)}>
                <span class="tile-name">{x.name}</span>
                <span class="tile-status">{t(statusKey(s.status))}</span>
                {s.totalCents > 0 && <span class="tile-due">{formatCents(s.dueCents)}</span>}
              </button>
            );
          })}
        </div>
        {open && (
          <TableDetail
            table={open}
            state={stateOf(open)}
            rounds={bySession.get(open.currentSessionId) ?? []}
            payments={paysBySession.get(open.currentSessionId) ?? []}
            freeTables={tables.filter((x) => x.id !== open.id && stateOf(x).status === 'free')}
            user={user}
            onMoved={(to) => setSelected(to)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </section>
  );
}

function TableDetail(props: {
  table: Table & { id: string }; state: TableState; rounds: Round[]; payments: Payment[];
  freeTables: (Table & { id: string })[]; user: StaffUser; onMoved: (tableId: string) => void; onClose: () => void;
}) {
  const { table, state, rounds, payments, user, onClose } = props;
  return (
    <aside class="table-detail">
      <header class="row-head">
        <h2 class="title">{table.name} <span class={`flag status-text-${state.status}`}>{t(statusKey(state.status))}</span></h2>
        <button class="link" onClick={onClose}>{t('tables.close')}</button>
      </header>
      <p class="totals">
        {t('tables.total')} <strong>{formatCents(state.totalCents)}</strong> · {t('pay.paid')} <strong>{formatCents(state.paidCents)}</strong> ·{' '}
        {t('tables.due')} <strong>{formatCents(state.dueCents)}</strong>
      </p>
      {state.status !== 'free' && <MoveTable from={table} freeTables={props.freeTables} onMoved={props.onMoved} />}
      {(state.totalCents > 0 || payments.length > 0) && <PaymentsPanel table={table} state={state} rounds={rounds} payments={payments} user={user} />}
      {rounds.length === 0 && <p class="desc">{t('tables.noRounds')}</p>}
      {rounds.map((r) => (
        <div class={`detail-round round-${r.status}`}>
          <div class="row-head">
            <span class="detail-round-meta">
              {clock(r.createdAtMs)} · {r.createdByName} · {t(roundKey(r))}
            </span>
            <span class="line-price">{formatCents(roundTotal(r))}</span>
          </div>
          <RoundLines round={r} prices />
          {r.status === 'preparing' && <button class="primary serve" onClick={() => serveRound(r, user.displayName)}>{t('board.served')}</button>}
        </div>
      ))}
    </aside>
  );
}

/** Guests change table: their open bill moves to a free table (server-checked, online only). */
function MoveTable({ from, freeTables, onMoved }: { from: Table & { id: string }; freeTables: (Table & { id: string })[]; onMoved: (id: string) => void }) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (freeTables.length === 0) return <p class="field-hint">{t('move.none')}</p>;
  const target = freeTables.find((x) => x.id === to) ?? freeTables[0];
  return (
    <div class="move-table">
      <label class="field">
        <span class="field-label">{t('move.label')}</span>
        <select value={target.id} onChange={(e) => setTo((e.target as HTMLSelectElement).value)}>
          {freeTables.map((x) => <option value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <button
        class="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await moveTable(from.id, target.id);
            onMoved(target.id);
          } catch (err) {
            setError(errorKey(err) ? t(errorKey(err)!) : (err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('move.button')}
      </button>
      {error && <p class="error">{error}</p>}
    </div>
  );
}
