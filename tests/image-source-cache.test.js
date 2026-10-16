import test from 'node:test';
import assert from 'node:assert/strict';
import { retryImageSource, rememberImageSource, cachedImageSource } from '../src/imageSourceCache.js';
test('image recovery retries have stable reusable URLs and preserve the object path', () => {
  const original = 'https://media.riwooarchive.com/photos/dm/r/image.jpg';
  const recovered = retryImageSource(original);
  assert.equal(retryImageSource(original), recovered);
  assert.equal(retryImageSource(recovered), recovered);
  assert.equal(new URL(recovered).pathname, new URL(original).pathname);
  rememberImageSource(original, recovered);
  assert.equal(cachedImageSource(original), recovered);
  assert.equal(retryImageSource('https://external.test/a?signature=value'), 'https://external.test/a?signature=value');
});
