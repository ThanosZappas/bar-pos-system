import { t } from '../i18n';
import { fill } from '../i18n/format';
import { useState } from 'preact/hooks';
import { useSessionPayments, useTodayPayments, useTodaySessions, type ClosedSession } from '../data/payments';
import { useSessionRounds } from '../data/rounds';
import { summaryLines } from '../domain/payments';
import { formatCents } from '../lib/money';
import { clock } from '../lib/time';

/** Today's payments with cash and card totals for counting the drawer, and today's closed bills. */
export function PaymentsPage() {
  const payments = useTodayPayments();
  const sessions = useTodaySessions();
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
      <h2 class="section-label spaced">{t('closed.title')}</h2>
      {sessions?.length === 0 && <p class="desc">{t('closed.none')}</p>}
      {sessions?.map((x) => <ClosedBill session={x} />)}
    </section>
  );
}

function ClosedBill({ session }: { session: ClosedSession }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="closed-bill">
      <p class="payment-row">
        <span>{fill(t('closed.row'), { time: clock(session.closedAtMs), name: session.tableName, rounds: String(session.roundCount), by: session.closedByName })}</span>
        <span class="line-price">{formatCents(session.totalCents)}</span>
        <button class="link" onClick={() => setOpen(!open)}>{t(open ? 'closed.hide' : 'closed.show')}</button>
      </p>
      {open && <ClosedBillDetail sessionId={session.id} />}
    </div>
  );
}

/** Loaded only when opened: the bill's lines and payments. */
function ClosedBillDetail({ sessionId }: { sessionId: string }) {
  const rounds = useSessionRounds([sessionId]);
  const payments = useSessionPayments([sessionId]);
  if (!rounds || !payments) return <p class="desc">{t('app.loading')}</p>;
  return (
    <div class="closed-detail">
      {summaryLines(rounds).map((l) => (
        <p class="payment-row"><span>{l.qty}× {l.name}</span><span class="line-price">{formatCents(l.totalCents)}</span></p>
      ))}
      {payments.map((p) => (
        <p class="payment-row">
          <span>{clock(p.createdAtMs)} · {p.reversalOf ? fill(t('pay.reversal'), { reason: p.reason ?? '' }) : t(p.method === 'card' ? 'pay.card' : 'pay.cash')} · {p.createdByName}</span>
          <span class="line-price">{formatCents(p.amountCents)}</span>
        </p>
      ))}
    </div>
  );
}
