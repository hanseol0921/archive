import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePollSnapshots} from '../src/weversePolls.js';

test('updates poll results without overwriting edited text or other media', () => {
  const text = {type:'text',content:'관리자가 수정한 본문'};
  const photo = {type:'photo',index:0};
  const poll = {type:'poll',id:'1',captured_at:'2026-10-11T11:00:00Z',total_count:10};
  const next = {...poll,captured_at:'2026-10-11T12:00:00Z',total_count:20};
  assert.deepEqual(mergePollSnapshots([text,photo,poll],[{type:'text',content:'원문'},next]),[text,photo,next]);
});

test('older imports cannot replace newer results', () => {
  const poll = {type:'poll',id:'1',captured_at:'2026-10-11T12:00:00Z',total_count:20};
  assert.deepEqual(mergePollSnapshots([poll],[{...poll,captured_at:'2026-10-11T11:00:00Z',total_count:10}]),[poll]);
});

test('adds previously missing poll while keeping existing content', () => {
  const poll={type:'poll',id:'1',captured_at:'2026-10-11T12:00:00Z'};
  assert.deepEqual(mergePollSnapshots(null,[poll]),[poll]);
});
