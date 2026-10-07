import test from 'node:test';
import assert from 'node:assert/strict';
import { messageProfile, effectiveProfileHistory } from '../src/dmProfiles.js';
const profiles = [
  { id:'new', observed_at:'2026-10-03T12:00:00Z', avatar_url:'new.jpg', status_emoji:'new' },
  { id:'old', observed_at:'2026-10-02T12:00:00Z', avatar_url:'old.jpg', status_emoji:'old' },
];
test('message avatar and status follow the observed profile boundary', () => {
  assert.equal(messageProfile({sent_at:'2026-10-03T11:59:59Z'},profiles).id,'old');
  assert.equal(messageProfile({sent_at:'2026-10-03T12:00:00Z'},profiles).id,'new');
});
test('unknown past does not inherit a later status or claim historical accuracy', () => {
  const p = messageProfile({sent_at:'2026-10-01T12:00:00Z'},profiles);
  assert.equal(p.basis,'unknown');
  assert.equal(p.status_emoji,'');
});
test('message response avatars are preserved without inventing status', () => {
  const p = messageProfile({sent_at:'2026-10-01T12:00:00Z',blocks:[{type:'profile',avatar_url:'attached.jpg'}]},profiles);
  assert.equal(p.avatar_url,'attached.jpg');
  assert.equal(p.basis,'message_response');
  assert.equal(p.status_emoji,'');
});

test('manual overrides include selected body and older messages, not later bodies', () => {
  const rule={id:'o',room_id:'r',through_sent_at:'2026-10-03T12:00:00Z',through_message_id:'b',
    through_body_index:0,created_at:'2026-10-03T13:00:00Z',avatar_url:'manual.jpg'};
  const message={room_id:'r',source_id:'b',body_index:0,sent_at:rule.through_sent_at};
  assert.equal(messageProfile(message,profiles,[rule]).basis,'manual');
  assert.equal(messageProfile({...message,body_index:1},profiles,[rule]).id,'new');
  assert.equal(messageProfile({...message,source_id:'a'},profiles,[rule]).basis,'manual');
  assert.equal(messageProfile({...message,source_id:'c'},profiles,[rule]).id,'new');
  assert.equal(messageProfile({...message,room_id:'other'},profiles,[rule]).id,'new');
});
test('the newest manual edit wins for all messages above its boundary', () => {
  const base={room_id:'r',through_sent_at:'2026-10-03T12:00:00Z',through_message_id:'b',through_body_index:0};
  const rules=[{...base,id:'old',created_at:'2026-10-03T13:00:00Z',avatar_url:'old'},
    {...base,id:'new',created_at:'2026-10-03T14:00:00Z',avatar_url:'new'}];
  assert.equal(messageProfile({room_id:'r',id:'a',sent_at:'2026-10-01T00:00:00Z'},[],rules).avatar_url,'new');
});

test('explicit ranges exclude messages before the start and after the end', () => {
  const rule={id:'range',room_id:'r',from_sent_at:'2026-10-03T12:00:00Z',from_message_id:'b',from_body_index:1,
    through_sent_at:'2026-10-03T12:00:00Z',through_message_id:'c',through_body_index:0,
    created_at:'2026-10-03T14:00:00Z',avatar_url:'range.jpg'};
  const base={room_id:'r',sent_at:rule.from_sent_at};
  assert.equal(messageProfile({...base,id:'b',body_index:0},profiles,[rule]).id,'new');
  assert.equal(messageProfile({...base,id:'b',body_index:1},profiles,[rule]).id,'range');
  assert.equal(messageProfile({...base,id:'c',body_index:0},profiles,[rule]).id,'range');
  assert.equal(messageProfile({...base,id:'c',body_index:1},profiles,[rule]).id,'new');
});

test('history excludes fully overwritten profiles but retains partially active profiles', () => {
  const rows=['a','b','c'].map(id=>({id,room_id:'r',sent_at:'2026-10-03T12:00:00Z'}));
  const base={room_id:'r',through_sent_at:rows[0].sent_at,through_message_id:'c',through_body_index:0};
  const old={...base,id:'old',created_at:'2026-10-03T13:00:00Z',avatar_url:'old.jpg'};
  const replacement={...base,id:'replacement',created_at:'2026-10-03T14:00:00Z',avatar_url:'replacement.jpg'};
  assert.deepEqual(effectiveProfileHistory(rows,[],[old,replacement]).map(p=>p.id),['replacement']);
  assert.equal(effectiveProfileHistory(rows,[],[old,{...replacement,from_sent_at:rows[0].sent_at,from_message_id:'b',from_body_index:0}]).length,2);
});

test('history puts the most recently used profile on the right', () => {
  const rows=[{id:'later',sent_at:'2026-10-03T12:00:00Z'},
    {id:'earlier',sent_at:'2026-10-02T12:00:00Z'}];
  assert.deepEqual(effectiveProfileHistory(rows,profiles,[]).map(p=>p.id),['old','new']);
});
