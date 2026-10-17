// "Is it worth it?" — deterministic, explainable numbers per deal. Everything here
// is shown to the user next to the verdict, so keep it simple enough to check by hand.
import type { Deal, FeeWaiver } from './types';
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

/**
 * How a deal's monthly fee gets handled while the account is open:
 * 'none' (no fee, or every fee month is free or covered by the bonus's own
 * parked cash), 'free' (eStatements, one deposit a month...), 'tx' (card
 * purchases each month), 'dd' (route a monthly direct deposit), 'bal' (keep a
 * balance there: costs the interest you'd earn elsewhere) or 'pay'.
 */
export type FeeHow = 'none' | 'free' | 'tx' | 'dd' | 'bal' | 'pay';

export interface FeePlan {
  how: FeeHow;
  monthly: number;
  /** Months the fee applies unless waived (after free months and months the bonus's parked cash already covers). */
  months: number;
  /** First month (counted from opening, 0-based) the fee applies. */
  fromMonth: number;
  /** dd: deposits a month; bal: balance to keep. */
  amount: number | null;
  /** tx / free: what to do. */
  text: string | null;
  /** One-time fee (membership...). */
  once: number;
  /** What it costs, counted in net value: fees paid, interest forgone on a kept balance, one-time fees. */
  cost: number;
  /** 'dd': fee months the plan's paychecks couldn't cover (paid instead, included in cost). */
  missed?: number;
}

const FEE_ORDER: Record<FeeHow, number> = { none: 0, free: 1, tx: 2, dd: 3, bal: 4, pay: 5 };

/** Roughly how long an account stays open: the keep-open time, or until the bonus posts if that's later. */
export function openDaysOf(d: Deal): number {
  const dd = d.dd.required ? d.dd.windowDays ?? (d.dd.monthly && d.dd.months ? d.dd.months * 30 + 30 : ASSUMED.ddWindowDays) : 0;
  const hold = d.balance ? d.balance.holdDays ?? ASSUMED.holdDays : 0;
  return Math.max(keepOpenDays(d), Math.max(dd, hold) + (d.payoutDays ?? ASSUMED.payoutDays));
}

/**
 * Every way to handle the deal's monthly fee, cheapest first (ties: least
 * hassle first). `openDays` is how long the account stays open (default:
 * openDaysOf). Unchecked deals only know the parsed fee: an unavoidable one
 * is paid, an avoidable one is assumed waived somehow.
 */
export function feePlans(d: Deal, baselineApy: number, openDays = openDaysOf(d)): FeePlan[] {
  const monthsOpen = Math.ceil(openDays / 30);
  const base = { monthly: 0, months: 0, fromMonth: 0, amount: null, text: null, once: 0, cost: 0 };
  const fee = d.fee;
  if (!fee) {
    const m = d.monthlyFee.amount ?? 0;
    if (m > 0 && d.monthlyFee.avoidable === false) {
      return [{ ...base, how: 'pay', monthly: m, months: monthsOpen, cost: Math.round(m * monthsOpen) }];
    }
    return [{ ...base, how: 'none' }];
  }
  const once = fee.once?.amount ?? 0;
  // Months the bonus's own parked cash already keeps the fee waived.
  const covered = d.balance && fee.waivers.some((w) => w.kind === 'bal' && w.amount <= d.balance!.amount)
    ? Math.floor((d.balance.holdDays ?? ASSUMED.holdDays) / 30) : 0;
  const fromMonth = Math.max(fee.freeMonths, covered);
  const months = Math.max(0, monthsOpen - fromMonth);
  const freeText = fee.waivers.find((w) => w.kind === 'free') as Extract<FeeWaiver, { kind: 'free' }> | undefined;
  if (fee.monthly <= 0 || months === 0) {
    return [{ ...base, how: freeText ? 'free' : 'none', text: freeText?.how ?? null, once, cost: once }];
  }
  const at = { ...base, monthly: fee.monthly, months, fromMonth, once };
  const plans: FeePlan[] = fee.waivers.map((w): FeePlan => {
    switch (w.kind) {
      case 'free': return { ...at, how: 'free', text: w.how, cost: once };
      case 'tx': return { ...at, how: 'tx', text: w.how, cost: once };
      case 'dd': return { ...at, how: 'dd', amount: w.amount, cost: once };
      case 'bal': return { ...at, how: 'bal', amount: w.amount, cost: once + Math.round(w.amount * baselineApy * (months * 30) / 365) };
    }
  });
  plans.push({ ...at, how: 'pay', cost: once + Math.round(fee.monthly * months) });
  return plans.sort((a, b) => a.cost - b.cost || FEE_ORDER[a.how] - FEE_ORDER[b.how] || (a.amount ?? 0) - (b.amount ?? 0));
}

/** One line on how the fee is handled, e.g. "$15/month fee: keep $500+ a month in direct deposits going". */
export function feeLine(p: FeePlan): string | null {
  const fee = `${usd(p.monthly)}/month fee`;
  const line = ((): string | null => {
    switch (p.how) {
      case 'none': return null;
      case 'free': return p.monthly ? `${fee}: ${lower(p.text!)} to avoid it` : p.text ? `${p.text} (avoids a fee)` : null;
      case 'tx': return `${fee}: ${lower(p.text!)} to avoid it`;
      case 'dd': return `${fee}, waived in any month ${usd(p.amount!)}+ in direct deposits lands there`;
      case 'bal': return `${fee}: keep ${usd(p.amount!)} in the account to avoid it`;
      case 'pay': return `${fee} for ${p.months} ${p.months === 1 ? 'month' : 'months'}: cheaper to pay (${usd(p.monthly * p.months)}, counted)`;
    }
  })();
  // A plan's paychecks couldn't fit the waiver deposit some months (split limit): those fees are paid.
  const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`;
  const missed = p.missed
    ? `in ${months(p.missed)} your paychecks are already split as many ways as you allow, so the plan expects you to pay it then (${usd(p.missed * p.monthly)}, counted)`
    : null;
  const once = p.once ? `${usd(p.once)} one-time fee (counted)` : null;
  return [line, missed, once].filter(Boolean).join('; ') || null;
}
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface Value {
  bonus: number;
  /** What parking the required balance costs you vs. leaving it in savings. */
  capitalCost: number;
  /** What the account's fees cost you while it's open: monthly fees paid, interest on a balance kept to waive them, one-time fees. */
  feeCost: number;
  /** How the monthly fee is handled. */
  fee: FeePlan;
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

/**
 * Every bonus level of a deal as a deal of its own (top first), with that
 * level's bonus, requirements and fee; just [d] when there's one level.
 */
export function levelsOf(d: Deal): Deal[] {
  if (!d.tiers || d.tiers.length < 2) return [d];
  return d.tiers.map((t, i) => ({
    ...d, tier: i, bonusMax: t.bonus, bonusMin: t.bonus, bonusHow: t.how,
    dd: t.dd, balance: t.balance, transactions: t.transactions, extras: t.extras, fee: t.fee,
  }));
}

/** One level of a deal (a saved account's), or the deal itself when it has no levels. */
export function levelOf(d: Deal, tier: number | null | undefined): Deal {
  return tier == null ? d : levelsOf(d)[tier] ?? d;
}

/** The level that nets the most (ties: the bigger bonus), out of the ones `ok` allows (all, if none is). */
export function bestLevel(d: Deal, baselineApy: number, ok: (l: Deal) => boolean = () => true): Deal {
  const all = levelsOf(d);
  if (all.length === 1) return d;
  const pool = all.filter(ok).length ? all.filter(ok) : all;
  const net = (l: Deal) => valueOf(l, baselineApy).net;
  return pool.reduce((b, l) => (net(l) > net(b) || (net(l) === net(b) && (l.bonusMax ?? 0) > (b.bonusMax ?? 0)) ? l : b));
}

/** Money a deal pays only after a year or more (not counted anywhere). */
export const laterTotal = (d: Deal) => (d.later ?? []).reduce((t, l) => t + l.amount, 0);

export function valueOf(d: Deal, baselineApy: number, fee: FeePlan = feePlans(d, baselineApy)[0]): Value {
  const bonus = d.bonusPostMax ?? d.bonusMax ?? 0;
  let capitalCost = 0;
  let effectiveApy: number | null = null;
  if (d.balance) {
    const days = d.balance.holdDays ?? ASSUMED.holdDays;
    capitalCost = Math.round(d.balance.amount * baselineApy * (days / 365));
    effectiveApy = d.balance.amount > 0 ? (bonus / d.balance.amount) * (365 / days) : null;
  }
  const feeCost = fee.cost;
  const net = bonus - capitalCost - feeCost;

  const effortNotes: string[] = [];
  if (d.dd.required) effortNotes.push('direct deposit');
  if (d.balance) effortNotes.push('park cash');
  if (d.transactions) effortNotes.push(`${d.transactions} transactions`);
  if (d.inBranch) effortNotes.push('in branch');
  if (d.pull === 'hard') effortNotes.push('hard pull');
  if (d.chexSensitive) effortNotes.push('ChexSystems sensitive');
  const dodge = fee.how === 'tx' || fee.how === 'dd' || (fee.how === 'free' && fee.monthly > 0);
  if (dodge) effortNotes.push('fee to dodge');
  const effort =
    (d.dd.required ? 1 : 0) + (d.balance ? 1 : 0) +
    (d.transactions ? (d.transactions >= 15 ? 2 : 1) : 0) +
    (d.inBranch ? 2 : 0) + (d.pull === 'hard' ? 2 : 0) + (d.chexSensitive ? 1 : 0) +
    (dodge ? 1 : 0);

  const verdict: Verdict = net >= 300 ? 'great' : net >= 150 ? 'good' : net >= 75 ? 'ok' : 'skip';
  return { bonus, capitalCost, feeCost, fee, net, effectiveApy, effort, effortNotes, verdict };
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
/** Everything a deal asks for, one short line each (a strategy's Requirements tab), plus how the plan handles its fee. */
export function requirementLines(d: Deal, plan?: FeePlan): string[] {
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
  const feeText = plan && feeLine(plan);
  if (feeText) out.push(feeText.charAt(0).toUpperCase() + feeText.slice(1));
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
