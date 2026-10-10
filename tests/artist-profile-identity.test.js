import test from 'node:test';
import assert from 'node:assert/strict';
import {profilePhotoKey,uniqueArtistProfiles,sharedDMProfiles,sharedDMOverrides,enrichSharedProfile,profileFieldHistory,profileTimeline} from '../src/artistProfileIdentity.js';
import {messageProfile} from '../src/dmProfiles.js';

const hash='a'.repeat(64);
const dm=`https://media.riwooarchive.com/photos/dm/WRBQM41/${hash}.jpg`;
const wv=`https://media.riwooarchive.com/photos/weverse/${hash}.jpeg`;
test('same image is identical across DM, Weverse and crop variations',()=>{
  assert.equal(profilePhotoKey(dm+'#dm-crop=1'),profilePhotoKey(wv));
});
test('repeated observations do not duplicate field changes or drop independent message/cover changes',()=>{
  const rows=[{id:'a',avatar_url:dm,name:'리우',observed_at:'2026-10-01',status_emoji:'heart'},
    {id:'b',avatar_url:wv,name:'리우',observed_at:'2026-10-02',message:'hello',background_url:'cover'},
    {id:'c',avatar_url:dm,name:'리우',observed_at:'2026-10-03'}];
  const history=uniqueArtistProfiles(rows);
  assert.equal(history.length,2);assert.equal(history.at(-1).message,'hello');assert.equal(history.at(-1).status_emoji,'heart');assert.equal(rows.length,3);
  assert.equal(profileFieldHistory(rows,'avatar_url').length,1);
});
test('DM uses shared name/photo while retaining its separate status emoji',()=>{
  const profiles=sharedDMProfiles([{id:'dm',room_id:'r',avatar_url:dm,name:'old',observed_at:'2026-10-01',status_emoji:'heart'}],
    [{id:'wv',avatar_url:wv,name:'new',observed_at:'2026-10-02'}],'r');
  const selected=messageProfile({room_id:'r',sent_at:'2026-10-03',id:'m'},profiles);
  assert.equal(selected.name,'new');assert.equal(selected.status_emoji,'heart');
});
test('shared manual period includes the last timestamp without affecting later messages',()=>{
  const overrides=sharedDMOverrides([{id:'wv',from_at:'2026-10-01',through_at:'2026-10-02',created_at:'2026-10-03',name:'manual'}],'r');
  assert.equal(messageProfile({room_id:'r',sent_at:'2026-10-02',id:'m'},[],overrides).name,'manual');
  assert.notEqual(messageProfile({room_id:'r',sent_at:'2026-10-03',id:'m'},[],overrides).name,'manual');
});
test('DM observation enriches only missing Weverse fields, not explicitly cleared messages',()=>{
  const profile={avatar_url:dm,name:'리우',observed_at:'2026-10-03'};
  const rows=[{avatar_url:wv,name:'리우',observed_at:'2026-10-02',message:'hello'}];
  assert.equal(enrichSharedProfile(profile,rows).message,'hello');
  assert.equal(enrichSharedProfile({...profile,message:''},rows).message,'hello');
  assert.equal(enrichSharedProfile({...profile,message:'',cleared_fields:['message']},rows).message,'');
});
test('photo, cover, name, status and message change independently without erasing other fields',()=>{
  const rows=[{id:'1',observed_at:'2026-10-01',avatar_url:dm,name:'리우',background_url:'cover1',message:'message1',status_emoji:'heart'},
    {id:'2',observed_at:'2026-10-02',avatar_url:'https://media.riwooarchive.com/new.jpg',name:'',background_url:'',message:'',status_emoji:''},
    {id:'3',observed_at:'2026-10-03',background_url:'cover2'},
    {id:'4',observed_at:'2026-10-04',message:'message2'},
    {id:'5',observed_at:'2026-10-05',status_emoji:'star'}];
  const timeline=profileTimeline(rows);
  assert.equal(timeline[1].background_url,'cover1');assert.equal(timeline[1].message,'message1');assert.equal(timeline[1].status_emoji,'heart');
  assert.equal(timeline[2].avatar_url,timeline[1].avatar_url);assert.equal(timeline[2].message,'message1');
  assert.equal(timeline[4].name,'리우');assert.equal(timeline[4].background_url,'cover2');assert.equal(timeline[4].message,'message2');
  assert.deepEqual(timeline.slice(1).map(p=>p.changed_fields),[['avatar_url'],['background_url'],['message'],['status_emoji']]);
  assert.equal(profileFieldHistory(rows,'avatar_url').length,2);
});
test('changing the photo still inherits older cover/message without taking future fields',()=>{
  const earlier={observed_at:'2026-10-01',avatar_url:dm,name:'old',background_url:'cover1',message:'message1'};
  const selected={observed_at:'2026-10-02',avatar_url:'https://image.invalid/new.jpg',name:'new'};
  const future={observed_at:'2026-10-03',message:'future'};
  const p=enrichSharedProfile(selected,[earlier,selected,future]);
  assert.equal(p.background_url,'cover1');assert.equal(p.message,'message1');assert.equal(p.name,'new');
});
