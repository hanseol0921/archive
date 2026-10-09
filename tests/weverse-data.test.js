import test from 'node:test';
import assert from 'node:assert/strict';
import {sourcePostId,resolveWeverseProfile,commentThread,kstInput,inputToUTC,postTimestamp} from '../src/weverseData.js';

test('original post IDs link artist and diary entries without accepting other sites',()=>{
  assert.equal(sourcePostId('https://weverse.io/boynextdoor/artist/4-123?x=1'),'4-123');
  assert.equal(sourcePostId('https://weverse.io/boynextdoor/fanpost/1-456'),'1-456');
  assert.equal(sourcePostId('https://evil.invalid/artist/4-123'),null);
  assert.equal(sourcePostId('not a URL'),null);
});
test('verified changes and observed fallback stay distinguishable',()=>{
  const observed={id:'o',time_basis:'observed',observed_at:'2026-10-09T00:00:00Z'};
  const verified={id:'v',time_basis:'verified',effective_at:'2026-10-10T00:00:00Z'};
  assert.equal(resolveWeverseProfile([observed,verified],[],'2026-10-01T00:00:00Z').id,'o');
  assert.equal(resolveWeverseProfile([observed,verified],[],'2026-10-11T00:00:00Z').id,'v');
  assert.equal(resolveWeverseProfile([verified],[],'2026-10-01T00:00:00Z'),null);
});
test('manual ranges affect only their dates and newest edit wins overlap',()=>{
  const range={id:'old',from_at:'2026-10-01T00:00:00Z',through_at:'2026-10-03T00:00:00Z',created_at:'2026-10-05T00:00:00Z'};
  const newer={...range,id:'new',created_at:'2026-10-06T00:00:00Z'};
  assert.equal(resolveWeverseProfile([], [range,newer],range.from_at).id,'new');
  assert.equal(resolveWeverseProfile([], [range],range.through_at).id,'old');
  assert.equal(resolveWeverseProfile([], [range],'2026-10-04T00:00:00Z'),null);
});
test('backfilled posts keep their first scraped profile, unless a verified boundary exists',()=>{
  const old={id:'old',time_basis:'observed',observed_at:'2026-10-08T00:00:00Z',post_ids:['4-111']};
  const captured={id:'new',time_basis:'observed',observed_at:'2026-10-10T00:00:00Z',post_ids:['4-222']};
  assert.equal(resolveWeverseProfile([old,captured],[],'2023-01-01T00:00:00Z','4-222').id,'new');
  const verified={id:'verified',time_basis:'verified',effective_at:'2022-01-01T00:00:00Z'};
  assert.equal(resolveWeverseProfile([old,captured,verified],[],'2023-01-01T00:00:00Z','4-222').id,'verified');
});
test('blog comments preserve the fan parent and artist reply, sorted by date',()=>{
  const rows=[{id:'r',parent_comment_id:'f',created_at:'2026-10-02T00:00:00Z',is_target_artist:true},
    {id:'a',created_at:'2026-10-01T00:00:00Z'},
    {id:'f',created_at:'2026-10-01T01:00:00Z',author:'원도어'}];
  const result=commentThread(rows);
  assert.deepEqual(result.map(row=>row.id),['a','f']);
  assert.equal(result[1].children[0].id,'r');
  assert.equal(rows[0].children,undefined);
});
test('cycles and missing parents cannot hide comments or recurse forever',()=>{
  assert.equal(commentThread([{id:'a',parent_comment_id:'b'},{id:'b',parent_comment_id:'a'}]).length,2);
  assert.equal(commentThread([{id:'a',parent_comment_id:'missing'}])[0].id,'a');
});
test('date ranges use KST regardless of the browser timezone, including the last minute',()=>{
  assert.equal(kstInput('2026-10-09T01:25:45Z'),'2026-10-09T10:25');
  assert.equal(inputToUTC('2026-10-09T10:25'),'2026-10-09T01:25:00.000Z');
  assert.equal(inputToUTC('2026-10-09T10:25',true),'2026-10-09T01:25:59.999Z');
  assert.equal(postTimestamp({date:'2026-10-09'}),'2026-10-09T00:00:00+09:00');
  assert.throws(()=>inputToUTC('invalid'));
});
