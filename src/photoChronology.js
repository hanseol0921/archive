export function dmMessageId(photo) {
  return photo.dm_asset_id?.match(/^(.+):\d+$/)?.[1] || null;
}

export async function attachDMPhotoTimes(client, photos) {
  const ids = [...new Set(photos.map(dmMessageId).filter(Boolean))];
  const times = new Map();
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await client.from('dm_messages').select('id,sent_at').in('id', ids.slice(start, start + 100));
    if (error) throw error;
    for (const message of data || []) times.set(message.id, message.sent_at);
  }
  return photos.map(photo => times.has(dmMessageId(photo))
    ? { ...photo, dm_sent_at: times.get(dmMessageId(photo)) } : photo);
}

export function photoSourceTime(photo, postTimes) {
  if (photo.dm_sent_at) {
    const time = Date.parse(photo.dm_sent_at);
    if (Number.isFinite(time)) return time;
  }
  return postTimes[String(photo.post_id)]?.postedTime || 0;
}
