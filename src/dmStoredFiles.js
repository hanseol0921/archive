export function rememberDMFiles(rows, roomId, files = new Map()) {
  for (const row of rows) {
    const urls = [row.avatar_url, row.official_avatar_url,
      ...(row.blocks || []).flatMap(b => [b.url, b.thumbnail_url, b.avatar_url])];
    for (const value of urls) {
      if (!value) continue;
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'media.riwooarchive.com') continue;
        const key = decodeURIComponent(url.pathname.slice(1));
        const prefixes = [`photos/dm/${roomId}/`, `videos/dm/${roomId}/`, `dm/${roomId}/`, 'photos/weverse/', 'weverse/'];
        const prefix = prefixes.find(p => key.startsWith(p));
        if (!prefix) continue;
        const name = key.slice(prefix.length);
        if (!/^[a-f0-9]{64}\.(jpg|jpeg|png|gif|webp|mp4)$/.test(name)) continue;
        url.hash = '';
        files.set(name,url.href);
      } catch { /* Ignore external and legacy non-content-addressed references. */ }
    }
  }
  return files;
}

export async function loadStoredDMState(client, roomId) {
  const files = new Map();
  const messageIds = new Set();
  const messages = new Map();
  const profiles = new Map();
  for (const [table, fields] of [['dm_messages','id,room_id,sent_at,sender_type,text,blocks,deleted'], ['dm_profiles','id,observed_at,name,official_name,status_emoji,avatar_url,official_avatar_url']]) {
    for (let offset = 0; ; offset += 500) {
      const {data,error} = await client.from(table).select(fields).eq('room_id',roomId)
        .order('id').range(offset,offset+499);
      if (error) throw new Error(`기존 DM 파일 확인 실패: ${error.message}`);
      rememberDMFiles(data || [], roomId, files);
      for (const row of data || []) if (row.id) {
        if (table === 'dm_messages') { messageIds.add(row.id); messages.set(row.id,row); }
        else profiles.set(row.id,row);
      }
      if (!data || data.length < 500) break;
    }
  }
  return { files, messageIds, messages, profiles };
}

export async function loadStoredDMFiles(client,roomId) {
  return (await loadStoredDMState(client,roomId)).files;
}
