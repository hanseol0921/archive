function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function sameDMMessage(a, b) {
  if (!a || !b) return false;
  const content = row => ({id: row.id, room_id: row.room_id, sent_at: Date.parse(row.sent_at),
    sender_type: row.sender_type, text: row.text || '', deleted: !!row.deleted, blocks: row.blocks || []});
  return JSON.stringify(canonical(content(a))) === JSON.stringify(canonical(content(b)));
}

export function sameDMProfile(a, b) {
  if (!a || !b) return false;
  const content = row => ({id: row.id, observed_at: Date.parse(row.observed_at), name: row.name || '',
    official_name: row.official_name || '', status_emoji: row.status_emoji || '',
    avatar_url: row.avatar_url || null, official_avatar_url: row.official_avatar_url || null});
  return JSON.stringify(canonical(content(a))) === JSON.stringify(canonical(content(b)));
}
