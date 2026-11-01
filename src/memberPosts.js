import {sourcePostId,WEVERSE_ARTIST} from './weverseData.js';

export function memberPostRows(roots, ownPosts = []) {
  const own = new Set(ownPosts.map(p=>sourcePostId(p.weverse_url)).filter(Boolean));
  return roots.filter(p=>p.author_type==='artist' && !p.is_target_artist && !own.has(p.id)).map(p=>({
    id:`member:${p.id}`,is_member_post:true,author:p.author,content:p.text || '',weverse_url:p.url,
    posted_at:p.published_at || null,date:p.published_at ? new Date(p.published_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}) : '',
    tags:[],content_blocks:[],member_images:p.images || [],
  }));
}

export async function loadMemberPosts(client, ownPosts) {
  const roots=[];
  for(let offset=0;;offset+=500) {
    const {data,error}=await client.from('weverse_comment_posts').select('*').eq('artist_member_id',WEVERSE_ARTIST)
      .eq('author_type','artist').eq('is_target_artist',false).order('id').range(offset,offset+499);
    if(error)throw error;
    roots.push(...(data||[]));
    if(!data || data.length<500)break;
  }
  return memberPostRows(roots,ownPosts);
}
