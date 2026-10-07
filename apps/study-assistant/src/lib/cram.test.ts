import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countForPages, rankIdeas, weakness, type CramIdea } from './cram';

const idea = (key: string, importance: 1 | 2 | 3, marks: string[], noteOrder = 0, start = 0, end = 3): CramIdea => ({
  key,
  noteOrder,
  part: 0,
  start,
  end,
  importance,
  marks,
});

test('weakness: never tried is 0.5, smoothed, recency-weighted, hinted counts half', () => {
  assert.equal(weakness(idea('a', 3, [])), 0.5);
  // newest first: 100% missed, 50%, 100% → (1 + 0.35 + 0.49 + 1) / (2.19 + 2)
  const w = weakness(idea('a', 3, ['mmmm', 'mmss', 'mmmm']));
  assert.ok(Math.abs(w - 2.84 / 4.19) < 1e-9);
  assert.equal(weakness(idea('a', 3, ['hhhh'])), (0.5 + 1) / 3);
  // only the idea's own words count
  assert.equal(weakness({ start: 2, end: 3, marks: ['mmss'] }), 1 / 3);
});

test('rankIdeas: relevant uses her grades, important does not; ties keep exam order', () => {
  const known = idea('known', 3, ['ssss', 'ssss', 'ssss'], 0);
  const missed = idea('missed', 3, ['mmmm', 'mmmm'], 1);
  const untried = idea('untried', 3, [], 2);
  const filler = idea('filler', 1, ['mmmm'], 3);
  // known core 3×1/4.19 ≈ 0.72 still edges out filler 1×2/3 ≈ 0.67
  assert.deepEqual(rankIdeas([known, missed, untried, filler], 'relevant').map((x) => x.key), ['missed', 'untried', 'known', 'filler']);
  assert.deepEqual(rankIdeas([filler, untried, missed, known], 'important').map((x) => x.key), ['known', 'missed', 'untried', 'filler']);
});

test('countForPages fills ~1000 words per page without splitting an idea', () => {
  const ideas = [0, 1, 2, 3].map(() => ({ start: 0, end: 399 })); // 400 words each
  assert.equal(countForPages(ideas, 1), 3); // 800 < 1000 → one more, 1200
  assert.equal(countForPages(ideas, 2), 4);
  assert.equal(countForPages([], 1), 0);
});
