import test from 'node:test';
import assert from 'node:assert/strict';
import {wordDocuments, wordsIn, rankWords, rankingCSV, loadWordRows} from '../src/wordFrequency.js';

test('tokenization keeps word forms but excludes URLs, emoji and laughter', () => {
  assert.deepEqual(wordsIn('좋아! 좋아요 💙 ㅋㅋㅋㅋ ㅎㅎ https://weverse.io/a hello HELLO 나'), ['좋아','좋아요','hello','hello','나']);
  assert.deepEqual(wordsIn('나 오늘 i love you', true), ['오늘','love','you']);
});
test('initials and single-letter toggles work independently and keep readable Hangul', () => {
  const text='나 오늘 ㅋ ㅋㅋ ㅎㅎ ㅠㅠ ㄱㅅ';
  assert.deepEqual(wordsIn(text,false,true),['나','오늘','ㅋ','ㅋㅋ','ㅎㅎ','ㅠㅠ','ㄱㅅ']);
  assert.deepEqual(wordsIn(text,true,true),['오늘','ㅋㅋ','ㅎㅎ','ㅠㅠ','ㄱㅅ']);
  assert.deepEqual(wordsIn(text,true,false),['오늘']);
  const docs=[{source:'dm',text:'ㅋㅋ ㅋㅋ 오늘 나'}];
  assert.equal(rankWords(docs,{includeInitials:true}).rows[0].word,'ㅋㅋ');
  assert.equal(rankWords(docs,{includeInitials:false}).total,2);
});
test('only artist text, no nickname candidates, deleted messages or fan comments', () => {
  const rows = wordDocuments({dm: [
    {id:'1',sender_type:'ARTIST',blocks:[{type:'text',text:'안녕 ',body_index:0},{type:'nickname_candidate',text:'개인정보',body_index:0},{type:'text',text:'오늘',body_index:1},{type:'text',text:'좋아',body_index:2}]},
    {id:'2',sender_type:'USER',text:'개인 메시지'},
    {id:'3',sender_type:'ARTIST',text:'삭제 메시지',deleted:true},
  ], comments:[{id:'1',is_target_artist:false,text:'팬 메시지'},{id:'2',is_target_artist:true,text:'리우 댓글'}]});
  assert.equal(rows.length,2);
  assert.deepEqual(wordsIn(rows[0].text),['안녕','오늘','좋아']);
  assert.ok(!JSON.stringify(rows).includes('개인정보'));
});
test('deduplicates records, uses post body only once, and includes authored poll text not vote counts', () => {
  const post={id:1,weverse_url:'https://weverse.io/boynextdoor/artist/4-123',content:'안녕',content_blocks:[{type:'text',content:'안녕'},{type:'poll',question:'어때',options:[{text:'좋아',count:1234}]}]};
  const docs=wordDocuments({posts:[post,{...post,id:2}]});
  assert.equal(docs.length,1);
  assert.equal(rankWords(docs).total,3);
});
test('all totals are sums of each source and repeated words count separately from documents', () => {
  const docs=[{source:'dm',id:'1',text:'오늘 오늘 좋아'},{source:'posts',id:'2',text:'오늘 좋아'},{source:'comments',id:'3',text:'오늘'}];
  const all=rankWords(docs);
  assert.deepEqual(all.rows[0],{word:'오늘',rank:1,count:4,documents:3,dm:2,posts:1,comments:1});
  assert.equal(all.total,['dm','posts','comments'].reduce((n,source)=>n+rankWords(docs,{source}).total,0));
});
test('uses KST calendar days, ties share ranks and searching preserves rank', () => {
  const docs=[{source:'dm',id:'1',time:'2026-10-15T15:00:00Z',text:'오늘 좋아 좋아'},{source:'dm',id:'2',time:'2026-10-16T15:00:00Z',text:'내일'}];
  const result=rankWords(docs,{from:'2026-10-16',through:'2026-10-16',search:'오늘'});
  assert.equal(result.rows[0].rank,2);
  assert.equal(result.total,3);
  assert.deepEqual(rankWords([{source:'dm',text:'좋아 오늘'}]).rows.map(r=>r.rank),[1,1]);
});
test('CSV contains per-source counts and Korean Excel BOM', () => {
  assert.ok(rankingCSV(rankWords([{source:'dm',text:'오늘'}]).rows).startsWith('\uFEFF'));
  assert.ok(rankingCSV(rankWords([{source:'dm',text:'오늘'}]).rows).includes('"오늘","1","1","1","0","0"'));
});
test('paginates beyond 1000 records and never queries hidden sources', async () => {
  const calls=[];
  const client={from(table) {
    calls.push(table);
    const q={select(){return q;},eq(){return q;},order(){return q;},range(start){q.start=start;return q;},abortSignal(){return Promise.resolve({data:Array.from({length:q.start<1000?500:1},(_,i)=>({id:q.start+i,sender_type:'ARTIST',text:'안녕'})),error:null});}};
    return q;
  }};
  const docs=await loadWordRows(client,{dm:true},new AbortController().signal);
  assert.equal(docs.length,1001);
  assert.deepEqual(calls,['dm_messages','dm_messages','dm_messages']);
});
test('failed source does not return misleading partial totals', async () => {
  const q={select(){return q;},eq(){return q;},order(){return q;},range(){return q;},abortSignal(){return Promise.resolve({data:null,error:{message:'실패'}});}};
  await assert.rejects(loadWordRows({from(){return q;}},{dm:true},new AbortController().signal),/DM: 실패/);
});
