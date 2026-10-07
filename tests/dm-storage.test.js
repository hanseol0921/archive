import test from 'node:test';
import assert from 'node:assert/strict';
import { dmStorageKey, isSharedDMKey } from '../src/dmStorageKey.js';

test('DM originals use prefixes accepted by the existing storage server', () => {
  for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4']) {
    const key = dmStorageKey('WRBQM41', 'a'.repeat(64), extension);
    const full = `${key.bucket}/${key.path}`;
    assert.match(full, /^(photos|videos)\//);
    assert.equal(full.includes('..'), false);
    assert.equal(isSharedDMKey(full), true);
  }
});

test('legacy and new shared DM keys are protected from gallery deletion', () => {
  for (const key of ['dm/r/file.mp4', 'photos/dm/r/file.jpg', 'videos/dm/r/file.mp4']) {
    assert.equal(isSharedDMKey(key), true);
  }
  assert.equal(isSharedDMKey('photos/regular.jpg'), false);
  assert.equal(isSharedDMKey('videos/regular.mp4'), false);
});

test('invalid media digests and extensions are rejected', () => {
  assert.throws(() => dmStorageKey('r', '../x', 'jpg'));
  assert.throws(() => dmStorageKey('r', 'a'.repeat(64), 'html'));
});
