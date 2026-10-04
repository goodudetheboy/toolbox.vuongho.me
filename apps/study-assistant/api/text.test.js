import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sequenceSimilarity, words } from './text.js';

test('words strips markdown, html and punctuation', () => {
  assert.deepEqual(words('## The **Heart**\n- Pumps blood (4 chambers).'), [
    'the', 'heart', 'pumps', 'blood', '4', 'chambers',
  ]);
  assert.deepEqual(words('<p>Red&nbsp;cells</p>'), ['red', 'cells']);
  assert.deepEqual(words('Hồng cầu: tế bào'), ['hồng', 'cầu', 'tế', 'bào']);
});

test('sequenceSimilarity is 1 for reformatted-but-verbatim text', () => {
  const source = words('The heart pumps blood. It has four chambers.');
  const output = words('# Heart\n\n**The heart** pumps blood.\n\n- It has four chambers.');
  // "Heart" heading is an added word, so slightly below 1 but very close.
  assert.ok(sequenceSimilarity(source, output) > 0.9);
});

test('sequenceSimilarity drops for paraphrase', () => {
  const source = words('The heart pumps blood through the body using four chambers.');
  const output = words('Blood is moved around by the heart, which has 4 chambers.');
  assert.ok(sequenceSimilarity(source, output) < 0.7);
});
