import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import handler from '../api/youtube-search.js';
import { ADMIN_USER_ID } from '../src/adminAccess.js';

function response() { return { setHeader() {}, end(body) { this.body = JSON.parse(body); } }; }
test('search rejects anonymous access and invalid queries without querying YouTube', async () => {
  for (const [query, status] of [[{ q: '리우' }, 401], [{ q: '' }, 400], [{ q: '리우', page: 'https://bad.test' }, 400]]) {
    const res = response();
    await handler({ method: 'GET', query, headers: {} }, res);
    assert.equal(res.statusCode, status);
  }
});
test('authenticated search filters embeddable videos and reuses cached results', async t => {
  const values = { YOUTUBE_API_KEY: 'test-key', VITE_SUPABASE_URL: 'https://auth.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let searches = 0, admin = true;
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === 'auth.test') return new Response(JSON.stringify({ id: admin ? ADMIN_USER_ID : 'other-user', aud: 'authenticated' }), { headers: { 'content-type': 'application/json' } });
    searches++;
    assert.equal(url.hostname, 'www.googleapis.com');
    assert.equal(url.searchParams.get('type'), 'video');
    assert.equal(url.searchParams.get('videoEmbeddable'), 'true');
    return new Response(JSON.stringify({ nextPageToken: 'nextpage', items: [
      { id: { videoId: 'abcdefghijk' }, snippet: { title: '리우 영상', channelTitle: '채널', publishedAt: '2026-10-15T15:30:00Z' } },
      { id: { channelId: 'not-video' } },
    ] }), { headers: { 'content-type': 'application/json' } });
  });
  const request = { method: 'GET', query: { q: 'unit-test-riwoo' }, headers: { authorization: 'Bearer token' } };
  for (let n = 0; n < 2; n++) {
    const res = response(); await handler(request, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].id, 'abcdefghijk');
    assert.equal(res.body.nextPage, 'nextpage');
    assert.equal(JSON.stringify(res.body).includes('test-key'), false);
  }
  assert.equal(searches, 1);
  admin = false;
  const res = response(); await handler(request, res);
  assert.equal(res.statusCode, 403);
  assert.equal(searches, 1);
});
