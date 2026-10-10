export function collectDMMedia(messages, type = 'all') {
  return [...messages].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at) || b.id.localeCompare(a.id))
    .flatMap(message => message.deleted ? [] : (message.blocks || []).flatMap((block, index) =>
      ['photo', 'video', 'audio'].includes(block.type) && block.url && (type === 'all' || block.type === type)
        ? [{ id: `${message.id}:${index}`, sent_at: message.sent_at, block }] : []));
}

export function displayMessages(messages) {
  return messages.flatMap(message => {
    const profile = message.blocks.filter(b => b.type === 'profile');
    const groups = new Map();
    for (const block of message.blocks) {
      if (block.type === 'profile') continue;
      const index = block.body_index ?? 0;
      if (!groups.has(index)) groups.set(index, []);
      groups.get(index).push(block);
    }
    if (!groups.size) groups.set(0, []);
    return [...groups.entries()].map(([index, blocks]) => ({ ...message,
      id: `${message.id}#${index}`, source_id: message.id, body_index: index, blocks: [...blocks, ...profile] }));
  });
}

export function sameMessageGroup(a, b, aProfile, bProfile) {
  return !!a && !!b && a.room_id === b.room_id
    && Math.floor(Date.parse(a.sent_at) / 60000) === Math.floor(Date.parse(b.sent_at) / 60000)
    && aProfile?.avatar_url === bProfile?.avatar_url
    && aProfile?.name === bProfile?.name
    && aProfile?.status_emoji === bProfile?.status_emoji;
}

export function messageSpacing(current, previous) {
  if (!previous) return 'normal';
  const time = Date.parse(current.sent_at);
  const before = Date.parse(previous.sent_at);
  if (time - before >= 60 * 60 * 1000) return 'long';
  if (Math.floor(time / 60000) === Math.floor(before / 60000)) return 'tight';
  return 'normal';
}

export async function collectDMPages(fetchPage, startCursor = null, all = false) {
  const rows = [];
  const seen = new Set();
  let cursor = startCursor;
  let size;
  do {
    const page = await fetchPage(cursor);
    size = page.length;
    rows.push(...page);
    if (size) {
      const last = page.at(-1);
      const key = `${last.sent_at}:${last.id}`;
      if (seen.has(key)) throw new Error('DM 페이지가 반복되어 불러오기를 중단했습니다.');
      seen.add(key);
      cursor = { sent_at: last.sent_at, id: last.id };
    }
  } while (all && size === 100);
  return { rows, cursor, more: size === 100 };
}
