// Strategy permalinks: /plan/<strategyId>?<inputs>. The planner is deterministic,
// so the inputs are enough to rebuild the same strategy anywhere (no database).
// It's rebuilt from that day's deals, so a link opened after the data refreshes
// can differ; `d` records which data the link was made from.
import type { PlanInputs } from './planner';
import { addDays } from './dates';

export interface PlanLink {
  inputs: PlanInputs;
  baselineApy: number;
  /** Date of the deals data the link was made from (YYYY-MM-DD). */
  dealsDate: string | null;
}

const FLAGS: [keyof PlanInputs, string][] = [
  ['noHardPull', 'hp'],
  ['online', 'on'],
  ['noChexSensitive', 'ch'],
  ['business', 'bz'],
  ['includeDatePassed', 'pd'],
];

export function encodePlanLink({ inputs, baselineApy, dealsDate }: PlanLink): string {
  const q = new URLSearchParams();
  q.set('pay', String(inputs.paycheck));
  q.set('from', inputs.firstPayday);
  q.set('mo', String(inputs.months));
  if (inputs.cash) q.set('cash', String(inputs.cash));
  q.set('split', String(inputs.maxSplits));
  q.set('lead', String(inputs.leadDays));
  q.set('min', String(inputs.minBonus));
  const flags = FLAGS.filter(([k]) => inputs[k]).map(([, f]) => f);
  if (flags.length) q.set('opt', flags.join('.'));
  if (inputs.state) q.set('st', inputs.state);
  if (inputs.excludeBanks.length) q.set('ex', inputs.excludeBanks.join('|'));
  q.set('apy', String(Math.round(baselineApy * 10000) / 100));
  if (dealsDate) q.set('d', dealsDate);
  return q.toString();
}

const num = (v: string | null, fallback: number, min = 0, max = 1e7) => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Null when the query string isn't a plan link at all. */
export function decodePlanLink(search: string, today: string): PlanLink | null {
  const q = new URLSearchParams(search);
  if (!q.has('pay')) return null;
  const opt = new Set((q.get('opt') ?? '').split('.'));
  let from = /^\d{4}-\d{2}-\d{2}$/.test(q.get('from') ?? '') ? q.get('from')! : today;
  // A link opened after its first payday rolls forward in 2-week steps, like saved inputs.
  while (from < today) from = addDays(from, 14);
  const inputs: PlanInputs = {
    paycheck: num(q.get('pay'), 2500),
    firstPayday: from,
    months: num(q.get('mo'), 6, 1, 24),
    cash: num(q.get('cash'), 0),
    maxSplits: num(q.get('split'), 3, 1, 6),
    leadDays: num(q.get('lead'), 7, 0, 60),
    minBonus: num(q.get('min'), 0),
    noHardPull: opt.has('hp'),
    online: opt.has('on'),
    noChexSensitive: opt.has('ch'),
    business: opt.has('bz'),
    includeDatePassed: opt.has('pd'),
    state: /^[A-Z]{2}$/.test(q.get('st') ?? '') ? q.get('st') : null,
    excludeBanks: (q.get('ex') ?? '').split('|').filter(Boolean),
  };
  return { inputs, baselineApy: num(q.get('apy'), 4, 0, 50) / 100, dealsDate: q.get('d') };
}
