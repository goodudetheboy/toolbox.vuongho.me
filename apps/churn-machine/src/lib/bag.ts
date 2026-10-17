// The plan page's account-and-money views, derived from a saved strategy's
// accounts: the next paycheck's split, cash parked right now, where each
// account stands, and the plan rebuilt in the Plan tab's shape. Pure.
import type { Account, AccountStatus, SavedStrategy } from './accounts';
import type { Deal } from './types';
import type { Paycheck, PlanItem, Strategy } from './planner';
import type { PlanSettings } from './revise';
import { byDate, stateOf, tasksForAccount, type Task } from './tasks';
import { feePlans, levelOf, valueOf } from './value';
import { daysBetween } from './dates';

const STAGE: Record<AccountStatus, number> = { planned: 0, open: 1, met: 2, paid: 3, closed: 4 };

/** The dollar amount behind a deposit task (bonus or fee-waiver). */
const depositAmount = (t: Task) =>
  (t.kind === 'dd' ? t.account.deposits : t.account.upkeep ?? []).filter((d) => d.date === t.date).reduce((s, d) => s + d.amount, 0);

export interface PaycheckSplit {
  date: string;
  routes: { accountId: string; bank: string; amount: number; upkeep: boolean }[];
  /** What's left for your main account. */
  toMain: number;
}

/** The next payday with something to route, and where the money goes. */
export function nextPaycheck(accounts: Account[], today: string, paycheck: number): PaycheckSplit | null {
  const deps = accounts.flatMap((a) => tasksForAccount(a, today))
    .filter((t) => (t.kind === 'dd' || t.kind === 'upkeep') && !t.done && t.date >= today);
  if (!deps.length) return null;
  const date = deps.map((t) => t.date).sort()[0];
  const routes = deps.filter((t) => t.date === date).sort(byDate)
    .map((t) => ({ accountId: t.account.id, bank: t.account.bank, amount: depositAmount(t), upkeep: t.kind === 'upkeep' }));
  return { date, routes, toMain: Math.max(0, paycheck - routes.reduce((s, r) => s + r.amount, 0)) };
}

export interface Parked {
  accountId: string;
  bank: string;
  amount: number;
  /** For the bonus, or to keep the monthly fee waived. */
  why: 'bonus' | 'fee';
  /** in: there now · free: the hold is over, move it out · later: not moved in yet. */
  state: 'in' | 'free' | 'later';
  from: string;
  until: string;
}

/** Cash a plan keeps in its accounts: there now, ready to come out, or still to move in. */
export function parkedCash(accounts: Account[], today: string): Parked[] {
  const out: Parked[] = [];
  for (const a of accounts) {
    if (a.status === 'closed') continue;
    const done = a.done ?? {};
    if (a.park && !done.unpark) {
      const isIn = STAGE[a.status] >= 2 || !!done.park;
      out.push({
        accountId: a.id, bank: a.bank, amount: a.park.amount, why: 'bonus',
        state: !isIn ? 'later' : a.park.until <= today ? 'free' : 'in',
        from: a.openedOn ?? a.openOn ?? today, until: a.park.until,
      });
    }
    if (a.feePark && a.feePark.until > today) {
      out.push({
        accountId: a.id, bank: a.bank, amount: a.feePark.amount, why: 'fee',
        state: done.feepark ? 'in' : 'later', from: a.feePark.from, until: a.feePark.until,
      });
    }
  }
  const order = { free: 0, in: 1, later: 2 };
  return out.sort((x, y) => order[x.state] - order[y.state] || (x.state === 'later' ? x.from.localeCompare(y.from) : x.until.localeCompare(y.until)));
}

export type Stage = 'todo' | 'working' | 'waiting' | 'keep' | 'close' | 'done';
export const STAGE_LABELS: Record<Stage, string> = {
  todo: 'Not opened', working: 'Working on it', waiting: 'Waiting on bonus', keep: 'Bonus in', close: 'Can close', done: 'Done',
};

export interface AccountCard {
  account: Account;
  stage: Stage;
  tasks: Task[];
  /** The next thing not done (yours or the bank's), overdue ones first. */
  next: Task | null;
  /** Missed things you had to do. */
  overdue: number;
  /** Bonus direct deposits: how many landed, of how much. */
  dd: { done: number; total: number; doneAmount: number; totalAmount: number } | null;
}

function stageOf(a: Account, today: string): Stage {
  switch (a.status) {
    case 'planned': return 'todo';
    case 'open': return 'working';
    case 'met': return 'waiting';
    case 'paid': return a.closeAfter && a.closeAfter > today ? 'keep' : 'close';
    case 'closed': return 'done';
  }
}

const RANK: Record<Stage, number> = { working: 0, todo: 1, waiting: 2, keep: 3, close: 4, done: 5 };

/** One card per account, the ones that need you first. */
export function accountCards(accounts: Account[], today: string): AccountCard[] {
  return accounts.map((a): AccountCard => {
    const tasks = tasksForAccount(a, today).sort(byDate);
    const dds = tasks.filter((t) => t.kind === 'dd');
    return {
      account: a,
      stage: stageOf(a, today),
      tasks,
      next: tasks.find((t) => !t.done && !t.optional) ?? null,
      overdue: tasks.filter((t) => t.action && stateOf(t, today) === 'overdue').length,
      dd: dds.length ? {
        done: dds.filter((t) => t.done).length,
        total: dds.length,
        doneAmount: dds.filter((t) => t.done).reduce((s, t) => s + depositAmount(t), 0),
        totalAmount: dds.reduce((s, t) => s + depositAmount(t), 0),
      } : null,
    };
  }).sort((x, y) => (y.overdue > 0 ? 1 : 0) - (x.overdue > 0 ? 1 : 0) || RANK[x.stage] - RANK[y.stage]
    || (x.next?.date ?? '9999').localeCompare(y.next?.date ?? '9999'));
}

/** The plan's next step: the earliest thing you have to do, else the earliest thing to wait for. */
export function nextStepOf(accounts: Account[], today: string): Task | null {
  const open = accounts.flatMap((a) => tasksForAccount(a, today)).filter((t) => !t.done && !t.optional).sort(byDate);
  return open.find((t) => t.action) ?? open[0] ?? null;
}

/**
 * The saved plan, as it stands now (revisions included), in the shape the
 * Plan tab shows. Accounts whose deal is gone from the data are left out.
 */
export function savedAsStrategy(s: SavedStrategy, set: PlanSettings, accounts: Account[], deals: Deal[], today: string): Strategy {
  const apy = set.baselineApy;
  const items = accounts.flatMap((a): PlanItem[] => {
    const found = deals.find((d) => d.id === a.dealId);
    if (!found) return [];
    const deal = levelOf(found, a.tier);
    const plans = feePlans(deal, apy);
    const fee = (a.fee && plans.find((p) => p.how === a.fee!.how && (p.amount ?? null) === (a.fee!.amount ?? null)))
      ?? plans.find((p) => p.how === (a.fee?.how ?? 'none')) ?? plans[0];
    const v = valueOf(deal, apy, fee);
    const bonus = a.status === 'paid' || a.status === 'closed' ? a.bonusReceived ?? a.bonus : a.bonus;
    const opened = a.openedOn ?? a.openOn ?? today;
    return [{
      deal,
      value: { ...v, bonus, net: v.net + bonus - v.bonus },
      openOn: opened,
      deposits: a.deposits,
      park: a.park ? { amount: a.park.amount, from: opened, until: a.park.until } : null,
      transactionsBy: a.transactionsBy ?? null,
      doneBy: a.metOn ?? a.doneBy ?? opened,
      expectedPayout: a.paidOn ?? a.expectedPayout ?? opened,
      closeAfter: a.closedOn ?? a.closeAfter ?? opened,
      assumed: [],
      upkeep: a.upkeep ?? [],
      feePark: a.feePark ?? null,
    }];
  }).sort((x, y) => x.openOn.localeCompare(y.openOn));

  const byDay = new Map<string, Paycheck['splits']>();
  for (const i of items) {
    for (const d of i.deposits) (byDay.get(d.date) ?? byDay.set(d.date, []).get(d.date)!).push({ dealId: i.deal.id, bank: i.deal.bank, amount: d.amount });
    for (const d of i.upkeep) (byDay.get(d.date) ?? byDay.set(d.date, []).get(d.date)!).push({ dealId: i.deal.id, bank: i.deal.bank, amount: d.amount, upkeep: true });
  }
  const paychecks = [...byDay].sort(([x], [y]) => x.localeCompare(y)).map(([date, splits]) => ({
    date, splits, toMain: Math.max(0, set.inputs.paycheck - splits.reduce((t, x) => t + x.amount, 0)),
  }));

  // Most cash parked on any day: check each day a park starts.
  const holds = items.flatMap((i) => [i.park, i.feePark].filter((p): p is NonNullable<typeof p> => !!p));
  const peakParked = Math.max(0, ...holds.map((h) => holds.filter((o) => o.from <= h.from && h.from < o.until).reduce((t, o) => t + o.amount, 0)));
  const opens = items.map((i) => i.openOn).sort();
  const perYear = Math.max(0, ...opens.map((d, n) => opens.slice(n).filter((o) => daysBetween(d, o) < 365).length));
  const payouts = items.map((i) => i.expectedPayout).sort();

  return {
    id: s.planId ?? s.id,
    objective: set.objective,
    pace: set.pace,
    name: s.name,
    items,
    paychecks,
    totals: {
      bonus: items.reduce((t, i) => t + i.value.bonus, 0),
      net: items.reduce((t, i) => t + i.value.net, 0),
      accounts: items.length,
      peakParked,
      effort: items.reduce((t, i) => t + i.value.effort, 0),
      perYear,
      firstPayout: payouts[0] ?? null,
      lastPayout: payouts.at(-1) ?? null,
    },
  };
}
