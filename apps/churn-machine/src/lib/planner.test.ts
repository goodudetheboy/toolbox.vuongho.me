import test from 'node:test';
import assert from 'node:assert/strict';
import type { Deal } from './types';
import { buildStrategy, buildStrategies, requirementOf, type PlanInputs } from './planner';
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
