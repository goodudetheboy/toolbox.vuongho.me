// Cumulative bonus money over time, as a step line (bonuses land on single
// days). Like a portfolio chart: the caller shows the hovered value as its hero
// number; this draws the line, the crosshair and the dot.
import { useEffect, useRef, useState } from 'react';

export interface PayoutPoint {
  date: string;
  amount: number;
  label: string;
}

const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 864e5;

function geometry(points: PayoutPoint[], start: string, w: number, h: number, padT: number, padB: number) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const cum: number[] = [];
  sorted.reduce((t, p, i) => (cum[i] = t + p.amount), 0);
  const total = cum[cum.length - 1] || 1;
  const d0 = dayNum(start);
  const d1 = Math.max(dayNum(sorted[sorted.length - 1]?.date ?? start), d0 + 1);
  const pad = 6;
  const x = (iso: string) => pad + ((dayNum(iso) - d0) / (d1 - d0)) * (w - pad * 2);
  const y = (v: number) => h - padB - (v / total) * (h - padT - padB);
  let line = `M${pad},${y(0)}`;
  sorted.forEach((p, i) => {
    line += ` H${x(p.date).toFixed(1)} V${y(cum[i]).toFixed(1)}`;
  });
  const area = `${line} V${y(0)} H${pad} Z`;
  return { sorted, cum, x, y, line, area };
}

export function PayoutChart({ points, start, active, onActive, height = 190 }: {
  points: PayoutPoint[];
  start: string;
  active: number | null;
  onActive: (i: number | null) => void;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!points.length) return null;
  const padB = 4;
  const { sorted, cum, x, y, line, area } = geometry(points, start, w, height, 14, padB);

  const nearest = (px: number) => {
    let best = 0;
    sorted.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(sorted[best].date) - px)) best = i;
    });
    return best;
  };

  return (
    <div
      ref={ref}
      className="chart"
      tabIndex={0}
      role="img"
      aria-label={`Bonuses add up to ${cum[cum.length - 1]} dollars by ${sorted[sorted.length - 1].date}. Use the arrow keys to step through payouts.`}
      onPointerMove={(e) => onActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
      onPointerLeave={() => onActive(null)}
      onBlur={() => onActive(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const cur = active ?? (e.key === 'ArrowRight' ? -1 : sorted.length);
        onActive(Math.min(sorted.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1))));
      }}
    >
      <svg width={w} height={height} aria-hidden="true">
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="chart-base" />
        <path d={area} className="chart-area" />
        <path d={line} className="chart-line" />
        {active != null && sorted[active] && (
          <>
            <line x1={x(sorted[active].date)} x2={x(sorted[active].date)} y1={0} y2={height - padB} className="chart-cross" />
            <circle cx={x(sorted[active].date)} cy={y(cum[active])} r={5} className="chart-dot" />
          </>
        )}
        {active == null && <circle cx={x(sorted[sorted.length - 1].date)} cy={y(cum[cum.length - 1])} r={5} className="chart-dot" />}
      </svg>
    </div>
  );
}

/** Running totals in date order, for the hero readout. */
export function cumulative(points: PayoutPoint[]) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let t = 0;
  return sorted.map((p) => ({ ...p, total: (t += p.amount) }));
}

/** Tiny, non-interactive version for list rows. */
export function Sparkline({ points, start, width = 72, height = 28 }: { points: PayoutPoint[]; start: string; width?: number; height?: number }) {
  if (!points.length) return null;
  const { line } = geometry(points, start, width, height, 3, 3);
  return (
    <svg className="spark" width={width} height={height} aria-hidden="true">
      <path d={line} className="chart-line thin" />
    </svg>
  );
}
