import { t } from '../i18n';
import { fill } from '../i18n/format';
import type { Round } from '../domain/rounds';
import { formatCents } from '../lib/money';

/** Lines of a round; cancelled lines are struck through. `prices` adds the line totals. */
export function RoundLines({ round, prices = false }: { round: Round; prices?: boolean }) {
  return (
    <>
      <ul class="round-lines">
        {round.lines.map((l) => (
          <li class={l.cancelled || round.status === 'cancelled' ? 'struck' : ''}>
            <span class="qty">{l.qty}×</span>
            <span class="line-name">
              {l.name}
              {l.note && <span class="line-note">{fill(t('board.lineNote'), { note: l.note })}</span>}
            </span>
            {prices && <span class="line-price">{formatCents(l.priceCents * l.qty)}</span>}
          </li>
        ))}
      </ul>
      {round.note && <p class="order-note">{fill(t('board.orderNote'), { note: round.note })}</p>}
    </>
  );
}
