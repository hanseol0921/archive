export function profilePhotoKey(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const hash = url.pathname.match(/\/([a-f0-9]{64})\.(?:jpg|jpeg|png|gif|webp)$/i);
    if (hash) return hash[1].toLowerCase();
    url.hash = '';
    return url.href;
  } catch { return value.split('#')[0]; }
}

export function profileAssetCache(rows) {
  const cache=new Map();
  for(const row of rows) for(const value of [row.avatar_url,row.official_avatar_url,row.background_url]) {
    if(!value) continue;
    try {
      const url=new URL(value),key=profilePhotoKey(value);
      if(url.protocol!=='https:' || url.hostname!=='media.riwooarchive.com' || !/^[a-f0-9]{64}$/.test(key)) continue;
      url.hash='';cache.set(key,url.href);
    } catch { /* Only reuse trusted content-addressed uploads. */ }
  }
  return cache;
}

export function isSharedProfileKey(key) {
  return /^(?:photos\/)?weverse\/[a-f0-9]{64}\.(?:jpg|jpeg|png|gif|webp)$/.test(key || '');
}

export const ARTIST_PROFILE_FIELDS=['avatar_url','name','background_url','message','status_emoji'];
const profileTime=row=>Date.parse(row.effective_at || row.observed_at || row.created_at || 0);
function updatesField(row,key) {
  return row.cleared_fields?.includes(key) || (row[key]!=null && row[key]!=='');
}
function sameField(key,a,b) {
  return key.endsWith('_url') ? profilePhotoKey(a)===profilePhotoKey(b) : a===b;
}

export function profileTimeline(rows) {
  const state={},result=[];
  for(const row of [...rows].sort((a,b)=>profileTime(a)-profileTime(b))) {
    const changed_fields=[];
    for(const key of ARTIST_PROFILE_FIELDS) {
      if(!updatesField(row,key)) continue;
      const value=row.cleared_fields?.includes(key)?'':row[key];
      if(!sameField(key,state[key],value)) changed_fields.push(key);
      state[key]=value;
    }
    result.push({...row,...state,changed_fields});
  }
  return result;
}

export function profileFieldHistory(rows,field) {
  return profileTimeline(rows).filter(row=>row.changed_fields.includes(field))
    .map(row=>({id:row.id,at:row.effective_at || row.observed_at || row.created_at,value:row[field]}));
}

export function uniqueArtistProfiles(rows) {
  const entries=new Map();
  for(const row of profileTimeline(rows)) {
    const key=JSON.stringify(ARTIST_PROFILE_FIELDS.map(field=>field.endsWith('_url')?profilePhotoKey(row[field]):row[field]||''));
    entries.delete(key);entries.set(key,row);
  }
  return [...entries.values()];
}

export function sharedDMProfiles(dmProfiles, weverseProfiles, roomId) {
  return [...dmProfiles, ...weverseProfiles.map(p => ({ ...p, id: `weverse:${p.id}`, room_id: roomId,
    observed_at: p.effective_at || p.observed_at, shared_source: 'weverse' }))]
    .sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at));
}

export function sharedDMOverrides(rows, roomId) {
  return rows.filter(p=>p.from_at && p.through_at).map(p=>({...p,id:`weverse:${p.id}`,room_id:roomId,
    from_sent_at:p.from_at,through_sent_at:p.through_at,from_message_id:'',from_body_index:0,
    through_message_id:'\uffff',through_body_index:Number.MAX_SAFE_INTEGER,shared_source:'weverse'}));
}

export function enrichSharedProfile(profile, snapshots, at=null) {
  if(!profile) return profile;
  if(profile.basis==='unknown') return profile;
  const time=at?Date.parse(at):profileTime(profile);
  const inherited=profileTimeline(snapshots.filter(p=>profileTime(p)<=time)).at(-1);
  const result={...profile};
  for(const key of ARTIST_PROFILE_FIELDS) {
    if(profile.cleared_fields?.includes(key)) result[key]='';
    else if(!updatesField(profile,key) && inherited && Object.hasOwn(inherited,key)) result[key]=inherited[key];
  }
  return result;
}
