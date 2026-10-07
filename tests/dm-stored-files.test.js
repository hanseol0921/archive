import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberDMFiles, loadStoredDMFiles } from '../src/dmStoredFiles.js';
const hash='a'.repeat(64);
test('indexes existing original, thumbnail, audio and profile references',()=>{
  const url=`https://media.riwooarchive.com/photos/dm/r/${hash}.jpg`;
  const files=rememberDMFiles([{avatar_url:url,blocks:[{type:'audio',url:`https://media.riwooarchive.com/videos/dm/r/${hash}.mp4`},
    {thumbnail_url:`https://media.riwooarchive.com/dm/r/${hash}.png`}]}],'r');
  assert.equal(files.get(`${hash}.jpg`),url);
  assert.equal(files.size,3);
});
test('does not reuse foreign hosts or other rooms',()=>{
  const files=rememberDMFiles([{blocks:[{url:`https://example.com/photos/dm/r/${hash}.jpg`},
    {url:`https://media.riwooarchive.com/photos/dm/other/${hash}.jpg`}]}],'r');
  assert.equal(files.size,0);
});
test('reads all database pages instead of only the first page',async()=>{
  let reads=0;
  const client={from(table){return {select(){return this;},eq(){return this;},order(){return this;},async range(start){
    reads++;
    return {data:table==='dm_messages' && start===0 ? Array.from({length:500},()=>({blocks:[]}))
      : table==='dm_messages' ? [{blocks:[{url:`https://media.riwooarchive.com/videos/dm/r/${hash}.mp4`}]}] : [],error:null};
  }}}};
  const files=await loadStoredDMFiles(client,'r');
  assert.equal(reads,3);
  assert.equal(files.size,1);
});
