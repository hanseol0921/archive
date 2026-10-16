import test from 'node:test';
import assert from 'node:assert/strict';
import { attachDMPhotoTimes, photoSourceTime } from '../src/photoChronology.js';

test('DM photos use original sent time even when imported in reverse order', async () => {
  const photos = [{ id: 'late-import', dm_asset_id: 'early-message:0', created_at: '2026-10-16' },
    { id: 'early-import', dm_asset_id: 'late-message:0', created_at: '2026-10-15' }];
  const client = { from(table) {
    assert.equal(table, 'dm_messages');
    return { select(fields) {
      assert.equal(fields, 'id,sent_at');
      return { async in() { return { data: [
        { id: 'early-message', sent_at: '2026-10-15T03:45:11Z' },
        { id: 'late-message', sent_at: '2026-10-15T11:19:22Z' },
      ] }; } };
    } };
  } };
  const rows = await attachDMPhotoTimes(client, photos);
  assert.equal(rows.sort((a,b) => photoSourceTime(b,{}) - photoSourceTime(a,{}))[0].id, 'early-import');
  assert.equal(rows.sort((a,b) => photoSourceTime(a,{}) - photoSourceTime(b,{}))[0].id, 'late-import');
  assert.equal(photos[0].dm_sent_at, undefined);
});
test('post photos retain their original post timestamp and need no DM queries', async () => {
  const photo = { post_id: 'p' };
  assert.deepEqual(await attachDMPhotoTimes({}, [photo]), [photo]);
  assert.equal(photoSourceTime(photo, { p: { postedTime: 123 } }), 123);
});
