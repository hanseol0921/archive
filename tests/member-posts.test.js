import test from 'node:test';
import assert from 'node:assert/strict';
import {memberPostRows} from '../src/memberPosts.js';
import {wordDocuments} from '../src/wordFrequency.js';

test('member roots retain original name, text, date and images without duplicate native posts',()=>{
  const roots=[{id:'4-2',author:'Other member',author_type:'artist',is_target_artist:false,text:'original',url:'https://weverse.io/boynextdoor/artist/4-2',published_at:'2026-10-31T15:01:00Z',images:[{url:'image.jpg'}]},
    {id:'4-1',author_type:'artist',is_target_artist:true},{id:'4-3',author_type:'fan',is_target_artist:false}];
  const [post]=memberPostRows(roots);
  assert.equal(post.author,'Other member');assert.equal(post.content,'original');assert.equal(post.date,'2026-11-01');
  assert.equal(post.member_images[0].url,'image.jpg');assert.ok(post.is_member_post);
  assert.equal(memberPostRows(roots,[{weverse_url:roots[0].url}]).length,0);
});
test('other member posts and replies never enter Riwoo word statistics',()=>{
  const posts=memberPostRows([{id:'4-2',author_type:'artist',is_target_artist:false,text:'other words'}]);
  const result=wordDocuments({posts,comments:[{id:'c1',is_target_artist:false,text:'another artist'},{id:'c2',is_target_artist:true,text:'Riwoo words'}]});
  assert.equal(result.length,1);assert.equal(result[0].id,'c2');
});
