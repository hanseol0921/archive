import test from 'node:test';
import assert from 'node:assert/strict';
import { displayMessages, sameMessageGroup, collectDMPages, messageSpacing, collectDMMedia } from '../src/dmChat.js';

test('media gallery includes older recordings and excludes deleted or missing media', () => {
  const messages = [
    { id: 'old', sent_at: '2026-01-01T00:00:00Z', blocks: [{type:'audio',url:'recording.mp3'},{type:'text',text:'hello'}] },
    { id: 'new', sent_at: '2026-02-01T00:00:00Z', blocks: [{type:'photo',url:'image.jpg'},{type:'audio'},{type:'video',url:'video.mp4'}] },
    { id: 'deleted', sent_at: '2026-03-01T00:00:00Z', deleted: true, blocks: [{type:'audio',url:'deleted.mp3'}] },
  ];
  assert.deepEqual(collectDMMedia(messages).map(item => item.block.url), ['image.jpg','video.mp4','recording.mp3']);
  assert.deepEqual(collectDMMedia(messages, 'audio').map(item => item.id), ['old:0']);
  assert.equal(messages[0].id, 'old');
});

test('body items stay in separate bubbles and original order', () => {
  const rows = displayMessages([{ id:'m',blocks:[
    {type:'nickname_candidate',body_index:0,text:'name'},
    {type:'nickname_candidate',body_index:1,text:'name name name name'},
  ]}]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].blocks[0].text,'name');
  assert.equal(rows[1].blocks[0].text,'name name name name');
  assert.notEqual(rows[0].id,rows[1].id);
});

test('message spacing distinguishes same minute, different minutes and an hour gap', () => {
  const previous={sent_at:'2026-10-03T12:00:00Z'};
  assert.equal(messageSpacing({sent_at:'2026-10-03T12:00:59Z'},previous),'tight');
  assert.equal(messageSpacing({sent_at:'2026-10-03T12:01:00Z'},previous),'normal');
  assert.equal(messageSpacing({sent_at:'2026-10-03T12:59:59Z'},previous),'normal');
  assert.equal(messageSpacing({sent_at:'2026-10-03T13:00:00Z'},previous),'long');
  assert.equal(messageSpacing(previous,null),'normal');
});
test('only profiles group by minute, with profile changes breaking the group', () => {
  const a={room_id:'r',sent_at:'2026-10-03T12:00:01Z'};
  const b={room_id:'r',sent_at:'2026-10-03T12:00:59Z'};
  assert.equal(sameMessageGroup(a,b,{avatar_url:'a'},{avatar_url:'a'}),true);
  assert.equal(sameMessageGroup(a,b,{avatar_url:'a'},{avatar_url:'b'}),false);
  assert.equal(sameMessageGroup(a,{...b,sent_at:'2026-10-03T12:01:00Z'},{},{}),false);
});
test('first message navigation reads all pages, not just the latest 100', async () => {
  const rows=Array.from({length:187},(_,i)=>({id:String(i),sent_at:'2026-10-03T12:00:00Z'}));
  let calls=0;
  const result=await collectDMPages(async cursor=> {
    if (calls++===0) { assert.equal(cursor,null); return rows.slice(0,100); }
    assert.equal(cursor.id,'99'); return rows.slice(100);
  },null,true);
  assert.equal(result.rows.length,187);
  assert.equal(result.more,false);
  assert.equal(calls,2);
});
