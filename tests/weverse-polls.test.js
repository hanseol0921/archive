import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePollSnapshots, hasPollUpdates} from '../src/weversePolls.js';

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

const closed = {type:'poll', id:'p', question:'후보 선택', status:'CLOSED', total_count:12,
  captured_at:'2026-10-16T12:00:00Z', options:[{id:'a',text:'A',count:12,photo_index:0}]};
test('closed polls with identical results are skipped even when collected again', () => {
  assert.equal(hasPollUpdates([closed], [{...closed,captured_at:'2026-10-17T12:00:00Z'}]), false);
  assert.equal(hasPollUpdates([closed], [{ options:closed.options, total_count:12, status:'CLOSED', question:'후보 선택', id:'p', type:'poll' }]), false);
});
test('final results and actual choice changes remain importable once', () => {
  assert.equal(hasPollUpdates([{...closed,status:'ACTIVE'}], [closed]), true);
  const changed = {...closed,total_count:13,captured_at:'2026-10-17T12:00:00Z',options:[{...closed.options[0],count:13}]};
  assert.equal(hasPollUpdates([closed], [changed]), true);
  assert.equal(hasPollUpdates(mergePollSnapshots([closed],[changed]), [changed]), false);
  assert.equal(hasPollUpdates([closed], [{...changed,captured_at:'2026-10-15T12:00:00Z'}]), false);
});
test('existing ordinary posts are duplicates, and missing polls can still be restored', () => {
  assert.equal(hasPollUpdates([{type:'text',content:'본문'}], [{type:'text',content:'본문'}]), false);
  assert.equal(hasPollUpdates(null,[closed]), true);
  assert.equal(hasPollUpdates([{type:'text',content:'관리자 수정 본문'},closed], [closed]), false);
});
