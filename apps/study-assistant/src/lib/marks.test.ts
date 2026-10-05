import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeMarks, encodeMarks, textHash } from './marks';

test('marks round-trip', () => {
  const s = ['said', 'hinted', 'missed', 'said'] as const;
  assert.equal(encodeMarks([...s]), 'shms');
  assert.deepEqual(decodeMarks('shms'), [...s]);
});

test('textHash is stable and notices edits', () => {
  assert.equal(textHash('Mitochondria **make** ATP'), textHash('Mitochondria **make** ATP'));
  assert.notEqual(textHash('Mitochondria make ATP'), textHash('Mitochondria makes ATP'));
  assert.match(textHash(''), /^[0-9a-f]{8}$/);
});
