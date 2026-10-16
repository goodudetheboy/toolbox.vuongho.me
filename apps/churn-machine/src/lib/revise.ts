// "Correct course" for a saved strategy: re-plan what's left from today
// (planner.revisePlan) and turn it into a preview plus the Firestore writes.
import type { Deal } from './types';
import { accountFromItem, type Account, type SavedStrategy } from './accounts';
import {
  isPayday, nextPayday, OBJECTIVES, planStartOn, PACE_LABELS, requirementOf, revisePlan, rollPayday, type Committed, type Objective, type Pace, type PlanInputs,
} from './planner';
import { addDays, maxIso, shortDate } from './dates';
import { ASSUMED } from './value';

export interface PlanSettings {
  inputs: PlanInputs;
  objective: Objective;
  pace: Pace;
  baselineApy: number;
  endsOn: string;
}

/** The settings a saved strategy was built with. Plans saved before tracking only kept a few. */
export function planSettings(s: SavedStrategy): PlanSettings {
  const [obj, pace] = (s.planId ?? '').split('-');
  const objective = (Object.keys(OBJECTIVES) as Objective[]).find((o) => o === obj || s.name.startsWith(OBJECTIVES[o].label)) ?? 'money';
  const p = Number(pace) || (Object.entries(PACE_LABELS).find(([, l]) => s.name.endsWith(l))?.[0] ?? 2);
  // Plans saved before the pay schedule setting were all every 2 weeks.
  const inputs: PlanInputs = s.inputs ? {
    ...s.inputs,
    payFreq: s.inputs.payFreq ?? 'biweekly',
    startOn: s.inputs.startOn ?? null,
    picks: s.inputs.picks ?? [],
  } : {
    paycheck: s.paycheck, payFreq: 'biweekly', firstPayday: s.firstPayday, months: s.months, state: null, cash: 0, maxSplits: 3,
    leadDays: 7, minBonus: 100, noHardPull: true, noChexSensitive: false, online: true, business: false,
    includeDatePassed: false, excludeBanks: [], startOn: null, picks: [],
  };
  return {
    inputs,
    objective,
    pace: Number(p) as Pace,
    baselineApy: s.baselineApy ?? 0.04,
    endsOn: s.endsOn ?? addDays(s.firstPayday, Math.round(s.months * 30.4)),
  };
}

export interface RevisionPreview {
  lines: { tone: 'good' | 'warn' | 'plain'; text: string }[];
  before: number;
  after: number;
  change: {
    update: { id: string; patch: Partial<Omit<Account, 'id'>> }[];
    remove: string[];
    add: Omit<Account, 'id'>[];
    totalBonus: number;
    accounts: number;
    revisions: { on: string; note: string }[];
    /** Set when the plan's settings were edited. */
    strategy?: Partial<SavedStrategy>;
  };
}

export const strategyName = (o: Objective, p: Pace) => `${OBJECTIVES[o].label} · ${PACE_LABELS[p]}`;

/** When the plan started counting its months (so editing the length keeps the start). */
export function planStart(set: PlanSettings): string {
  return addDays(set.endsOn, -Math.round(set.inputs.months * 30.4));
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/**
 * @param accounts this strategy's accounts
 * @param alsoExclude banks you have elsewhere (so the re-plan doesn't pick them)
 */
export function previewRevision(
  deals: Deal[], saved: SavedStrategy, accounts: Account[], today: string, alsoExclude: string[], edited?: PlanSettings,
): RevisionPreview {
  const set = edited ?? planSettings(saved);
  const name = strategyName(set.objective, set.pace);
  const freq = set.inputs.payFreq;
  // A plan that hasn't started yet is re-planned from its start date.
  const from = planStartOn(set.inputs, today);
  const payday = rollPayday(set.inputs.firstPayday, from, freq);
  const dealOf = (a: Account) => deals.find((d) => d.id === a.dealId) ?? null;
  const keyOf = (a: Account) => a.dealId ?? a.id;
  const onPayday = (iso: string) => isPayday(iso, payday, freq);

  const opened = accounts.filter((a) => a.status !== 'planned');
  const committed: Committed[] = opened.map((a) => {
    const deal = dealOf(a);
    const undone = a.status === 'open' ? a.deposits.filter((d) => !a.done?.[`dd:${d.date}`]) : [];
    const openedOn = a.openedOn ?? a.openOn ?? today;
    const window = deal ? requirementOf(deal).windowDays : null;
    const lastPlanned = a.deposits.at(-1)?.date;
    return {
      dealId: keyOf(a),
      bank: a.bank,
      openedOn,
      ddDeadline: window != null ? addDays(openedOn, window) : maxIso(a.doneBy ?? today, lastPlanned ? nextPayday(lastPlanned, freq) : today),
      remainingNeed: undone.reduce((t, d) => t + d.amount, 0),
      remainingDeposits: undone.length,
      // Nothing missed: keep its schedule exactly; only missed deposits get re-planned.
      // (Only while they still fall on paydays: a changed payday re-plans them too.)
      fixedDeposits: undone.every((d) => d.date >= today && onPayday(d.date)) ? undone : undefined,
      park: a.park,
      // Its fee-waiver deposits keep their paycheck splits.
      reserved: a.status !== 'closed' ? (a.upkeep ?? []).filter((d) => d.date >= today && onPayday(d.date)) : [],
    };
  });

  const inputs: PlanInputs = { ...set.inputs, firstPayday: payday, excludeBanks: [...set.inputs.excludeBanks, ...alsoExclude] };
  const r = revisePlan(deals, inputs, set.objective, set.pace, from, set.baselineApy, set.endsOn, committed);

  const lines: RevisionPreview['lines'] = [];
  const update: RevisionPreview['change']['update'] = [];
  const remove: string[] = [];
  const add: Omit<Account, 'id'>[] = [];

  // Accounts you opened: missed deposits move onto upcoming paychecks.
  for (const a of opened) {
    if (a.status !== 'open') continue;
    if (committed.find((c) => c.dealId === keyOf(a))?.fixedDeposits) continue; // on track: untouched
    const fresh = r.committedDeposits.get(keyOf(a)) ?? [];
    const kept = a.deposits.filter((d) => a.done?.[`dd:${d.date}`]);
    const deposits = [...kept, ...fresh].sort((x, y) => x.date.localeCompare(y.date));
    if (JSON.stringify(deposits) === JSON.stringify(a.deposits)) continue;
    const doneBy = maxIso(r.committedDoneBy.get(keyOf(a)) ?? a.doneBy ?? today, a.park?.until ?? today);
    const expectedPayout = addDays(doneBy, dealOf(a)?.payoutDays ?? ASSUMED.payoutDays);
    update.push({ id: a.id, patch: { deposits, doneBy, expectedPayout, closeAfter: maxIso(a.closeAfter ?? expectedPayout, expectedPayout) } });
    if (r.atRisk.has(keyOf(a))) {
      lines.push({ tone: 'warn', text: `${a.bank}: the remaining deposits can’t all land before the deadline. Route what you can, and check the post to see if the bank is flexible.` });
    } else if (fresh.length) {
      lines.push({ tone: 'plain', text: `${a.bank}: route ${fresh.map((d) => `${money(d.amount)} on ${shortDate(d.date, today)}`).join(', ')}.` });
    }
  }

  // Not opened yet: re-picked around what you already have.
  const planned = accounts.filter((a) => a.status === 'planned');
  for (const a of planned) {
    const item = r.strategy.items.find((i) => i.deal.id === a.dealId);
    if (!item) {
      remove.push(a.id);
      lines.push({ tone: 'warn', text: `Dropped ${a.bank} (${money(a.bonus)}): it no longer fits in time.` });
      continue;
    }
    const next = accountFromItem(item, saved.id, name);
    if (item.openOn === a.openOn && JSON.stringify(item.deposits) === JSON.stringify(a.deposits)) continue;
    update.push({ id: a.id, patch: { ...next, done: {} } });
    if (item.openOn !== a.openOn) {
      lines.push({ tone: 'plain', text: `Open ${a.bank} on ${shortDate(item.openOn, today)}${a.openOn ? ` (was ${shortDate(a.openOn, today)})` : ''}.` });
    }
  }
  for (const item of r.strategy.items) {
    if (planned.some((a) => a.dealId === item.deal.id)) continue;
    add.push(accountFromItem(item, saved.id, name));
    lines.push({ tone: 'good', text: `Added ${item.deal.bank} (${money(item.value.bonus)}): open on ${shortDate(item.openOn, today)}.` });
  }

  const before = accounts.reduce((t, a) => t + (a.status === 'paid' || a.status === 'closed' ? a.bonusReceived ?? a.bonus : a.bonus), 0);
  const after = opened.reduce((t, a) => t + (a.status === 'paid' || a.status === 'closed' ? a.bonusReceived ?? a.bonus : a.bonus), 0)
    + r.strategy.items.reduce((t, i) => t + i.value.bonus, 0);
  const rescheduled = update.length;
  // A renamed plan (new goal or pace) renames it on its accounts too.
  if (name !== saved.name) {
    for (const a of accounts) {
      const u = update.find((x) => x.id === a.id);
      if (u) u.patch.strategyName = name;
      else if (!remove.includes(a.id)) update.push({ id: a.id, patch: { strategyName: name } });
    }
  }
  if (!lines.length) lines.push({ tone: 'plain', text: edited ? 'The schedule stays the same with these settings.' : 'Nothing to change: the plan still works from today.' });
  const counts = [
    edited && 'settings edited',
    rescheduled && `${rescheduled} rescheduled`,
    remove.length && `${remove.length} dropped`,
    add.length && `${add.length} added`,
  ].filter(Boolean).join(', ');

  return {
    lines,
    before,
    after,
    change: {
      update,
      remove,
      add,
      totalBonus: after,
      accounts: opened.length + r.strategy.items.length,
      revisions: [...(saved.revisions ?? []), { on: today, note: counts || 'No changes needed' }],
      strategy: edited ? {
        name,
        planId: `${set.objective}-${set.pace}`,
        inputs: set.inputs,
        baselineApy: set.baselineApy,
        endsOn: set.endsOn,
        paycheck: set.inputs.paycheck,
        months: set.inputs.months,
        firstPayday: set.inputs.firstPayday,
      } : undefined,
    },
  };
}
