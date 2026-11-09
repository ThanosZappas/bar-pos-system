import { t } from '../i18n';
import { fill } from '../i18n/format';
import { useTodayPayments } from '../data/payments';
import { formatCents } from '../lib/money';
import { clock } from '../lib/time';

/** Today's payments, newest first, with cash and card totals for counting the drawer. */
export function PaymentsPage() {
  const payments = useTodayPayments();
  if (!payments) return <section class="page"><p class="desc">{t('app.loading')}</p></section>;
  const sum = (m?: 'cash' | 'card') => payments.filter((p) => !m || p.method === m).reduce((s, p) => s + p.amountCents, 0);
  return (
    <section class="page">
      <h1 class="section-label">{t('pay.title')} · {t('pay.today')}</h1>
      <p class="totals">{fill(t('pay.todayTotals'), { cash: formatCents(sum('cash')), card: formatCents(sum('card')), total: formatCents(sum()) })}</p>
      {payments.length === 0 ? (
        <p class="desc">{t('pay.none')}</p>
      ) : (
        <table class="list">
          <thead>
            <tr><th>{t('pay.time')}</th><th>{t('pay.table')}</th><th>{t('pay.method')}</th><th>{t('pay.by')}</th><th class="num">{t('pay.amount')}</th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr class={p.reversalOf ? 'inactive' : ''}>
                <td>{clock(p.createdAtMs)}</td>
                <td>{p.tableName}</td>
                <td>{p.reversalOf ? fill(t('pay.reversal'), { reason: p.reason ?? '' }) : t(p.method === 'card' ? 'pay.card' : 'pay.cash')}</td>
                <td>{p.createdByName}</td>
                <td class="num">{formatCents(p.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
