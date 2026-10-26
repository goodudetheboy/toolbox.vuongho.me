import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeMarks, encodeMarks, textHash, withoutPictures } from './marks';

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

test('adding or removing a picture is not a text change', () => {
  const plain = 'Cells divide.\n\nThen they grow.';
  assert.equal(withoutPictures(plain), plain);
  assert.equal(textHash('Cells divide.\n\n![](img:abc)\n\nThen they grow.'), textHash(plain));
  assert.equal(textHash('![](img:a)\n\nCells divide.\n\nThen they grow.\n\n![](img:b)'), textHash(plain));
  assert.equal(textHash('Cells divide.\n\nThen they ![](img:x) grow.'), textHash(plain));
  assert.notEqual(textHash('Cells divide.\n\nThen they shrink.'), textHash(plain));
});
