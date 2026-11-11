import { useState } from 'preact/hooks';

/** Chart colours: validated on the #111008 surface (dataviz validator, dark mode). */
export const SERIES = { primary: '#a8853c', secondary: '#5c8fd6' } as const;

/**
 * Vertical bars for a time series: thin bars with a 2 px gap, rounded tops, a recessive baseline,
 * a few axis labels, and a tooltip on hover or keyboard focus.
 */
export function BarChart(props: { values: number[]; labels: string[]; format: (v: number) => string; ariaLabel: string; labelEvery?: number }) {
  const { values, labels, format } = props;
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 180;
  const top = 12;
  const max = Math.max(1, ...values);
  const slot = W / values.length;
  // Thin marks: with few buckets (a week, a year) a bar takes about half its slot.
  const bar = Math.max(2, values.length > 24 ? slot - 2 : Math.min(slot - 2, slot * 0.5));
  const every = props.labelEvery ?? Math.ceil(values.length / 12);
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={props.ariaLabel} preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H} y2={H} class="chart-axis" />
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 2 : 0, ((H - top) * Math.max(0, v)) / max);
          return (
            <g
              key={i}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <rect x={i * slot} y={top} width={slot} height={H - top} fill="transparent" />
              <path d={roundedTop(i * slot + (slot - bar) / 2, H - h, bar, h)} fill={SERIES.primary} opacity={hover === null || hover === i ? 1 : 0.55} />
              {i % every === 0 && (
                <text x={i * slot + slot / 2} y={H + 16} class="chart-label" text-anchor="middle">{labels[i]}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div class="chart-tip" style={{ left: `${((hover + 0.5) / values.length) * 100}%` }}>
          <span class="chart-tip-label">{labels[hover]}</span> {format(values[hover])}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Ranked horizontal bars with the value written beside each (no legend needed: one series). */
export function RankedBars(props: { rows: { label: string; value: number; detail?: string }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...props.rows.map((r) => r.value));
  return (
    <ul class="ranked">
      {props.rows.map((r) => (
        <li>
          <span class="ranked-label">{r.label}</span>
          <span class="ranked-track">
            <span class="ranked-bar" style={{ width: `${(100 * r.value) / max}%`, background: SERIES.primary }} />
          </span>
          <span class="ranked-value">
            {props.format(r.value)}
            {r.detail && <span class="ranked-detail"> · {r.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Two-part split (cash / card) as one stacked bar, with a legend and direct labels. */
export function SplitBar(props: { parts: { label: string; value: number }[]; format: (v: number) => string }) {
  const total = props.parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const colours = [SERIES.primary, SERIES.secondary];
  return (
    <div class="split">
      <div class="split-bar" role="img" aria-label={props.parts.map((p) => `${p.label} ${props.format(p.value)}`).join(', ')}>
        {total > 0 &&
          props.parts.map((p, i) => (
            <span style={{ width: `${(100 * Math.max(0, p.value)) / total}%`, background: colours[i] }} />
          ))}
      </div>
      <ul class="legend">
        {props.parts.map((p, i) => (
          <li>
            <span class="swatch" style={{ background: colours[i] }} />
            {p.label} <strong>{props.format(p.value)}</strong>
            {total > 0 && <span class="ranked-detail"> · {Math.round((100 * Math.max(0, p.value)) / total)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
