import test from 'node:test';
import assert from 'node:assert/strict';
import type { Account } from './accounts';
import { accountCards, nextPaycheck, nextStepOf, parkedCash } from './bag';

function acct(over: Partial<Account> = {}): Account {
  return {
    id: 'a1', bank: 'Chase', title: 'Chase $300', dealId: 'chase', docUrl: null, bonus: 300, status: 'planned',
    strategyId: 's1', strategyName: 'Plan', openOn: '2026-10-15', doneBy: '2026-11-13', expectedPayout: '2026-12-13',
    closeAfter: '2027-04-13', deposits: [{ date: '2026-10-30', amount: 1000 }, { date: '2026-11-13', amount: 500 }],
    park: null, transactions: null, openedOn: null, metOn: null, paidOn: null, bonusReceived: null, closedOn: null,
    notes: '', done: {}, ...over,
  };
}

test('next paycheck: the earliest undone deposit day, split across banks, rest to main', () => {
  const a = acct({ status: 'open', openedOn: '2026-10-15', done: { 'dd:2026-10-30': '2026-10-30' } });
  const b = acct({ id: 'b1', bank: 'Citi', deposits: [{ date: '2026-11-13', amount: 750 }], upkeep: [{ date: '2026-11-13', amount: 250 }] });
  const pay = nextPaycheck([a, b], '2026-11-01', 2500)!;
  assert.equal(pay.date, '2026-11-13');
  assert.deepEqual(pay.routes.map((r) => [r.bank, r.amount, r.upkeep]), [['Chase', 500, false], ['Citi', 750, false], ['Citi', 250, true]]);
  assert.equal(pay.toMain, 1000);
  assert.equal(nextPaycheck([a], '2026-11-14', 2500), null);
});

test('parked cash: in, free once the hold ends, later before it moves in, gone once moved out', () => {
  const park = { amount: 5000, until: '2026-12-01' };
  const isIn = acct({ status: 'open', openedOn: '2026-10-15', park, done: { park: '2026-10-15' } });
  assert.equal(parkedCash([isIn], '2026-11-01')[0].state, 'in');
  assert.equal(parkedCash([isIn], '2026-12-02')[0].state, 'free');
  assert.equal(parkedCash([acct({ park })], '2026-10-01')[0].state, 'later');
  assert.equal(parkedCash([{ ...isIn, done: { park: 'x', unpark: 'y' } }], '2026-12-02').length, 0);
});

test('account cards: overdue first, then by stage; deposit progress counts what landed', () => {
  const late = acct({ id: 'late', bank: 'Late', status: 'open', openedOn: '2026-10-15' });
  const waiting = acct({ id: 'w', bank: 'Wait', status: 'met' });
  const fresh = acct({ id: 'f', bank: 'Fresh', openOn: '2026-12-01', deposits: [] });
  const cards = accountCards([waiting, fresh, late], '2026-11-01');
  assert.deepEqual(cards.map((c) => c.account.id), ['late', 'f', 'w']);
  assert.equal(cards[0].overdue, 1);
  assert.deepEqual(cards[0].dd, { done: 0, total: 2, doneAmount: 0, totalAmount: 1500 });
  assert.equal(cards[2].stage, 'waiting');
});

test('next step prefers something you do over waiting on the bank', () => {
  const a = acct({ status: 'met', deposits: [] });
  const b = acct({ id: 'b', bank: 'Citi', openOn: '2026-12-20', deposits: [] });
  assert.equal(nextStepOf([a, b], '2026-11-01')!.key, 'open');
  assert.equal(nextStepOf([a], '2026-11-01')!.key, 'bonus');
});
