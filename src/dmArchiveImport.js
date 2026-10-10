import { supabase } from './supabaseClient';
import { uploadToR2 } from './r2Storage';
import { dmStorageKey } from './dmStorageKey';
import { loadStoredDMState } from './dmStoredFiles';
import {sharedProfileAssets,profileAssetCache} from './artistProfileAssets';

export function validateDMArchive(value) {
  if (value?.format !== 'weverse-dm-archive' || value.version !== 1 || !value.room?.id
      || !Array.isArray(value.messages) || !Array.isArray(value.profiles)) {
    throw new Error('DM archive.json 형식이 아닙니다.');
  }
  if (!value.media_complete || value.failures?.length) throw new Error('미디어 수집을 완료한 뒤 다시 가져와 주세요.');
  const ids = new Set();
  for (const message of value.messages) {
    if (message.sender_type !== 'ARTIST' || message.room_id !== value.room.id
        || !message.id || ids.has(message.id) || !Number.isFinite(Date.parse(message.sent_at))
        || !Array.isArray(message.blocks)) throw new Error('메시지 검증에 실패했습니다.');
    ids.add(message.id);
    for (const block of message.blocks) {
      if (!['text', 'nickname_candidate', 'photo', 'video', 'audio'].includes(block.type)) {
        throw new Error('지원하지 않는 DM 콘텐츠가 있습니다.');
      }
      if (['photo', 'video', 'audio'].includes(block.type) && (!block.file || !block.asset_id || !block.sha256)) {
        throw new Error('미디어 원본 정보가 없습니다.');
      }
    }
  }
  return value;
}

export function archiveFileMap(files) {
  const result = new Map();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const split = path.indexOf('/');
    const relative = split >= 0 ? path.slice(split + 1) : path;
    if (result.has(relative)) throw new Error('중복된 파일 경로입니다.');
    result.set(relative, file);
  }
  return result;
}

function localFile(files, path) {
  if (!path || path.includes('..') || path.includes('\\') || path.startsWith('/')) throw new Error('잘못된 미디어 경로입니다.');
  const file = files.get(path);
  if (!file?.size) throw new Error(`파일 누락: ${path}`);
  return file;
}

export async function importDMArchive(archive, files, progress) {
  validateDMArchive(archive);
  // Check the database setup before transferring media. Empty batches only upsert the room.
  const room = { id: archive.room.id, artist_name: archive.room.artist_name, display_name: archive.room.display_name };
  const { error: setupError } = await supabase.rpc('import_weverse_dm', {
    p_room: room, p_messages: [], p_profiles: [],
  });
  if (setupError) {
    if (setupError.code === 'PGRST202') {
      throw new Error('DM DB 설정이 아직 없습니다. Supabase SQL Editor에서 scripts/weverse-dm.sql을 실행한 뒤 다시 가져와 주세요.');
    }
    throw new Error(`DM DB 연결 확인 실패: ${setupError.message}`);
  }
  // Check every local dependency before uploading anything. Never upload the raw capture/session.
  for (const message of archive.messages) for (const block of message.blocks) {
    if (block.file) localFile(files, block.file);
    if (block.thumbnail_file) localFile(files, block.thumbnail_file);
  }
  for (const message of archive.messages) if (message.avatar_file) localFile(files, message.avatar_file);
  for (const profile of archive.profiles) {
    if (profile.avatar_file) localFile(files, profile.avatar_file);
    if (profile.official_avatar_file) localFile(files, profile.official_avatar_file);
  }
  const uploaded = new Map();
  const profileFiles=new Set([...archive.profiles.flatMap(p=>[p.avatar_file,p.official_avatar_file]),...archive.messages.map(m=>m.avatar_file)].filter(Boolean));
  const sharedFiles=profileAssetCache(await sharedProfileAssets());
  const {files:storedFiles,messageIds:existingMessages} = await loadStoredDMState(supabase, archive.room.id);
  const stats={newMessages:0,existingMessages:0,uploadedFiles:0,reusedFiles:0};
  async function media(path, expectedHash) {
    if (uploaded.has(path)) return uploaded.get(path);
    const file = localFile(files, path);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map(x => x.toString(16).padStart(2, '0')).join('');
    if (expectedHash && digest !== expectedHash) throw new Error(`파일 무결성 오류: ${path}`);
    const extension = path.split('.').pop().toLowerCase();
    if (!['jpg','jpeg','png','gif','webp','mp4'].includes(extension)) throw new Error('지원하지 않는 미디어 파일입니다.');
    const type = extension === 'mp4' ? 'video/mp4' : `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    if(profileFiles.has(path) && sharedFiles.has(digest)) {
      stats.reusedFiles++;uploaded.set(path,sharedFiles.get(digest));return sharedFiles.get(digest);
    }
    // Content-addressed keys make retry safe; an interrupted import never deletes shared files.
    const { bucket, path: storagePath } = profileFiles.has(path)
      ? {bucket:'photos',path:`weverse/${digest}.${extension==='jpeg'?'jpg':extension}`}
      : dmStorageKey(archive.room.id, digest, extension);
    const storedName = `${digest}.${extension}`;
    if (storedFiles.has(storedName)) {
      stats.reusedFiles++;
      const existingUrl = storedFiles.get(storedName);
      uploaded.set(path, existingUrl);
      return existingUrl;
    }
    const { publicUrl } = await uploadToR2(bucket, storagePath, file, type);
    stats.uploadedFiles++;
    storedFiles.set(storedName, publicUrl);
    uploaded.set(path, publicUrl);
    if(profileFiles.has(path)) sharedFiles.set(digest,publicUrl);
    return publicUrl;
  }
  const profiles = [];
  for (const p of archive.profiles) profiles.push({
    id: p.id, observed_at: p.observed_at, name: p.name, official_name: p.official_name,
    status_emoji: p.status_emoji,
    avatar_url: p.avatar_file ? await media(p.avatar_file) : null,
    official_avatar_url: p.official_avatar_file ? await media(p.official_avatar_file) : null,
  });
  for (let offset = 0; offset < archive.messages.length || offset === 0; offset += 100) {
    const messages = [];
    for (const m of archive.messages.slice(offset, offset + 100)) {
      const blocks = [];
      for (const b of m.blocks) {
        const block = { type: b.type, gift: !!b.gift, gift_code: b.gift_code || null };
        if (Number.isInteger(b.body_index)) block.body_index = b.body_index;
        if (b.text !== undefined) block.text = b.text;
        if (b.evidence) block.evidence = b.evidence;
        if (b.file) {
          block.asset_id = b.asset_id;
          block.url = await media(b.file, b.sha256);
          block.thumbnail_url = b.thumbnail_file ? await media(b.thumbnail_file) : null;
          block.duration = b.duration || 0;
        }
        blocks.push(block);
      }
      const snapshotIndex = archive.profiles.findIndex(p => p.avatar_source_url && p.avatar_source_url === m.profile_source_url);
      const avatarUrl = m.avatar_file ? await media(m.avatar_file, m.avatar_sha256)
        : snapshotIndex >= 0 ? profiles[snapshotIndex].avatar_url : null;
      if (avatarUrl) blocks.push({ type: 'profile', avatar_url: avatarUrl,
        observed_at: m.profile_observed_at || archive.captured_at, basis: 'message_response' });
      messages.push({ id: m.id, room_id: m.room_id, sent_at: m.sent_at, sender_type: 'ARTIST',
        text: m.text, blocks, deleted: !!m.deleted });
    }
    const incoming = { photos: [], videos: [] };
    for (const message of messages) for (const block of message.blocks) {
      if (block.type === 'photo') incoming.photos.push(block.asset_id);
      if (block.type === 'video') incoming.videos.push(block.asset_id);
    }
    const { error } = await supabase.rpc('import_weverse_dm', {
      p_room: room,
      p_messages: messages, p_profiles: profiles,
    });
    if (error) throw new Error(`${error.message} (DB: scripts/weverse-dm.sql)`);
    if (messages.length) {
      const {data:verified,error:verifyError}=await supabase.from('dm_messages').select('id')
        .eq('room_id',archive.room.id).in('id',messages.map(m=>m.id));
      if(verifyError) throw new Error(`저장 확인 실패: ${verifyError.message}`);
      const savedIds=new Set((verified || []).map(m=>m.id));
      const missing=messages.filter(m=>!savedIds.has(m.id));
      if(missing.length) throw new Error(`DB 요청 후에도 메시지 ${missing.length}개가 확인되지 않습니다. DM 저장 함수와 접근 권한을 확인해 주세요.`);
      for(const m of messages) {
        if(existingMessages.has(m.id)) stats.existingMessages++;
        else stats.newMessages++;
      }
    }
    // Empty string matches gallery defaults and satisfies NOT NULL. Retry also repairs the previous batch.
    for (const table of ['photos', 'videos']) for (let index = 0; index < incoming[table].length; index += 100) {
      const { error } = await supabase.from(table).update({ type: '' }).in('dm_asset_id', incoming[table].slice(index, index + 100)).eq('type', 'DM');
      if (error) throw new Error(`DM 자료는 가져왔지만 유형 초기화에 실패했습니다. ${error.message}`);
    }
    progress(Math.min(offset + 100, archive.messages.length), archive.messages.length);
    if (!archive.messages.length) break;
  }
  return stats;
}
