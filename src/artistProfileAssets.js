import { supabase } from './supabaseClient';
import { uploadToR2 } from './r2Storage';
import { profileAssetCache } from './artistProfileIdentity';
export { profileAssetCache } from './artistProfileIdentity';
import { WEVERSE_ARTIST } from './weverseData';

export async function sharedProfileAssets() {
  const rows=[];
  for (const [table,key,value] of [['weverse_profile_snapshots','member_id',WEVERSE_ARTIST],
    ['weverse_profile_overrides','member_id',WEVERSE_ARTIST], ['dm_profiles','room_id','WRBQM41'],
    ['dm_profile_overrides','room_id','WRBQM41']]) {
    for(let offset=0;;offset+=500) {
      const {data,error}=await supabase.from(table).select('*').eq(key,value).order('id').range(offset,offset+499);
      if(error) {
        if(['42P01','PGRST205'].includes(error.code)) break;
        throw error;
      }
      rows.push(...(data||[]));
      if(!data || data.length<500) break;
    }
  }
  return rows;
}

export async function uploadArtistProfile(asset) {
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(asset.type) || asset.size>20*1024*1024) throw new Error('20MB 이하 이미지 파일을 선택해 주세요.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await asset.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const cached=profileAssetCache(await sharedProfileAssets()).get(hash);
  if(cached) return cached;
  const extension=asset.type==='image/jpeg'?'jpg':asset.type.split('/')[1];
  return (await uploadToR2('photos',`weverse/${hash}.${extension}`,asset,asset.type)).publicUrl;
}
