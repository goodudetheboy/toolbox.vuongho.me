import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMarkdown, gradeIdeas, sanitizeIdeas, sanitizeTags, sequenceSimilarity, words } from './text.js';

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

test('cleanMarkdown unwraps code and keeps nested lists', () => {
  assert.equal(cleanMarkdown('```markdown\n## A\n\n    some text\n```'), '## A\n\nsome text');
  assert.equal(cleanMarkdown('- a\n    - b'), '- a\n    - b');
});

test('gradeIdeas weights by idea length and marks missed details', () => {
  const r = gradeIdeas(
    {
      ideas: [
        { start: 0, end: 7, score: 70, missed: [5] }, // "three layers: A, B and C" — said A and C
        { start: 8, end: 9, score: 0, missed: [] },
        { start: 50, end: 60, score: 100, missed: [] }, // out of range: ignored
      ],
    },
    10,
  );
  assert.equal(r.percent, 56); // (70*8 + 0*2) / 10
  assert.deepEqual(r.missed, [5, 8, 9]);
});

test('sanitizeIdeas drops out-of-range ideas and indices, clamps scores', () => {
  const r = sanitizeIdeas(
    { ideas: [{ start: 0, end: 2, score: 140, missed: [1, 9] }, { start: 3, end: 1, score: 50, missed: [] }, { start: 3, end: 4, score: -5 }] },
    5,
  );
  assert.deepEqual(r, [
    { start: 0, end: 2, score: 100, missed: [1] },
    { start: 3, end: 4, score: 0, missed: [] },
  ]);
});

test('sanitizeTags covers every word once, in order', () => {
  // overlap, a gap (5-6), out-of-range end, bad importance, an idea inside another
  const tags = sanitizeTags(
    [
      { start: 7, end: 20, importance: 2 },
      { start: 0, end: 3, importance: 3 },
      { start: 2, end: 4, importance: 9 },
      { start: 1, end: 2, importance: 2 },
      { start: 'x', end: 2, importance: 2 },
    ],
    10,
  );
  assert.deepEqual(tags, [
    { start: 0, end: 3, importance: 3 },
    { start: 4, end: 4, importance: 3 },
    { start: 5, end: 6, importance: 1 },
    { start: 7, end: 9, importance: 2 },
  ]);
  assert.deepEqual(sanitizeTags(null, 3), [{ start: 0, end: 2, importance: 1 }]);
  assert.deepEqual(sanitizeTags([], 0), []);
});
