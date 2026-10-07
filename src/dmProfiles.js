export function messageProfile(message, profiles, overrides = []) {
  const at = Date.parse(message.sent_at);
  const override = overrides.filter(p => {
    if (p.room_id !== message.room_id) return false;
    if (p.from_sent_at) {
      const start = Date.parse(p.from_sent_at);
      if (at < start) return false;
      if (at === start) {
        const id = message.source_id || message.id;
        if (id < p.from_message_id || (id === p.from_message_id && (message.body_index ?? 0) < (p.from_body_index ?? 0))) return false;
      }
    }
    const end = Date.parse(p.through_sent_at);
    if (at !== end) return at < end;
    const id = message.source_id || message.id;
    if (id !== p.through_message_id) return id < p.through_message_id;
    return (message.body_index ?? 0) <= p.through_body_index;
  }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id))[0];
  if (override) return { ...override, basis: 'manual' };
  const applicable = profiles.filter(p => Date.parse(p.observed_at) <= at)
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
  const attached = message.blocks?.find(b => b.type === 'profile');
  if (applicable) return { ...applicable, basis: 'observed' };
  if (attached?.avatar_url) return { avatar_url: attached.avatar_url, name: '', status_emoji: '',
    observed_at: attached.observed_at, basis: 'message_response' };
  // An image fallback is not evidence of the artist's profile at the time of an old message.
  return { avatar_url: profiles[0]?.avatar_url, name: '', status_emoji: '', basis: 'unknown' };
}

export function profileEvidence(profile) {
  if (profile.basis === 'manual') return '관리자가 지정한 이전 프로필';
  if (profile.basis === 'observed') return '수집 시점 기준 프로필';
  if (profile.basis === 'message_response') return '메시지 수집 응답의 프로필 · 당시 프로필 여부 미확인';
  return '당시 프로필 미확인 · 현재 저장된 사진';
}

export function effectiveProfileHistory(messages, profiles, overrides) {
  const active = new Map();
  const chronological = [...messages].sort((a,b) => Date.parse(a.sent_at)-Date.parse(b.sent_at)
    || (a.source_id || a.id).localeCompare(b.source_id || b.id) || (a.body_index ?? 0)-(b.body_index ?? 0));
  for (const message of chronological) {
    const p = messageProfile(message, profiles, overrides);
    if (!p.avatar_url) continue;
    const key = JSON.stringify([p.avatar_url,p.name || '',p.status_emoji || '']);
    active.delete(key);
    active.set(key,{...p,id:p.id || key});
  }
  return [...active.values()];
}
