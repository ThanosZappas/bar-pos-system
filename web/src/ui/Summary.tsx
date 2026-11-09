import { t } from '../i18n';
import { fill } from '../i18n/format';
import { useSettings } from '../data/payments';
import { paidCents, summaryLines, type Payment } from '../domain/payments';
import { deriveTableState, type Round } from '../domain/rounds';
import { formatCents } from '../lib/money';
import { dateTime } from '../lib/time';

/** The printable, clearly non-fiscal summary of a table's current session. */
export function Summary({ tableName, rounds, payments, onClose }: { tableName: string; rounds: Round[]; payments: Payment[]; onClose: () => void }) {
  const settings = useSettings();
  const lines = summaryLines(rounds);
  const state = deriveTableState(rounds, paidCents(payments));
  return (
    <div class="modal" role="dialog" aria-modal="true">
      <div class="summary print-area">
        <p class="not-fiscal">{t('summary.notFiscal')}</p>
        <h2 class="summary-bar">{settings.barName}</h2>
        {settings.address && <p class="summary-meta">{settings.address}</p>}
        {settings.phone && <p class="summary-meta">{settings.phone}</p>}
        <p class="summary-meta">{fill(t('summary.table'), { name: tableName })} · {dateTime(Date.now())}</p>
        <table class="summary-lines">
          <tbody>
            {lines.map((l) => (
              <tr>
                <td>{l.qty}×</td>
                <td>{l.name}</td>
                <td class="num">{formatCents(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="summary-total">{t('summary.total')} <span>{formatCents(state.totalCents)}</span></p>
        {payments.map((p) => (
          <p class="summary-payment">
            {p.reversalOf ? fill(t('pay.reversal'), { reason: p.reason ?? '' }) : t(p.method === 'card' ? 'pay.card' : 'pay.cash')}
            <span>{formatCents(p.amountCents)}</span>
          </p>
        ))}
        <p class="summary-total">{t('summary.due')} <span>{formatCents(state.dueCents)}</span></p>
        {settings.receiptFooter && <p class="summary-meta">{settings.receiptFooter}</p>}
        <p class="not-fiscal">{t('summary.notFiscal')}</p>
      </div>
      <div class="modal-actions no-print">
        <button class="primary" onClick={() => window.print()}>{t('summary.print')}</button>
        <button class="link" onClick={onClose}>{t('tables.close')}</button>
      </div>
    </div>
  );
}
