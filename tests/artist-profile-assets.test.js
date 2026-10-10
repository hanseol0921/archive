import test from 'node:test';
import assert from 'node:assert/strict';
import {profileAssetCache,isSharedProfileKey} from '../src/artistProfileIdentity.js';

const hash='b'.repeat(64);
test('existing DM and Weverse uploads share one photo asset without crop fragments',()=>{
  const cache=profileAssetCache([{avatar_url:`https://media.riwooarchive.com/photos/dm/WRBQM41/${hash}.jpg#dm-crop=50,50,1`},
    {avatar_url:`https://media.riwooarchive.com/photos/weverse/${hash}.jpg`}]);
  assert.equal(cache.size,1);
  assert.equal(cache.get(hash),`https://media.riwooarchive.com/photos/weverse/${hash}.jpg`);
});
test('external and non-content-addressed URLs are never reused as trusted assets',()=>{
  assert.equal(profileAssetCache([{avatar_url:`https://external.invalid/${hash}.jpg`},{avatar_url:'https://media.riwooarchive.com/old.jpg'}]).size,0);
});
test('shared profile originals are protected from gallery deletion',()=>{
  assert.equal(isSharedProfileKey(`photos/weverse/${hash}.jpg`),true);
  assert.equal(isSharedProfileKey('photos/gallery/unique.jpg'),false);
});
