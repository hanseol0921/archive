import { supabase } from './supabaseClient';
import { uploadToR2 } from './r2Storage';
import { WEVERSE_ARTIST } from './weverseData';

export function validateWeverseArchive(value) {
  if (!['weverse-comments-archive','weverse-profile-archive'].includes(value?.format)
      || value.version!==1 || value.artist_member_id!==WEVERSE_ARTIST || !Array.isArray(value.profiles)) {
    throw new Error('새 스크래퍼로 수집한 위버스 댓글·프로필 백업을 선택해 주세요.');
  }
  if (!value.media_complete || value.failures?.length || (value.comments && !value.context_complete)) {
    throw new Error('수집이 미완료입니다. 스크래퍼를 다시 실행해 주세요.');
  }
  const posts=new Set((value.posts||[]).map(p=>p.id));
  const ids=new Set();
  for(const row of value.comments||[]) {
    if(!row.id || ids.has(row.id) || !posts.has(row.post_id) || typeof row.text!=='string'
        || !['artist','fan'].includes(row.author_type)) throw new Error('댓글 연결 정보가 잘못됐습니다.');
    ids.add(row.id);
  }
  for(const row of value.comments||[]) if(row.parent_comment_id && !ids.has(row.parent_comment_id)) throw new Error('부모 댓글이 누락됐습니다.');
  for(const p of value.profiles) if(p.member_id!==WEVERSE_ARTIST || !p.id || !Number.isFinite(Date.parse(p.observed_at))
      || !['verified','observed'].includes(p.time_basis) || (p.time_basis==='verified' && !Number.isFinite(Date.parse(p.effective_at)))) throw new Error('프로필 기록이 잘못됐습니다.');
  return value;
}

async function allRows(table,columns) {
  const result=[];
  for(let offset=0;;offset+=500) {
    const {data,error}=await supabase.from(table).select(columns).order('id').range(offset,offset+499);
    if(error) throw error;
    result.push(...data);
    if(data.length<500) return result;
  }
}

export async function importWeverseArchive(archive,files,progress) {
  validateWeverseArchive(archive);
  const {error:setup}=await supabase.rpc('import_weverse_comments',{p_posts:[],p_comments:[],p_profiles:[]});
  if(setup) throw new Error(`먼저 Supabase에서 scripts/weverse-comments-profiles.sql을 실행해 주세요. ${setup.message}`);
  const cache=new Map();
  const existing=await allRows('weverse_comments','id,images');
  const roots=await allRows('weverse_comment_posts','id,images');
  const profiles=await allRows('weverse_profile_snapshots','id,avatar_url,background_url');
  for(const row of [...existing,...roots,...profiles]) {
    for(const url of [...(row.images||[]).map(i=>i.url),row.avatar_url,row.background_url].filter(Boolean)) {
      try {if(new URL(url).hostname!=='media.riwooarchive.com')continue;} catch {continue;}
      const match=url.match(/\/weverse\/([a-f0-9]{64})\.[a-z]+/);
      if(match) cache.set(match[1],url);
    }
  }
  const checked=new Map();
  for(const row of [...archive.posts||[],...archive.comments||[],...archive.profiles]) {
    const assets=[...(row.images||[]),...['avatar','background'].map(kind=>({file:row[`${kind}_file`],sha256:row[`${kind}_sha256`]}))];
    for(const asset of assets.filter(a=>a.file)) {
      if(asset.file.includes('..') || asset.file.includes('\\') || asset.file.startsWith('/')) throw new Error('잘못된 파일 경로입니다.');
      if(checked.has(asset.file)) continue;
      const file=files.get(asset.file);
      if(!file?.size) throw new Error(`파일 누락: ${asset.file}`);
      const buffer=await file.arrayBuffer();
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==asset.sha256) throw new Error(`파일 무결성 오류: ${asset.file}`);
      const bytes=new Uint8Array(buffer);
      let extension;
      if(bytes[0]===0xff && bytes[1]===0xd8) extension='jpg';
      else if(bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71) extension='png';
      else if(String.fromCharCode(...bytes.slice(0,3))==='GIF') extension='gif';
      else if(String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') extension='webp';
      else throw new Error(`지원하지 않는 이미지: ${asset.file}`);
      checked.set(asset.file,{file,hash,extension});
    }
  }
  let uploaded=0,reused=0,done=0;
  async function image(path) {
    if(!path) return '';
    const asset=checked.get(path);
    if(cache.has(asset.hash)) { reused++; return cache.get(asset.hash); }
    const {publicUrl}=await uploadToR2('photos',`weverse/${asset.hash}.${asset.extension}`,asset.file,`image/${asset.extension==='jpg'?'jpeg':asset.extension}`);
    cache.set(asset.hash,publicUrl); uploaded++;
    progress?.(++done,checked.size);
    return publicUrl;
  }
  async function images(row) { return Promise.all((row.images||[]).map(async asset=>({url:await image(asset.file)}))); }
  const posts=[];
  for(const row of archive.posts||[]) posts.push({id:row.id,artist_member_id:WEVERSE_ARTIST,
    author:row.author_type==='fan'?'원도어':row.author,author_type:row.author_type,is_target_artist:!!row.is_target_artist,
    text:row.text||'',url:row.url||'',membership_only:!!row.membership_only,images:await images(row)});
  const comments=[];
  for(const row of archive.comments||[]) {
    const value=row.created_at;
    const time=typeof value==='number' ? value : /^\d+$/.test(value||'') ? Number(value) : value;
    comments.push({id:row.id,post_id:row.post_id,parent_comment_id:row.parent_comment_id||null,artist_member_id:WEVERSE_ARTIST,
      author:row.author_type==='fan'?'원도어':row.author,author_type:row.author_type,is_target_artist:!!row.is_target_artist,
      text:row.text,created_at:time ? new Date(time).toISOString() : null,images:await images(row),
      links:(row.links||[]).filter(url=>/^https?:\/\//.test(url))});
  }
  const importedProfiles=[];
  for(const p of archive.profiles) importedProfiles.push({id:p.id,member_id:p.member_id,observed_at:p.observed_at,
    effective_at:p.effective_at||null,time_basis:p.time_basis,name:p.name,message:p.message||'',
    avatar_url:await image(p.avatar_file),background_url:await image(p.background_file),
    post_ids:(archive.post_profiles||[]).filter(row=>row.profile_id===p.id).map(row=>row.post_id)});
  const {error}=await supabase.rpc('import_weverse_comments',{p_posts:posts,p_comments:comments,p_profiles:importedProfiles});
  if(error) throw error;
  for(let offset=0;offset<comments.length;offset+=100) {
    const batch=comments.slice(offset,offset+100).map(c=>c.id);
    const {data,error:verify}=await supabase.from('weverse_comments').select('id').in('id',batch);
    if(verify || data.length!==batch.length) throw new Error('저장 확인에 실패했습니다. 다시 가져오세요.');
  }
  const oldIds=new Set(existing.map(c=>c.id));
  return {newComments:comments.filter(c=>c.is_target_artist&&!oldIds.has(c.id)).length,existingComments:comments.filter(c=>c.is_target_artist&&oldIds.has(c.id)).length,uploaded,reused};
}
