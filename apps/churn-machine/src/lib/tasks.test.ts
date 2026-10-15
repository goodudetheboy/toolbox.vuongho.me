import test from 'node:test';
import assert from 'node:assert/strict';
import type { Account } from './accounts';
import { completeTask, neglected, progressOf, stateOf, tasksForStrategy, undoTask, waiting } from './tasks';

function acct(over: Partial<Account> = {}): Account {
  return {
    id: 'a1', bank: 'Chase', title: 'Chase $300', dealId: 'chase', docUrl: null, bonus: 300, status: 'planned',
    strategyId: 's1', strategyName: 'Plan', openOn: '2026-10-15', doneBy: '2026-11-13', expectedPayout: '2026-12-13',
    closeAfter: '2027-04-13', deposits: [{ date: '2026-10-30', amount: 1000 }, { date: '2026-11-13', amount: 500 }],
    park: null, transactions: null, openedOn: null, metOn: null, paidOn: null, bonusReceived: null, closedOn: null,
    notes: '', done: {}, ...over,
  };
}

test('a planned account yields open, one task per deposit, met, bonus and close, in date order', () => {
  const t = tasksForStrategy([acct()], '2026-10-15');
  assert.deepEqual(t.map((x) => x.key), ['open', 'dd:2026-10-30', 'dd:2026-11-13', 'met', 'bonus', 'close']);
  assert.equal(stateOf(t[0], '2026-10-15'), 'today');
});

test('missed actions are neglected; a late bonus is only "waiting"', () => {
  const today = '2026-12-20';
  const t = tasksForStrategy([acct({ status: 'open', openedOn: '2026-10-15', done: { 'dd:2026-10-30': '2026-10-30' } })], today);
  assert.deepEqual(neglected(t, today).map((x) => x.key), ['dd:2026-11-13']);
  assert.deepEqual(waiting(t, today).map((x) => x.key), ['met', 'bonus']);
});

test('checking tasks off moves the account along, and undo puts it back', () => {
  const a = acct();
  const [open] = tasksForStrategy([a], '2026-10-15');
  const opened = { ...a, ...completeTask(open, '2026-10-16') };
  assert.equal(opened.status, 'open');
  assert.equal(opened.openedOn, '2026-10-16');
  const bonus = tasksForStrategy([{ ...opened, status: 'met' }], '2026-12-13').find((x) => x.key === 'bonus')!;
  const paid = { ...opened, ...completeTask(bonus, '2026-12-14', 280) };
  assert.equal(paid.status, 'paid');
  assert.equal(paid.bonusReceived, 280);
  assert.equal({ ...paid, ...undoTask(bonus) }.status, 'met');
});

test('progress counts received money as collected and open accounts as on the way', () => {
  const p = progressOf([
    acct({ id: 'a', status: 'paid', bonus: 300, bonusReceived: 250, paidOn: '2026-12-10' }),
    acct({ id: 'b', status: 'open', bonus: 500 }),
    acct({ id: 'c', status: 'planned', bonus: 200 }),
  ], '2026-10-20');
  assert.equal(p.collected, 250);
  assert.equal(p.onTheWay, 500);
  assert.equal(p.planned, 950);
  assert.equal(p.day, 6);
});
