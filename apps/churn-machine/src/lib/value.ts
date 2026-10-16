// "Is it worth it?" — deterministic, explainable numbers per deal. Everything here
// is shown to the user next to the verdict, so keep it simple enough to check by hand.
import type { Deal } from './types';
import { daysBetween } from './dates';

/** Defaults when the post doesn't say. Surfaced in the UI as "assumed". */
export const ASSUMED = {
  holdDays: 90,
  ddWindowDays: 90,
  payoutDays: 60,
  keepOpenDays: 180,
} as const;

export type Status = 'active' | 'ending-soon' | 'no-date' | 'date-passed' | 'ended';

export function dealStatus(d: Deal, today: string): Status {
  if (d.ended) return 'ended';
  if (!d.expires) return 'no-date';
  if (d.expires < today) return 'date-passed';
  return daysBetween(today, d.expires) <= 14 ? 'ending-soon' : 'active';
}

export type Verdict = 'great' | 'good' | 'ok' | 'skip';

export interface Value {
  bonus: number;
  /** What parking the required balance costs you vs. leaving it in savings. */
  capitalCost: number;
  /** Monthly fees you can't avoid, over the months the account stays open. */
  feeCost: number;
  net: number;
  /** Annualized return of the bonus on the parked balance, when there is one. */
  effectiveApy: number | null;
  effort: number;
  effortNotes: string[];
  verdict: Verdict;
}

export function keepOpenDays(d: Deal): number {
  return d.eatf.days ?? ASSUMED.keepOpenDays;
}

/** Money a deal pays only after a year or more (not counted anywhere). */
export const laterTotal = (d: Deal) => (d.later ?? []).reduce((t, l) => t + l.amount, 0);

export function valueOf(d: Deal, baselineApy: number): Value {
  const bonus = d.bonusPostMax ?? d.bonusMax ?? 0;
  let capitalCost = 0;
  let effectiveApy: number | null = null;
  if (d.balance) {
    const days = d.balance.holdDays ?? ASSUMED.holdDays;
    capitalCost = Math.round(d.balance.amount * baselineApy * (days / 365));
    effectiveApy = d.balance.amount > 0 ? (bonus / d.balance.amount) * (365 / days) : null;
  }
  const feeCost = d.monthlyFee.avoidable === false && d.monthlyFee.amount
    ? Math.round(d.monthlyFee.amount * Math.ceil(keepOpenDays(d) / 30))
    : 0;
  const net = bonus - capitalCost - feeCost;

  const effortNotes: string[] = [];
  if (d.dd.required) effortNotes.push('direct deposit');
  if (d.balance) effortNotes.push('park cash');
  if (d.transactions) effortNotes.push(`${d.transactions} transactions`);
  if (d.inBranch) effortNotes.push('in branch');
  if (d.pull === 'hard') effortNotes.push('hard pull');
  if (d.chexSensitive) effortNotes.push('ChexSystems sensitive');
  if (d.monthlyFee.amount && d.monthlyFee.avoidable) effortNotes.push('fee to dodge');
  const effort =
    (d.dd.required ? 1 : 0) + (d.balance ? 1 : 0) +
    (d.transactions ? (d.transactions >= 15 ? 2 : 1) : 0) +
    (d.inBranch ? 2 : 0) + (d.pull === 'hard' ? 2 : 0) + (d.chexSensitive ? 1 : 0) +
    (d.monthlyFee.amount && d.monthlyFee.avoidable ? 1 : 0);

  const verdict: Verdict = net >= 300 ? 'great' : net >= 150 ? 'good' : net >= 75 ? 'ok' : 'skip';
  return { bonus, capitalCost, feeCost, net, effectiveApy, effort, effortNotes, verdict };
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export function usd(n: number): string {
  return money.format(n);
}

export function compactUsd(n: number): string {
  if (n >= 1000 && n % 1000 === 0) return `$${n / 1000}k`;
  if (n >= 10000) return `$${Math.round(n / 1000)}k`;
  return usd(n);
}

/** One short line saying what you have to do. */
/** Everything a deal asks for, one short line each (a strategy's Requirements tab). */
export function requirementLines(d: Deal): string[] {
  const out: string[] = [];
  if (d.dd.required) {
    const amt = d.dd.amount ? `${usd(d.dd.amount)} in direct deposits` : 'A direct deposit (any amount)';
    const n = d.dd.minDeposits && d.dd.minDeposits > 1 ? `, at least ${d.dd.minDeposits} deposits` : '';
    const win = d.dd.monthly && d.dd.months ? ` every month for ${d.dd.months} months` : d.dd.windowDays ? ` within ${d.dd.windowDays} days` : '';
    out.push(amt + win + n);
  }
  if (d.balance) out.push(`Park ${usd(d.balance.amount)}${d.balance.holdDays ? ` for ${d.balance.holdDays} days` : ''}`);
  if (d.termsChecked && d.extras?.length) out.push(...d.extras);
  else if (d.transactions) out.push(`${d.transactions} transactions (check the post for what counts)`);
  if (d.promoCode) out.push(`Promo code ${d.promoCode}`);
  if (d.inBranch) out.push('Open in a branch');
  if (d.pull === 'hard') out.push('Hard credit pull');
  const fee = d.eatf.fee ? ` (${usd(d.eatf.fee)} fee if closed sooner)` : d.eatf.forfeit ? ' (bonus taken back if closed sooner)' : '';
  out.push(`Keep open ${keepOpenDays(d)} days${d.eatf.days == null ? ' (assumed)' : ''}${fee}`);
  return out;
}

export function requirementSummary(d: Deal): string {
  const parts: string[] = [];
  if (d.dd.required) {
    const amt = d.dd.amount ? `${compactUsd(d.dd.amount)} DD` : 'Any DD';
    const win = d.dd.monthly && d.dd.months ? ` over ${d.dd.months} mo` : d.dd.windowDays ? ` in ${d.dd.windowDays}d` : '';
    parts.push(amt + win);
  } else if (d.dd.required === false) {
    parts.push('No DD');
  }
  if (d.balance) {
    parts.push(`park ${compactUsd(d.balance.amount)}${d.balance.holdDays ? ` for ${d.balance.holdDays}d` : ''}`);
  }
  if (d.transactions) parts.push(`${d.transactions} transactions`);
  return parts.join(' · ') || 'See post';
}
