export const WEVERSE_ARTIST = 'c630d3be61c5953b1b70c3b4c96479e2';
export function postTimestamp(post) { return post.posted_at || (post.date ? `${post.date}T00:00:00+09:00` : null); }

export function sourcePostId(url) {
  try {
    const parsed = new URL(url);
    if (!['weverse.io','www.weverse.io'].includes(parsed.hostname)) return null;
    return parsed.pathname.split('/').find(part => /^\d+-\d+$/.test(part)) || null;
  } catch { return null; }
}

export function resolveWeverseProfile(snapshots, overrides, at, sourceId=null) {
  const time = Date.parse(at);
  const manual = overrides.filter(p => time >= Date.parse(p.from_at) && time <= Date.parse(p.through_at))
    .sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (manual) return {...manual,time_basis:'manual'};
  const ordered = [...snapshots].sort((a,b) => Date.parse(a.effective_at || a.observed_at) - Date.parse(b.effective_at || b.observed_at));
  const verified=ordered.filter(p=>p.time_basis==='verified'&&Date.parse(p.effective_at)<=time).at(-1);
  if(verified)return verified;
  const captured=ordered.find(p=>sourceId && p.post_ids?.includes(sourceId));
  if(captured)return captured;
  return ordered.filter(p => Date.parse(p.effective_at || p.observed_at) <= time).at(-1) || ordered.find(p=>p.time_basis==='observed') || null;
}

export function commentThread(rows) {
  const byId = new Map(rows.map(row => [row.id,{...row,children:[]}])) ;
  const roots = [];
  for (const row of byId.values()) {
    const parent = byId.get(row.parent_comment_id);
    let cursor = parent;
    const seen = new Set([row.id]);
    while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); cursor = byId.get(cursor.parent_comment_id); }
    if (parent && !cursor) parent.children.push(row);
    else roots.push(row);
  }
  function sort(nodes) {
    nodes.sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at) || a.id.localeCompare(b.id));
    for (const node of nodes) sort(node.children);
    return nodes;
  }
  return sort(roots);
}

export function kstInput(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time+9*3600000).toISOString().slice(0,16) : '';
}

export function inputToUTC(value,endOfMinute=false) {
  const date = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(date.getTime())) throw new Error('기간을 확인해 주세요.');
  return new Date(date.getTime()+(endOfMinute?59999:0)).toISOString();
}
