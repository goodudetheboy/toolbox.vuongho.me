import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTerms, termsHash } from './deal-terms.mjs';

const fourLeaf = {
  id: 'four-leaf', title: 'Four Leaf Federal Credit Union $550', bonusText: '$550',
  bonusMax: 550, bonusMin: 550, bonusPostMax: null,
  requirements: [
    'Receive a $350 checking bonus when you open a new checking account and receive a qualifying direct deposit of $500+ within 90 days of account opening',
    'Receive an additional $100 bonus when you have a qualifying direct deposit continue to post for 12 consecutive months after the first qualify direct deposit',
    'Receive an additional $100 bonus when you have a qualifying direct deposit continue to post for 24 consecutive months after the first qualifying direct deposit',
  ],
  ddText: 'Yes, $500+', extraReqText: null,
  dd: { required: true, amount: 500, windowDays: 90, monthly: true, months: 12, minDeposits: null },
  balance: null, transactions: null,
};

test('checked terms split upfront from later money and fix the requirement', () => {
  const entry = {
    hash: termsHash(fourLeaf), upfront: 350, how: 'One direct deposit of $500+ within 90 days',
    dd: [500, 90, 1, null], later: [{ amount: 100, how: '12 months' }, { amount: 100, how: '24 months' }],
  };
  const d = applyTerms(fourLeaf, entry);
  assert.equal(d.termsChecked, true);
  assert.equal(d.bonusMax, 350);
  assert.equal(d.bonusListed, 550);
  assert.deepEqual(d.dd, { required: true, amount: 500, windowDays: 90, monthly: false, months: null, minDeposits: 1 });
  assert.equal(d.later.length, 2);
});

test('a rewritten post falls back to the parser, marked unchecked', () => {
  const entry = { hash: termsHash(fourLeaf), upfront: 350, dd: [500, 90, 1, null] };
  const changed = { ...fourLeaf, requirements: [...fourLeaf.requirements, 'New: bonus raised to $600'] };
  const d = applyTerms(changed, entry);
  assert.equal(d.termsChecked, false);
  assert.equal(d.bonusMax, 550);
  assert.equal(d.dd.months, 12);
  // Whitespace-only edits don't count as a rewrite.
  const spaced = { ...fourLeaf, title: ` ${fourLeaf.title}  ` };
  assert.equal(applyTerms(spaced, entry).termsChecked, true);
});

test('none / keep markers: 0 clears, missing keeps the parser value', () => {
  const deal = { ...fourLeaf, balance: { amount: 1000, holdDays: 90 }, transactions: 5 };
  const d = applyTerms(deal, { hash: termsHash(deal), upfront: 0, dd: 0, bal: 0, tx: 0 });
  assert.equal(d.dd.required, false);
  assert.equal(d.balance, null);
  assert.equal(d.transactions, null);
  const kept = applyTerms(deal, { hash: termsHash(deal), upfront: 550 });
  assert.deepEqual(kept.dd, deal.dd);
  assert.deepEqual(kept.balance, deal.balance);
  assert.equal(kept.transactions, 5);
});

test('data/deal-terms.json entries are well formed', () => {
  const terms = JSON.parse(readFileSync(new URL('../data/deal-terms.json', import.meta.url), 'utf8'));
  for (const [id, e] of Object.entries(terms)) {
    assert.match(e.hash, /^[0-9a-f]{16}$/, id);
    assert.ok(Number.isInteger(e.upfront) && e.upfront >= 0, id);
    if (e.dd !== undefined) assert.ok(e.dd === 0 || (Array.isArray(e.dd) && e.dd.length === 4), id);
    if (e.bal !== undefined) assert.ok(e.bal === 0 || (Array.isArray(e.bal) && e.bal.length === 2), id);
    for (const l of e.later ?? []) assert.ok(l.amount > 0 && l.how, id);
  }
});
