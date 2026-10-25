import test from 'node:test';
import assert from 'node:assert/strict';
import { isSigningOut, signOutToPage } from '../src/authNavigation.js';
test('explicit logout suppresses the login redirect before auth events and opens logout page', async () => {
  let destination;
  await signOutToPage({ async signOut() { assert.equal(isSigningOut(),true); return {error:null}; } }, url => { destination=url; });
  assert.equal(destination,'/logout');
});
test('failed logout keeps the page and restores normal authentication redirects', async () => {
  let navigated=false;
  await assert.rejects(signOutToPage({ async signOut() { return {error:new Error('network')}; } }, () => { navigated=true; }));
  assert.equal(navigated,false);
  assert.equal(isSigningOut(),false);
});
