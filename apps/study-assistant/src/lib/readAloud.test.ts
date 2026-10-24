// Run: npm test -w apps/study-assistant  (esbuild-bundled, node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechPieces } from './readAloud';
import { tokenize } from './words';

test('pieces cover every word once, in order, under the limit', () => {
  const md = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} talks about the myocardium and its many layers.`).join(' ');
  const tokens = tokenize(md);
  const pieces = speechPieces(tokens);
  assert.ok(pieces.length > 1);
  assert.equal(pieces[0].from, 0);
  assert.equal(pieces.at(-1)!.to, tokens.length - 1);
  for (let i = 1; i < pieces.length; i++) assert.equal(pieces[i].from, pieces[i - 1].to + 1);
  for (const p of pieces) assert.ok(p.text.length <= 280, p.text);
});

test('breaks at sentence ends once long enough, not mid-sentence', () => {
  const md = 'The heart has four chambers, two atria and two ventricles, which pump blood. Short one. Then the valves keep blood flowing in one direction only.';
  const pieces = speechPieces(tokenize(md));
  assert.deepEqual(
    pieces.map((p) => p.text),
    ['The heart has four chambers, two atria and two ventricles, which pump blood.', 'Short one. Then the valves keep blood flowing in one direction only.'],
  );
});

test('a sentence ending a list item is its own piece; one very long sentence still splits', () => {
  const short = speechPieces(tokenize('- Atria receive blood.\n- Ventricles pump it.'));
  assert.deepEqual(short.map((p) => p.text), ['Atria receive blood.', 'Ventricles pump it.']);
  const long = speechPieces(tokenize(Array(80).fill('word').join(' ')), 100);
  assert.ok(long.length >= 4);
  for (const p of long) assert.ok(p.text.length <= 100);
});
