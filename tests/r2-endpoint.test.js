import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeR2Endpoint } from '../server/r2-endpoint.js';
test('bucket suffix cannot become a second object prefix', () => {
  const root = 'https://account.r2.cloudflarestorage.com';
  for (const endpoint of [root, root + '/', root + '/archive', root + '/archive/']) {
    assert.equal(normalizeR2Endpoint(endpoint, 'archive'), root);
  }
});
test('unrelated paths and query credentials are rejected', () => {
  assert.throws(() => normalizeR2Endpoint('https://account.r2.cloudflarestorage.com/other', 'archive'));
  assert.throws(() => normalizeR2Endpoint('https://account.r2.cloudflarestorage.com/?secret=value', 'archive'));
});
