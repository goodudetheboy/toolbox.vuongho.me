// Run: npm test -w apps/study-assistant  (esbuild-bundled, node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { align, markdownLines, nextHint, phraseFrom, tokenize, wordsMatch } from './words';

const md = '## The heart wall\n\nThe heart wall has three layers: the **epicardium**, the **myocardium** and the **endocardium**.';

test('markdown becomes plain lines', () => {
  assert.deepEqual(markdownLines('# Title\n\n- **a** b\n| x | y |\n|---|---|\n| 1 | 2 |'), ['Title', 'a b', 'x   y', '1   2']);
});

test('accent-tolerant matching for long words, exact for short ones', () => {
  assert.ok(wordsMatch('myocardiam', 'myocardium'));
  assert.ok(wordsMatch('erithrosite', 'erythrocyte'));
  assert.ok(!wordsMatch('a', 'the'));
  assert.ok(!wordsMatch('then', 'the'));
  assert.ok(!wordsMatch('heart', 'three'));
});

test('in-order recitation credits every word', () => {
  const tokens = tokenize(md);
  assert.equal(tokens[0].display, 'The'); // heading "The heart wall" isn't recited
  const a = align(tokens, 'the heart wall has three layers the epicardium the myocardium and the endocardium');
  assert.equal(a.said.size, tokens.length);
});

test('split long term is joined back', () => {
  const tokens = tokenize('An erythrocyte carries oxygen.');
  const a = align(tokens, 'an ery thro cyte carries oxygen');
  assert.equal(a.said.size, 4);
});

test('out-of-order long words still count, stray short words do not', () => {
  const tokens = tokenize(md);
  const a = align(tokens, 'endocardium and myocardium');
  const saidWords = [...a.said].map((i) => tokens[i].norm).sort();
  assert.deepEqual(saidWords, ['endocardium', 'myocardium']);
});

test('hint is the next unsaid word after where she is', () => {
  const tokens = tokenize(md);
  const a = align(tokens, 'the heart wall has');
  assert.deepEqual(nextHint(tokens, a, 1).map((i) => tokens[i].display), ['three']);
  assert.deepEqual(nextHint(tokens, a, 3).map((i) => tokens[i].display), ['three', 'layers:', 'the']);
});

test('fallback hint phrase stops at the clause or line end', () => {
  const tokens = tokenize('An erythrocyte carries oxygen. It lives 120 days.\n\n- next line');
  assert.deepEqual(phraseFrom(tokens, 0).map((i) => tokens[i].display), ['An', 'erythrocyte', 'carries', 'oxygen.']);
  assert.deepEqual(phraseFrom(tokens, 4).map((i) => tokens[i].display), ['It', 'lives', '120', 'days.']);
  assert.equal(phraseFrom(tokenize(Array(20).fill('word').join(' ')), 0).length, 10);
});

test('backslash escapes from the editor are plain text', () => {
  assert.deepEqual(markdownLines('1\\. Give **2\\*3** mg\\_kg'), ['1. Give 2*3 mg_kg']);
});
