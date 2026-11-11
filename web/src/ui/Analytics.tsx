import { useEffect, useMemo, useState } from 'preact/hooks';
import { dateLocale, t, type Key } from '../i18n';
import { fill } from '../i18n/format';
import { useCatalog, type Category, type Item } from '../data/catalog';
import { loadPeriod, type PeriodData } from '../data/analytics';
import {
  analyze, bucketCount, change, DAY_START_HOUR, nightHourLabel, periodRange, PERIODS, shiftAnchor, type Period, type Range,
} from '../domain/analytics';
import { formatCents } from '../lib/money';
import { BarChart, RankedBars, SplitBar } from './Charts';

const TOP_ITEMS = 15;

/** Business analytics for the admin: per day, week, month or year, compared with the period before. */
export function Analytics() {
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [data, setData] = useState<PeriodData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const [reload, setReload] = useState(0);

  const range = useMemo(() => periodRange(period, anchor), [period, anchor]);
  const previous = useMemo(() => periodRange(period, shiftAnchor(period, anchor, -1)), [period, anchor]);
  const isCurrent = periodRange(period, new Date()).start.getTime() === range.start.getTime();

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    loadPeriod(range, previous)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [range.start.getTime(), reload]);

  // Item → category name, from today's menu.
  const items = useCatalog<Item>('menuItems');
  const categories = useCatalog<Category>('menuCategories');
  const categoryOf = useMemo(() => {
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const byItem = new Map((items ?? []).map((i) => [i.id, catName.get(i.categoryId)]));
    return (itemId: string) => byItem.get(itemId);
  }, [items, categories]);

  const report = data && analyze(period, range, data, categoryOf);
  // A period still running is compared with the same point of the previous one (Wednesday
  // evening vs last Wednesday evening), not with the whole previous period.
  const compareTo: Range = isCurrent
    ? { start: previous.start, end: new Date(previous.start.getTime() + (Date.now() - range.start.getTime())) }
    : previous;
  const before = data && analyze(period, compareTo, { rounds: [], payments: data.payments, bills: data.bills });
  const vsKey: Key = isCurrent ? 'analytics.vsSamePoint' : 'analytics.vsPrevious';

  return (
    <section class="page analytics">
      <div class="board-head">
        <h1 class="section-label">{t('analytics.title')}</h1>
        <span class="field-hint">{fill(t('analytics.dayNote'), { hour: String(DAY_START_HOUR).padStart(2, '0') })}</span>
      </div>

      <div class="analytics-controls">
        <div class="method-toggle" role="radiogroup" aria-label={t('analytics.period')}>
          {PERIODS.map((p) => (
            <button type="button" role="radio" aria-checked={p === period} class={`tab-btn${p === period ? ' active' : ''}`} onClick={() => setPeriod(p)}>
              {t(`analytics.${p}` as Key)}
            </button>
          ))}
        </div>
        <div class="period-nav">
          <button class="link" aria-label={t('analytics.previous')} onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}>‹</button>
          <span class="period-label">{periodLabel(period, range)}</span>
          <button class="link" aria-label={t('analytics.next')} disabled={isCurrent} onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}>›</button>
          {!isCurrent && <button class="link" onClick={() => setAnchor(new Date())}>{t('analytics.now')}</button>}
          <button class="link" onClick={() => setReload(reload + 1)}>{t('analytics.refresh')}</button>
        </div>
      </div>

      {error && <p class="error">{error}</p>}
      {!report && !error && <p class="desc">{t('app.loading')}</p>}
      {report && before && (
        <>
          <div class="tiles">
            <Tile label={t('analytics.income')} value={formatCents(report.incomeCents)} delta={change(report.incomeCents, before.incomeCents)} vsKey={vsKey} />
            <Tile label={t('analytics.billsClosed')} value={String(report.billsClosed)} delta={change(report.billsClosed, before.billsClosed)} vsKey={vsKey} />
            <Tile label={t('analytics.averageBill')} value={formatCents(report.averageBillCents)} delta={change(report.averageBillCents, before.averageBillCents)} vsKey={vsKey} />
            <Tile label={t('analytics.itemsSold')} value={String(report.itemsSold)} hint={fill(t('analytics.itemsPerBill'), { n: report.itemsPerBill.toFixed(1) })} />
            <Tile
              label={t('analytics.serveTime')}
              value={report.medianServeMinutes === null ? '–' : fill(t('analytics.minutes'), { n: String(Math.round(report.medianServeMinutes)) })}
              hint={t('analytics.serveTimeHint')}
            />
          </div>

          <div class="analytics-block">
            <h2 class="section-label">{t(`analytics.incomeBy.${period}` as Key)}</h2>
            <BarChart
              values={report.incomeByBucket}
              labels={bucketLabels(period, range)}
              format={formatCents}
              ariaLabel={t(`analytics.incomeBy.${period}` as Key)}
              labelEvery={period === 'day' ? 2 : period === 'month' ? 3 : 1}
            />
            <details class="table-view">
              <summary>{t('analytics.showTable')}</summary>
              <table class="list">
                <tbody>
                  {report.incomeByBucket.map((v, i) => (
                    <tr><td>{bucketLabels(period, range)[i]}</td><td class="num">{formatCents(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>

          <div class="analytics-grid">
            <div class="analytics-block">
              <h2 class="section-label">{t('analytics.cashCard')}</h2>
              <SplitBar parts={[{ label: t('pay.cash'), value: report.cashCents }, { label: t('pay.card'), value: report.cardCents }]} format={formatCents} />
              {report.reversalCount > 0 && <p class="field-hint">{fill(t('analytics.reversals'), { n: String(report.reversalCount) })}</p>}
            </div>
            <div class="analytics-block">
              <h2 class="section-label">{t('analytics.problems')}</h2>
              <p class="totals">{fill(t('analytics.cancelled'), { orders: String(report.cancelledOrders), items: String(report.cancelledItems), value: formatCents(report.cancelledValueCents) })}</p>
              <p class="totals">{fill(t('analytics.edited'), { n: String(report.editedOrders), total: String(report.ordersCount + report.cancelledOrders) })}</p>
            </div>
          </div>

          <div class="analytics-grid">
            <div class="analytics-block">
              <h2 class="section-label">{t('analytics.topItems')}</h2>
              {report.items.length === 0 ? <p class="desc">{t('analytics.noSales')}</p> : (
                <>
                  <RankedBars
                    rows={(showAllItems ? report.items : report.items.slice(0, TOP_ITEMS)).map((i) => ({ label: i.name, value: i.qty, detail: formatCents(i.revenueCents) }))}
                    format={(v) => `${v}×`}
                  />
                  {report.items.length > TOP_ITEMS && (
                    <button class="link" onClick={() => setShowAllItems(!showAllItems)}>
                      {showAllItems ? t('analytics.showTop') : fill(t('analytics.showAll'), { n: String(report.items.length) })}
                    </button>
                  )}
                </>
              )}
            </div>
            <div class="analytics-block">
              <h2 class="section-label">{t('analytics.byCategory')}</h2>
              {report.categories.length === 0 ? <p class="desc">{t('analytics.noSales')}</p> : (
                <RankedBars rows={report.categories.map((c) => ({ label: c.name === 'Other' ? t('analytics.other') : c.name, value: c.revenueCents, detail: `${c.qty}×` }))} format={formatCents} />
              )}
            </div>
          </div>

          <div class="analytics-grid">
            <div class="analytics-block">
              <h2 class="section-label">{t('analytics.busiestHours')}</h2>
              <BarChart values={report.ordersByHour} labels={report.ordersByHour.map((_, i) => nightHourLabel(i))} format={(v) => fill(t('analytics.orders'), { n: String(v) })} ariaLabel={t('analytics.busiestHours')} labelEvery={3} />
            </div>
            <div class="analytics-block">
              <h2 class="section-label">{t('analytics.staff')}</h2>
              {report.staff.length === 0 ? <p class="desc">{t('analytics.noSales')}</p> : (
                <table class="list">
                  <thead><tr><th>{t('analytics.staffName')}</th><th class="num">{t('analytics.staffOrders')}</th><th class="num">{t('analytics.staffItems')}</th><th class="num">{t('analytics.staffSales')}</th></tr></thead>
                  <tbody>
                    {report.staff.map((s) => (
                      <tr><td>{s.name}</td><td class="num">{s.orders}</td><td class="num">{s.items}</td><td class="num">{formatCents(s.revenueCents)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, delta, hint, vsKey }: { label: string; value: string; delta?: number | null; hint?: string; vsKey?: Key }) {
  return (
    <div class="tile">
      <span class="tile-label">{label}</span>
      <span class="tile-value">{value}</span>
      {delta !== undefined && (
        <span class={`tile-delta${delta === null ? '' : delta >= 0 ? ' up' : ' down'}`}>
          {delta === null ? t('analytics.noCompare') : fill(t(vsKey ?? 'analytics.vsPrevious'), { pct: `${delta > 0 ? '+' : ''}${delta}%` })}
        </span>
      )}
      {hint && <span class="tile-delta">{hint}</span>}
    </div>
  );
}

function periodLabel(period: Period, range: Range): string {
  const loc = dateLocale();
  const s = range.start;
  const lastDay = new Date(range.end.getTime() - 86_400_000);
  switch (period) {
    case 'day': return s.toLocaleDateString(loc, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    case 'week': return `${s.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' })} – ${lastDay.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    case 'month': return s.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
    case 'year': return String(s.getFullYear());
  }
}

function bucketLabels(period: Period, range: Range): string[] {
  const loc = dateLocale();
  const n = bucketCount(period, range);
  const s = range.start;
  return Array.from({ length: n }, (_, i) => {
    switch (period) {
      case 'day': return nightHourLabel(i);
      case 'week': return new Date(s.getFullYear(), s.getMonth(), s.getDate() + i).toLocaleDateString(loc, { weekday: 'short' });
      case 'month': return String(i + 1);
      case 'year': return new Date(s.getFullYear(), i, 1).toLocaleDateString(loc, { month: 'short' });
    }
  });
}
