import test from 'node:test';
import assert from 'node:assert/strict';
import {postInDateRange} from '../src/postDateFilter.js';
test('post dates use KST and include both boundaries',()=>{
  assert.equal(postInDateRange({posted_at:'2026-11-05T15:00:00Z'},'2026-11-06','2026-11-06'),true);
  assert.equal(postInDateRange({posted_at:'2026-11-06T14:59:59Z'},'2026-11-06','2026-11-06'),true);
  assert.equal(postInDateRange({posted_at:'2026-11-06T15:00:00Z'},'2026-11-06','2026-11-06'),false);
});
test('date-only posts, open ranges and missing dates',()=>{
  assert.equal(postInDateRange({date:'2026-11-06'},'2026-11-06',''),true);
  assert.equal(postInDateRange({date:'2026-11-07'},'','2026-11-06'),false);
  assert.equal(postInDateRange({},'2026-11-06',''),false);
  assert.equal(postInDateRange({},'',''),true);
});
