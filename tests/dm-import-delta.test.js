import test from 'node:test';
import assert from 'node:assert/strict';
import {sameDMMessage, sameDMProfile} from '../src/dmImportDelta.js';

const message={id:'m',room_id:'r',sent_at:'2026-10-17T00:00:00Z',sender_type:'ARTIST',text:'hello',deleted:false,blocks:[{type:'text',text:'hello',gift:false}]};
test('unchanged messages compare equal despite JSON key order and timezone formatting',()=>{
  assert.ok(sameDMMessage(message,{...message,sent_at:'2026-10-17T09:00:00+09:00',blocks:[{gift:false,text:'hello',type:'text'}]}));
});
test('new messages, edits, deletion and changed media or profile are never skipped',()=>{
  assert.equal(sameDMMessage(message,null),false);
  for (const change of [{text:'edited'},{deleted:true},{room_id:'other'},{blocks:[{type:'photo',url:'changed'}]},
    {blocks:[...message.blocks,{type:'profile',avatar_url:'new.jpg'}]}]) assert.equal(sameDMMessage(message,{...message,...change}),false);
});
test('profile-only changes remain eligible even without new messages',()=>{
  const p={id:'p',observed_at:'2026-10-17T00:00:00Z',name:'new',avatar_url:'a.jpg'};
  assert.ok(sameDMProfile(p,{...p,room_id:'r',status_emoji:''}));
  assert.equal(sameDMProfile(p,{...p,name:'old'}),false);
  assert.equal(sameDMProfile(p,{...p,avatar_url:'old.jpg'}),false);
});
