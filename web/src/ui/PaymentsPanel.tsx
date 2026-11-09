import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { fill } from '../i18n/format';
import type { Table } from '../data/catalog';
import { addPayment, closeTable, reversePayment } from '../data/payments';
import { checkAmount, isReversed, type Payment, type PaymentMethod } from '../domain/payments';
import type { Round, TableState } from '../domain/rounds';
import { centsToInput, formatCents, parsePriceInput } from '../lib/money';
import { clock } from '../lib/time';
import type { StaffUser } from '../session';
import { ErrorText, Field } from './Fields';
import { Summary } from './Summary';

/** Payments of a table's current session: record, reverse, summary, close. */
export function PaymentsPanel(props: { table: Table & { id: string }; state: TableState; rounds: Round[]; payments: Payment[]; user: StaffUser }) {
  const { table, state, rounds, payments, user } = props;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const overpaid = state.paidCents - state.totalCents;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function record(e: Event) {
    e.preventDefault();
    const cents = parsePriceInput(amount || centsToInput(state.dueCents));
    if (cents === null) return setError(t('pay.invalid'));
    const problem = checkAmount(cents, state.dueCents);
    if (problem === 'notPositive') return setError(t('pay.notPositive'));
    if (problem === 'moreThanDue') return setError(fill(t('pay.moreThanDue'), { due: formatCents(state.dueCents) }));
    run(async () => {
      await addPayment(table, cents, method, user.displayName);
      setAmount('');
    });
  }

  function reverse(p: Payment) {
    const reason = prompt(t('pay.reasonPrompt'))?.trim();
    if (reason) run(() => reversePayment(p, reason.slice(0, 200), user.displayName));
  }

  return (
    <div class="payments">
      <h3 class="section-label">{t('pay.title')}</h3>
      {payments.length === 0 && <p class="desc">{t('pay.none')}</p>}
      {payments.map((p) => (
        <p class={`payment-row${isReversed(p, payments) ? ' is-reversed' : ''}`}>
          <span>
            {clock(p.createdAtMs)} ·{' '}
            {p.reversalOf ? fill(t('pay.reversal'), { reason: p.reason ?? '' }) : t(p.method === 'card' ? 'pay.card' : 'pay.cash')} · {p.createdByName}
          </span>
          <span class="line-price">{formatCents(p.amountCents)}</span>
          {!p.reversalOf && !isReversed(p, payments) && <button class="link danger" disabled={busy} onClick={() => reverse(p)}>{t('pay.reverse')}</button>}
          {isReversed(p, payments) && <span class="badge">{t('pay.reversed')}</span>}
        </p>
      ))}
      {overpaid > 0 && <p class="error">{fill(t('pay.overpaid'), { amount: formatCents(overpaid) })}</p>}
      {state.dueCents > 0 && (
        <form class="pay-form" onSubmit={record}>
          <Field label={t('pay.amount')} value={amount} onInput={setAmount} hint={formatCents(state.dueCents)} />
          <span class="method-toggle" role="radiogroup">
            {(['cash', 'card'] as const).map((m) => (
              <button type="button" role="radio" aria-checked={method === m} class={`tab-btn${method === m ? ' active' : ''}`} onClick={() => setMethod(m)}>
                {t(m === 'cash' ? 'pay.cash' : 'pay.card')}
              </button>
            ))}
          </span>
          <button class="primary" disabled={busy}>
            {fill(t('pay.record'), { amount: formatCents(parsePriceInput(amount) ?? state.dueCents) })}
          </button>
        </form>
      )}
      <ErrorText text={error} />
      <span class="buttons">
        <button class="link" onClick={() => setShowSummary(true)} disabled={state.totalCents === 0}>{t('summary.button')}</button>
        {state.status === 'paid' ? (
          <button
            class="primary"
            disabled={busy}
            onClick={() => confirm(fill(t('close.confirm'), { name: table.name })) && run(() => closeTable(table, rounds, payments, user.displayName))}
          >
            {t('close.button')}
          </button>
        ) : (
          state.totalCents > 0 && <span class="field-hint">{t('close.onlyPaid')}</span>
        )}
      </span>
      {showSummary && <Summary tableName={table.name} rounds={rounds} payments={payments} onClose={() => setShowSummary(false)} />}
    </div>
  );
}
