// Turns a paycheck (1st and 15th, or every 2 weeks) + a time window into concrete churning schedules:
// which account to open when, how to split each paycheck, when the bonus should
// land and when it's safe to close. Fully deterministic — same inputs, same plan.
//
// How: walk the paydays in order; at each one, try the candidate deals in the
// strategy's rank order and keep a deal only if re-simulating the *whole* timeline
// with it still completes every chosen deal on time (earliest deadline gets the
// paycheck first, at most `maxSplits` accounts per paycheck, parked cash never
// exceeds what you have). See docs/adr/0002-planner-greedy-with-full-resimulation.md.
import type { Deal } from './types';
import { addDays, daysBetween, maxIso } from './dates';
import { ASSUMED, dealStatus, keepOpenDays, valueOf, type Value } from './value';
import { availableIn, bankKey, isBusiness } from './filters';

export interface PlanInputs {
  /** Take-home pay per paycheck. */
  paycheck: number;
  /** When you're paid: the 1st and 15th, or every 14 days from `firstPayday`. */
  payFreq: PayFreq;
  firstPayday: string;
  /** Plan length; requirements must be finished inside it (payouts may land after). */
  months: number;
  state: string | null;
  /** Cash you can park for savings/balance bonuses (0 = DD-only plans). */
  cash: number;
  /** Most accounts one paycheck can be split across (most payroll allows 2–3). */
  maxSplits: number;
  /** Open an account this many days before the first paycheck it should catch. */
  leadDays: number;
  minBonus: number;
  noHardPull: boolean;
  noChexSensitive: boolean;
  online: boolean;
  business: boolean;
  /** Also plan deals whose listed end date has passed but DoC still lists. */
  includeDatePassed: boolean;
  /** Banks to skip (already have / had an account). Compared case-insensitively. */
  excludeBanks: string[];
}

export type Objective = 'money' | 'big' | 'easy' | 'fast';
export const OBJECTIVES: Record<Objective, { label: string; hint: string }> = {
  money: { label: 'Most money', hint: 'Highest net value first' },
  big: { label: 'Big ones only', hint: 'Only deals worth $300+ net, fewer accounts' },
  easy: { label: 'Least effort', hint: 'Simple requirements first, no branch visits or hard pulls' },
  fast: { label: 'Money soonest', hint: 'Shortest time from opening to payout first' },
};
export const PACES = [1, 2, 3] as const;
export type Pace = (typeof PACES)[number];
export const PACE_LABELS: Record<Pace, string> = { 1: 'Relaxed', 2: 'Steady', 3: 'Aggressive' };

/** "Any amount" direct deposits get this much routed, so they show up in the split. */
export const ANY_DD_AMOUNT = 100;

export interface Requirement {
  need: number;
  months: number | null;
  minDeposits: number;
  windowDays: number;
  balance: number;
  holdDays: number;
  assumed: string[];
}

export function requirementOf(d: Deal): Requirement {
  const assumed: string[] = [];
  const dd = d.dd.required === true;
  const months = dd && d.dd.monthly && d.dd.months ? d.dd.months : null;
  const need = dd ? (d.dd.amount && d.dd.amount > 0 ? d.dd.amount : ANY_DD_AMOUNT) : 0;
  let windowDays = d.dd.windowDays ?? (months ? months * 30 + 30 : null);
  if (windowDays == null) {
    windowDays = ASSUMED.ddWindowDays;
    if (dd || d.transactions) assumed.push(`${ASSUMED.ddWindowDays}-day window`);
  }
  if (dd && d.dd.amount === 0) assumed.push(`any DD amount (planned $${ANY_DD_AMOUNT})`);
  let holdDays = 0;
  if (d.balance) {
    holdDays = d.balance.holdDays ?? ASSUMED.holdDays;
    if (d.balance.holdDays == null) assumed.push(`${ASSUMED.holdDays}-day balance hold`);
  }
  if (!dd && !d.balance && !d.transactions) assumed.push('no DD, balance or transaction requirement found; check the post');
  if (d.payoutDays == null) assumed.push(`payout ~${ASSUMED.payoutDays} days after`);
  if (d.eatf.days == null) assumed.push(`keep open ${ASSUMED.keepOpenDays} days`);
  return {
    need,
    months,
    minDeposits: dd ? Math.max(d.dd.minDeposits ?? 1, months ?? 1) : 0,
    windowDays,
    balance: d.balance?.amount ?? 0,
    holdDays,
    assumed,
  };
}

interface Selection {
  deal: Deal;
  req: Requirement;
  open: string;
  /** An on-track opened account: these exact deposits, nothing re-planned. */
  fixed?: PlannedDeposit[];
}

export interface PlannedDeposit {
  date: string;
  amount: number;
}

export interface PlanItem {
  deal: Deal;
  value: Value;
  openOn: string;
  deposits: PlannedDeposit[];
  park: { amount: number; from: string; until: string } | null;
  transactionsBy: string | null;
  /** When every requirement should be met. */
  doneBy: string;
  expectedPayout: string;
  closeAfter: string;
  assumed: string[];
}

export interface Paycheck {
  date: string;
  splits: { dealId: string; bank: string; amount: number }[];
  toMain: number;
}

export interface Strategy {
  id: string;
  objective: Objective;
  pace: Pace;
  name: string;
  items: PlanItem[];
  paychecks: Paycheck[];
  totals: {
    bonus: number;
    net: number;
    accounts: number;
    peakParked: number;
    effort: number;
    firstPayout: string | null;
    lastPayout: string | null;
  };
}

interface SimResult {
  ok: boolean;
  /** Deals that missed a deadline. */
  failed: Set<string>;
  deposits: Map<string, PlannedDeposit[]>;
  doneBy: Map<string, string>;
  paychecks: Paycheck[];
}

export type PayFreq = 'semimonthly' | 'biweekly';
export const PAY_FREQ_LABELS: Record<PayFreq, string> = { semimonthly: '1st and 15th', biweekly: 'Every 2 weeks' };
/** "on the 1st and 15th" / "every 2 weeks", for sentences. */
export const payWhen = (f: PayFreq) => (f === 'biweekly' ? 'every 2 weeks' : 'on the 1st and 15th');

/** The first 1st or 15th on or after `iso`. */
function semimonthlyOnOrAfter(iso: string): string {
  const day = Number(iso.slice(8, 10));
  if (day === 1 || day === 15) return iso;
  if (day < 15) return `${iso.slice(0, 8)}15`;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** The payday after payday `iso`. */
export function nextPayday(iso: string, freq: PayFreq): string {
  return freq === 'biweekly' ? addDays(iso, 14) : semimonthlyOnOrAfter(addDays(iso, 1));
}

/** A payday in the past moves forward to the first payday on or after `today`. */
export function rollPayday(payday: string, today: string, freq: PayFreq): string {
  if (freq === 'semimonthly') return semimonthlyOnOrAfter(maxIso(payday, today));
  let d = payday;
  while (d < today) d = addDays(d, 14);
  return d;
}

/** Whether `iso` is one of your paydays (`anchor` is any known payday). */
export function isPayday(iso: string, anchor: string, freq: PayFreq): boolean {
  if (freq === 'semimonthly') return iso.endsWith('-01') || iso.endsWith('-15');
  return ((daysBetween(anchor, iso) % 14) + 14) % 14 === 0;
}

export function paydays(first: string, end: string, freq: PayFreq): string[] {
  const out: string[] = [];
  for (let d = first; d <= end; d = nextPayday(d, freq)) out.push(d);
  return out;
}

/**
 * Plays the selected deals forward over the paydays. Each paycheck goes to the
 * accounts with the earliest deadline first (at most `maxSplits` of them); the rest
 * goes to your main account. `ok` is false if any deal misses a deadline.
 */
function simulate(sel: Selection[], pays: string[], inputs: PlanInputs, tolerate: Set<string> = new Set()): SimResult {
  const state = sel.map((s) => ({
    s,
    remaining: s.req.need,
    deposits: [] as PlannedDeposit[],
    bucketGot: s.req.months ? new Array(s.req.months).fill(0) : null,
    done: s.fixed ? s.fixed.at(-1)?.date ?? s.open : s.req.need === 0 ? s.open : null as string | null,
    failed: false,
  }));
  const paychecks: Paycheck[] = [];

  for (const p of pays) {
    let avail = inputs.paycheck;
    const splits: Paycheck['splits'] = [];
    // Reserved deposits of on-track accounts come off the paycheck first.
    for (const x of state) {
      for (const d of x.s.fixed ?? []) {
        if (d.date !== p) continue;
        const give = Math.min(d.amount, avail);
        avail -= give;
        x.deposits.push({ date: p, amount: give });
        splits.push({ dealId: x.s.deal.id, bank: x.s.deal.bank, amount: give });
      }
    }
    const wants = state
      .filter((x) => !x.done && !x.failed && p >= addDays(x.s.open, inputs.leadDays) && p <= addDays(x.s.open, x.s.req.windowDays))
      .map((x) => {
        const r = x.s.req;
        if (x.bucketGot) {
          const bucket = Math.floor(daysBetween(x.s.open, p) / 30);
          const perMonth = Math.ceil(r.need / (r.months ?? 1));
          const want = bucket < x.bucketGot.length ? Math.max(0, perMonth - x.bucketGot[bucket]) : 0;
          return { x, want, bucket, deadline: addDays(x.s.open, (bucket + 1) * 30) };
        }
        // With a minimum number of deposits, keep each one at least need/minDeposits
        // (some banks want "two deposits of $500 each") and spread the rest.
        const perDeposit = Math.ceil(r.need / r.minDeposits);
        const depositsLeft = Math.max(0, r.minDeposits - x.deposits.length);
        const remaining = Math.max(0, x.remaining);
        const want = depositsLeft > 0 ? Math.max(Math.ceil(remaining / depositsLeft), perDeposit) : remaining;
        return { x, want, bucket: -1, deadline: addDays(x.s.open, r.windowDays) };
      })
      .filter((w) => w.want > 0)
      .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.x.s.deal.rank - b.x.s.deal.rank)
      .slice(0, Math.max(0, inputs.maxSplits - splits.length));

    for (const w of wants) {
      const give = Math.min(w.want, avail);
      if (give <= 0) break;
      avail -= give;
      w.x.deposits.push({ date: p, amount: give });
      w.x.remaining -= give;
      if (w.x.bucketGot && w.bucket >= 0) w.x.bucketGot[w.bucket] += give;
      splits.push({ dealId: w.x.s.deal.id, bank: w.x.s.deal.bank, amount: give });
    }

    for (const x of state) {
      if (x.done || x.failed) continue;
      const r = x.s.req;
      const met = x.bucketGot
        ? x.bucketGot.every((g) => g >= Math.ceil(r.need / (r.months ?? 1)))
        : x.remaining <= 0 && x.deposits.length >= r.minDeposits;
      if (met) x.done = p;
      else if (nextPayday(p, inputs.payFreq) > addDays(x.s.open, r.windowDays)) x.failed = true; // no payday left in the window
      else if (x.bucketGot) {
        // A month that's over without its deposit can't be made up.
        const nextBucket = Math.floor(daysBetween(x.s.open, nextPayday(p, inputs.payFreq)) / 30);
        const perMonth = Math.ceil(r.need / (r.months ?? 1));
        for (let b = 0; b < Math.min(nextBucket, x.bucketGot.length); b++) if (x.bucketGot[b] < perMonth) x.failed = true;
      }
    }
    paychecks.push({ date: p, splits, toMain: avail });
  }

  const ok = state.every((x) => (x.done && !x.failed) || tolerate.has(x.s.deal.id));
  return {
    ok,
    failed: new Set(state.filter((x) => !x.done || x.failed).map((x) => x.s.deal.id)),
    deposits: new Map(state.map((x) => [x.s.deal.id, x.deposits])),
    doneBy: new Map(state.map((x) => [x.s.deal.id, x.done ?? x.s.open])),
    paychecks,
  };
}

function parkedOk(sel: Selection[], cash: number): boolean {
  const spans = sel.filter((s) => s.req.balance > 0).map((s) => [s.open, addDays(s.open, s.req.holdDays), s.req.balance] as const);
  for (const [start] of spans) {
    const total = spans.filter(([a, b]) => a <= start && start < b).reduce((t, [, , amt]) => t + amt, 0);
    if (total > cash) return false;
  }
  return true;
}

export function candidates(deals: Deal[], inputs: PlanInputs, today: string, baselineApy: number) {
  const excluded = new Set(inputs.excludeBanks.map(bankKey));
  return deals
    .filter((d) => {
      const st = dealStatus(d, today);
      if (st === 'ended' || (st === 'date-passed' && !inputs.includeDatePassed)) return false;
      // Can't plan what we couldn't read.
      if (!d.hasGlance || d.dd.required == null) return false;
      if (!availableIn(d, inputs.state)) return false;
      if (inputs.noHardPull && d.pull === 'hard') return false;
      if (inputs.noChexSensitive && d.chexSensitive) return false;
      if (inputs.online && d.inBranch) return false;
      if (!inputs.business && isBusiness(d)) return false;
      if ((d.bonusMax ?? 0) < Math.max(1, inputs.minBonus)) return false;
      if (excluded.has(bankKey(d.bank))) return false;
      const req = requirementOf(d);
      if (req.balance > inputs.cash) return false;
      if (req.need > 0 && inputs.paycheck <= 0) return false;
      return true;
    })
    .map((deal) => ({ deal, req: requirementOf(deal), value: valueOf(deal, baselineApy) }))
    .filter((c) => c.value.net > 0);
}

type Candidate = ReturnType<typeof candidates>[number];

function rankFor(objective: Objective, cands: Candidate[], paycheck: number, freq: PayFreq): Candidate[] {
  const gap = freq === 'biweekly' ? 14 : 15; // days between paychecks, roughly
  const timeToPay = (c: Candidate) => {
    const ddDays = c.req.need > 0 ? Math.min(c.req.windowDays, Math.ceil(c.req.need / Math.max(paycheck, 1)) * gap + gap) : 0;
    return Math.max(ddDays, c.req.holdDays) + (c.deal.payoutDays ?? ASSUMED.payoutDays);
  };
  const tie = (a: Candidate, b: Candidate) => b.value.net - a.value.net || a.deal.rank - b.deal.rank;
  switch (objective) {
    case 'money': return [...cands].sort(tie);
    case 'big': return cands.filter((c) => c.value.net >= 300).sort(tie);
    case 'easy': return cands
      .filter((c) => !c.deal.inBranch && c.deal.pull !== 'hard' && c.value.effort <= 3)
      .sort((a, b) => a.value.effort - b.value.effort || tie(a, b));
    case 'fast': return [...cands].sort((a, b) => timeToPay(a) - timeToPay(b) || tie(a, b));
  }
}

export function buildStrategy(
  deals: Deal[], inputs: PlanInputs, objective: Objective, pace: Pace, today: string, baselineApy: number,
): Strategy {
  return planCore(deals, inputs, objective, pace, today, baselineApy, addDays(today, Math.round(inputs.months * 30.4)), []).strategy;
}

/**
 * An account you already opened, as the re-planner sees it: what it still
 * needs from your paychecks (the deposits you haven't made) and any cash
 * still parked in it.
 */
export interface Committed {
  dealId: string;
  bank: string;
  openedOn: string;
  /** Deadline for the remaining deposits. */
  ddDeadline: string;
  /** On track (nothing missed): keep exactly these upcoming deposits. */
  fixedDeposits?: PlannedDeposit[];
  remainingNeed: number;
  remainingDeposits: number;
  park: { amount: number; until: string } | null;
}

export interface Revision {
  /** New picks for everything not opened yet. */
  strategy: Strategy;
  /** Fresh future deposit schedule for each committed account. */
  committedDeposits: Map<string, PlannedDeposit[]>;
  committedDoneBy: Map<string, string>;
  /** Committed accounts whose remaining deposits can't fit before their deadline. */
  atRisk: Set<string>;
}

/**
 * Re-plans the rest of a strategy from today: keeps the accounts you already
 * opened (rescheduling their missed deposits onto upcoming paychecks) and
 * re-picks everything not opened yet around them, same objective and pace.
 */
export function revisePlan(
  deals: Deal[], inputs: PlanInputs, objective: Objective, pace: Pace, today: string, baselineApy: number,
  endsOn: string, committed: Committed[],
): Revision {
  const fixed: Selection[] = committed.map((c) => ({
    deal: { id: c.dealId, bank: c.bank, rank: -1 } as Deal,
    open: c.openedOn,
    fixed: c.fixedDeposits,
    req: {
      need: c.fixedDeposits ? 0 : c.remainingNeed,
      months: null,
      minDeposits: !c.fixedDeposits && c.remainingNeed > 0 ? Math.max(1, c.remainingDeposits) : 0,
      windowDays: Math.max(0, daysBetween(c.openedOn, c.ddDeadline)),
      balance: c.park && c.park.until > today ? c.park.amount : 0,
      holdDays: c.park && c.park.until > today ? daysBetween(c.openedOn, c.park.until) : 0,
      assumed: [],
    },
  }));
  const end = [endsOn, ...committed.map((c) => c.ddDeadline)].sort().at(-1)!;
  const { strategy, sim, atRisk } = planCore(deals, inputs, objective, pace, today, baselineApy, end, fixed);
  const ids = new Set(committed.map((c) => c.dealId));
  return {
    strategy,
    committedDeposits: new Map([...sim.deposits].filter(([id]) => ids.has(id))),
    committedDoneBy: new Map([...sim.doneBy].filter(([id]) => ids.has(id))),
    atRisk,
  };
}

function planCore(
  deals: Deal[], inputs: PlanInputs, objective: Objective, pace: Pace, today: string, baselineApy: number,
  end: string, fixed: Selection[],
): { strategy: Strategy; sim: SimResult; atRisk: Set<string> } {
  const pays = paydays(inputs.firstPayday, end, inputs.payFreq);
  const ranked = rankFor(objective, candidates(deals, inputs, today, baselineApy), inputs.paycheck, inputs.payFreq);
  // Already-opened accounts stay in every simulation. Any that can't be met
  // even on their own are "at risk": scheduled best-effort, never blocking picks.
  const atRisk = fixed.length ? simulate(fixed, pays, inputs).failed : new Set<string>();
  const sel: Selection[] = [...fixed];
  const usedBanks = new Set<string>(fixed.map((f) => bankKey(f.deal.bank)));
  const openedPerMonth = new Map<string, number>();
  for (const f of fixed) openedPerMonth.set(f.open.slice(0, 7), (openedPerMonth.get(f.open.slice(0, 7)) ?? 0) + 1);

  // Opening slots: a week (leadDays) before each payday, plus today for deals
  // that don't need a paycheck at all.
  const slots = [...new Set([today, ...pays.map((p) => maxIso(today, addDays(p, -inputs.leadDays)))])].sort();
  for (const open of slots) {
    for (const c of ranked) {
      const month = open.slice(0, 7);
      if ((openedPerMonth.get(month) ?? 0) >= pace) break;
      if (usedBanks.has(bankKey(c.deal.bank)) || sel.some((s) => s.deal.id === c.deal.id)) continue;
      if (c.deal.expires && dealStatus(c.deal, today) !== 'date-passed' && open > c.deal.expires) continue;
      const finish = addDays(open, Math.max(c.req.need > 0 || c.deal.transactions ? c.req.windowDays : 0, c.req.holdDays));
      if (finish > end) continue;
      const trial = [...sel, { deal: c.deal, req: c.req, open }];
      if (!parkedOk(trial, inputs.cash)) continue;
      if (c.req.need > 0 && !simulate(trial, pays, inputs, atRisk).ok) continue;
      sel.push(trial[trial.length - 1]);
      usedBanks.add(bankKey(c.deal.bank));
      openedPerMonth.set(month, (openedPerMonth.get(month) ?? 0) + 1);
    }
  }

  const sim = simulate(sel, pays, inputs, atRisk);
  const fixedIds = new Set(fixed.map((f) => f.deal.id));
  const items: PlanItem[] = sel.filter((s) => !fixedIds.has(s.deal.id)).map((s) => {
    const value = valueOf(s.deal, baselineApy);
    const ddDone = s.req.need > 0 ? sim.doneBy.get(s.deal.id)! : s.open;
    const txBy = s.deal.transactions ? addDays(s.open, s.req.windowDays) : null;
    const parkUntil = s.req.balance > 0 ? addDays(s.open, s.req.holdDays) : null;
    const doneBy = [ddDone, txBy ?? s.open, parkUntil ?? s.open].sort().at(-1)!;
    const expectedPayout = addDays(doneBy, s.deal.payoutDays ?? ASSUMED.payoutDays);
    return {
      deal: s.deal,
      value,
      openOn: s.open,
      deposits: sim.deposits.get(s.deal.id) ?? [],
      park: parkUntil ? { amount: s.req.balance, from: s.open, until: parkUntil } : null,
      transactionsBy: txBy,
      doneBy,
      expectedPayout,
      closeAfter: maxIso(addDays(s.open, keepOpenDays(s.deal)), expectedPayout),
      assumed: s.req.assumed,
    };
  }).sort((a, b) => a.openOn.localeCompare(b.openOn) || a.deal.rank - b.deal.rank);

  const payouts = items.map((i) => i.expectedPayout).sort();
  const strategy: Strategy = {
    id: `${objective}-${pace}`,
    objective,
    pace,
    name: `${OBJECTIVES[objective].label} · ${PACE_LABELS[pace]}`,
    items,
    paychecks: sim.paychecks,
    totals: {
      bonus: items.reduce((t, i) => t + i.value.bonus, 0),
      net: items.reduce((t, i) => t + i.value.net, 0),
      accounts: items.length,
      peakParked: peakParked(sel.filter((s) => !fixedIds.has(s.deal.id))),
      effort: items.reduce((t, i) => t + i.value.effort, 0),
      firstPayout: payouts[0] ?? null,
      lastPayout: payouts.at(-1) ?? null,
    },
  };
  return { strategy, sim, atRisk };
}

function peakParked(sel: Selection[]): number {
  const spans = sel.filter((s) => s.req.balance > 0).map((s) => [s.open, addDays(s.open, s.req.holdDays), s.req.balance] as const);
  let peak = 0;
  for (const [start] of spans) {
    peak = Math.max(peak, spans.filter(([a, b]) => a <= start && start < b).reduce((t, [, , amt]) => t + amt, 0));
  }
  return peak;
}

/** Every objective × pace, with identical plans collapsed into one. */
export function buildStrategies(deals: Deal[], inputs: PlanInputs, today: string, baselineApy: number): Strategy[] {
  const out: Strategy[] = [];
  const seen = new Set<string>();
  for (const objective of Object.keys(OBJECTIVES) as Objective[]) {
    for (const pace of PACES) {
      const s = buildStrategy(deals, inputs, objective, pace, today, baselineApy);
      const sig = s.items.map((i) => `${i.deal.id}@${i.openOn}`).join('|');
      if (!s.items.length || seen.has(sig)) continue;
      seen.add(sig);
      out.push(s);
    }
  }
  return out;
}

export type StrategySort = 'bonus' | 'net' | 'accounts' | 'effort' | 'firstPayout' | 'peakParked';
export const STRATEGY_SORTS: Record<StrategySort, string> = {
  net: 'Most net value',
  bonus: 'Most bonus',
  accounts: 'Fewest accounts',
  effort: 'Least effort',
  firstPayout: 'First payout soonest',
  peakParked: 'Least cash parked',
};

export function sortStrategies(list: Strategy[], key: StrategySort): Strategy[] {
  const v = (s: Strategy): number => {
    switch (key) {
      case 'bonus': return -s.totals.bonus;
      case 'net': return -s.totals.net;
      case 'accounts': return s.totals.accounts;
      case 'effort': return s.totals.effort;
      case 'firstPayout': return s.totals.firstPayout ? Date.parse(s.totals.firstPayout) : Infinity;
      case 'peakParked': return s.totals.peakParked;
    }
  };
  return [...list].sort((a, b) => v(a) - v(b) || b.totals.net - a.totals.net);
}
