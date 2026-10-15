import test from 'node:test';
import assert from 'node:assert/strict';
import type { Deal } from './types';
import { buildStrategy, buildStrategies, requirementOf, revisePlan, type Committed, type PlanInputs } from './planner';
import { addDays } from './dates';

const TODAY = '2026-10-15';

function deal(id: string, over: Partial<Deal> = {}): Deal {
  return {
    id, rank: 1, title: id, bank: id, category: 'checking', url: null, otherPosts: [], offerLink: null,
    postUpdated: null, blurb: [], latestNote: null, bonusMax: 300, bonusMin: 300, bonusNote: null, bonusPostMax: null, bonusText: null,
    availability: 'Nationwide', states: [], nationwide: true, inBranch: false, expires: null, noEndDate: true,
    expirationText: null, ended: false,
    dd: { required: true, amount: 1000, windowDays: 90, monthly: false, months: null, minDeposits: null },
    ddText: null, balance: null, transactions: null, promoCode: null, payoutDays: 30, extraReqText: null,
    pull: 'soft', pullText: null, chexPulls: 'unknown', chexSensitive: false, chexText: null, ccFunding: 0,
    ccText: null, monthlyFee: { amount: 0, avoidable: true }, monthlyFeeText: null,
    eatf: { fee: 0, days: 180, forfeit: false }, eatfText: null, householdText: null, requirements: [],
    verdict: [], hasGlance: true, ...over,
  };
}

const INPUTS: PlanInputs = {
  paycheck: 2000, firstPayday: '2026-10-23', months: 6, state: 'NY', cash: 0, maxSplits: 3, leadDays: 7,
  minBonus: 0, noHardPull: false, noChexSensitive: false, online: false, business: false,
  includeDatePassed: false, excludeBanks: [],
};

test('every planned deal gets its full direct deposit inside its window', () => {
  const deals = Array.from({ length: 12 }, (_, i) => deal(`d${i}`, { rank: i + 1, bonusMax: 200 + i * 50,
    dd: { required: true, amount: 1000 + i * 500, windowDays: 60 + (i % 3) * 30, monthly: false, months: null, minDeposits: null } }));
  const s = buildStrategy(deals, INPUTS, 'money', 3, TODAY, 0.04);
  assert.ok(s.items.length > 0);
  for (const item of s.items) {
    const req = requirementOf(item.deal);
    const inWindow = item.deposits.filter((d) => d.date <= addDays(item.openOn, req.windowDays));
    assert.ok(inWindow.reduce((t, d) => t + d.amount, 0) >= req.need, `${item.deal.id} short of its DD`);
  }
  // A paycheck is never split beyond what it holds, or across more than maxSplits accounts.
  for (const p of s.paychecks) {
    assert.ok(p.splits.length <= INPUTS.maxSplits);
    assert.equal(p.splits.reduce((t, x) => t + x.amount, 0) + p.toMain, INPUTS.paycheck);
  }
});

test('pace caps new accounts per calendar month', () => {
  const deals = Array.from({ length: 10 }, (_, i) => deal(`d${i}`, { rank: i + 1,
    dd: { required: true, amount: 100, windowDays: 90, monthly: false, months: null, minDeposits: null } }));
  const s = buildStrategy(deals, INPUTS, 'money', 1, TODAY, 0.04);
  const months = s.items.map((i) => i.openOn.slice(0, 7));
  assert.equal(new Set(months).size, months.length);
});

test('respects cash on hand for balance deals, and state availability', () => {
  const deals = [
    deal('park', { dd: { required: false, amount: 0, windowDays: null, monthly: false, months: null, minDeposits: null },
      balance: { amount: 15000, holdDays: 90 }, bonusMax: 400 }),
    deal('texas', { nationwide: false, states: ['TX'] }),
  ];
  assert.equal(buildStrategy(deals, { ...INPUTS, cash: 10000 }, 'money', 3, TODAY, 0.04).items.length, 0);
  const s = buildStrategy(deals, { ...INPUTS, cash: 20000 }, 'money', 3, TODAY, 0.04);
  assert.deepEqual(s.items.map((i) => i.deal.id), ['park']);
  assert.equal(s.totals.peakParked, 15000);
});

test('monthly requirements get a deposit every month', () => {
  const d = deal('monthly', { dd: { required: true, amount: 1500, windowDays: null, monthly: true, months: 3, minDeposits: null } });
  const [item] = buildStrategy([d], INPUTS, 'money', 3, TODAY, 0.04).items;
  assert.ok(item);
  for (let b = 0; b < 3; b++) {
    const got = item.deposits
      .filter((x) => x.date >= addDays(item.openOn, b * 30) && x.date < addDays(item.openOn, (b + 1) * 30))
      .reduce((t, x) => t + x.amount, 0);
    assert.ok(got >= 500, `month ${b + 1} got ${got}`);
  }
});

test('min deposit count: "two deposits of $500 each" is two deposits', () => {
  const d = deal('two', { dd: { required: true, amount: 1000, windowDays: 60, monthly: false, months: null, minDeposits: 2 } });
  const [item] = buildStrategy([d], INPUTS, 'money', 3, TODAY, 0.04).items;
  assert.deepEqual(item.deposits.map((x) => x.amount), [500, 500]);
});

test('skips ended, expired-before-opening and excluded-bank deals; deterministic output', () => {
  const deals = [
    deal('ended', { ended: true }),
    deal('soon', { expires: '2026-10-16', noEndDate: false }),
    deal('chase', { bank: 'Chase' }),
    deal('ok'),
  ];
  const inputs = { ...INPUTS, excludeBanks: ['CHASE'] };
  const a = buildStrategies(deals, inputs, TODAY, 0.04);
  const b = buildStrategies(deals, inputs, TODAY, 0.04);
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
  const ids = new Set(a.flatMap((s) => s.items.map((i) => i.deal.id)));
  assert.ok(!ids.has('ended') && !ids.has('chase'));
  // "soon" can only be opened today (before it expires), which is allowed.
  for (const s of a) for (const i of s.items) if (i.deal.id === 'soon') assert.equal(i.openOn, TODAY);
});

test('no paycheck means only no-DD deals', () => {
  const deals = [deal('dd'), deal('nodd', { dd: { required: false, amount: 0, windowDays: null, monthly: false, months: null, minDeposits: null }, transactions: 10 })];
  const s = buildStrategy(deals, { ...INPUTS, paycheck: 0 }, 'money', 3, TODAY, 0.04);
  assert.deepEqual(s.items.map((i) => i.deal.id), ['nodd']);
});

test('revising keeps opened accounts, reschedules their missed deposits, and re-picks the rest', () => {
  const deals = Array.from({ length: 10 }, (_, i) => deal(`d${i}`, { rank: i + 1, bonusMax: 300 + i * 40,
    dd: { required: true, amount: 1500, windowDays: 90, monthly: false, months: null, minDeposits: null } }));
  // Two weeks later: d9 was opened on time but its first $1,000 deposit never happened.
  const later = '2026-10-29';
  const committed: Committed[] = [{
    dealId: 'd9', bank: 'd9', openedOn: '2026-10-15', ddDeadline: addDays('2026-10-15', 90),
    remainingNeed: 1500, remainingDeposits: 1, park: null,
  }];
  const inputs = { ...INPUTS, firstPayday: '2026-11-06' };
  const r = revisePlan(deals, inputs, 'money', 2, later, 0.04, addDays(TODAY, 182), committed);
  // The opened account is kept, not re-picked, and gets its $1,500 before its deadline.
  assert.ok(!r.strategy.items.some((i) => i.deal.bank === 'd9'));
  const dd = r.committedDeposits.get('d9')!;
  assert.ok(dd.every((d) => d.date >= later && d.date <= committed[0].ddDeadline));
  assert.ok(dd.reduce((t, d) => t + d.amount, 0) >= 1500);
  assert.equal(r.atRisk.size, 0);
  // New picks start no earlier than today, and paychecks still add up.
  assert.ok(r.strategy.items.length > 0);
  assert.ok(r.strategy.items.every((i) => i.openOn >= later));
  for (const p of r.strategy.paychecks) {
    assert.equal(p.splits.reduce((t, x) => t + x.amount, 0) + p.toMain, inputs.paycheck);
  }
});

test('a committed account that can no longer make its deadline is flagged, not dropped', () => {
  const deals = [deal('a', { rank: 1 }), deal('b', { rank: 2 })];
  const committed: Committed[] = [{
    dealId: 'x', bank: 'x', openedOn: '2026-08-01', ddDeadline: '2026-10-20',
    remainingNeed: 5000, remainingDeposits: 1, park: null,
  }];
  const r = revisePlan(deals, { ...INPUTS, firstPayday: '2026-10-23' }, 'money', 3, TODAY, 0.04, addDays(TODAY, 182), committed);
  assert.ok(r.atRisk.has('x'));
  // The at-risk account doesn't stop new picks.
  assert.ok(r.strategy.items.length > 0);
});

test('an on-track opened account keeps its exact deposits through a revision', () => {
  const deals = Array.from({ length: 6 }, (_, i) => deal(`d${i}`, { rank: i + 1 }));
  const fixed = [{ date: '2026-10-23', amount: 1500 }, { date: '2026-11-06', amount: 700 }];
  const committed: Committed[] = [{
    dealId: 'kept', bank: 'Kept', openedOn: '2026-10-15', ddDeadline: '2027-01-13',
    remainingNeed: 2200, remainingDeposits: 2, park: null, fixedDeposits: fixed,
  }];
  const r = revisePlan(deals, INPUTS, 'money', 3, TODAY, 0.04, addDays(TODAY, 182), committed);
  assert.deepEqual(r.committedDeposits.get('kept'), fixed);
  // Its reservation comes off those paychecks before any new pick gets a share.
  for (const p of r.strategy.paychecks) {
    assert.equal(p.splits.reduce((t, x) => t + x.amount, 0) + p.toMain, INPUTS.paycheck);
    assert.ok(p.splits.length <= INPUTS.maxSplits);
  }
  const oct23 = r.strategy.paychecks.find((p) => p.date === '2026-10-23')!;
  assert.equal(oct23.splits.find((x) => x.dealId === 'kept')?.amount, 1500);
});
