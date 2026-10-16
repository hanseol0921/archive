import {sourcePostId, WEVERSE_ARTIST} from './weverseData.js';

export const WORD_SOURCES = {all: '전체', dm: 'DM', posts: '게시글', comments: '댓글'};

export function wordsIn(text, excludeSingle = false, includeInitials = false) {
  const clean = String(text || '').normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
  const pattern = includeInitials ? /[가-힣]+|[a-z]+(?:'[a-z]+)?|[\u1100-\u11ff\u3130-\u318f]+/g : /[가-힣]+|[a-z]+(?:'[a-z]+)?/g;
  return (clean.match(pattern) || [])
    .map(word => word.replace(/[\u1100-\u1112\u1161-\u1175]/g, char => {
      const code = char.codePointAt(0);
      return code <= 0x1112 ? 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[code - 0x1100] : 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'[code - 0x1161];
    }))
    .filter(word => !excludeSingle || [...word].length > 1);
}

export function wordDocuments({dm = [], posts = [], comments = []}) {
  const result = [];
  const seen = new Set();
  function add(source, id, time, text) {
    const key = `${source}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (text.trim()) result.push({source, id, time, text});
  }
  for (const row of dm) {
    if (row.deleted || row.sender_type !== 'ARTIST') continue;
    let previousBody;
    const text = Array.isArray(row.blocks) && row.blocks.length
      ? row.blocks.map(block => {
        const boundary = previousBody !== undefined && previousBody !== block.body_index ? '\n' : '';
        previousBody = block.body_index;
        return boundary + (block.type === 'text' ? block.text || '' : ' ');
      }).join('')
      : row.text || '';
    add('dm', row.id, row.sent_at, text);
  }
  for (const row of posts) {
    const pollText = (row.content_blocks || []).filter(b => b.type === 'poll')
      .flatMap(b => [b.question || '', ...(b.options || []).map(o => o.text || '')]);
    const text = [row.content || '', ...pollText].join('\n');
    add('posts', sourcePostId(row.weverse_url) || row.id, row.posted_at || `${row.date}T00:00:00+09:00`, text);
  }
  for (const row of comments) {
    if (row.is_target_artist !== true) continue;
    add('comments', row.id, row.created_at, row.text || '');
  }
  return result;
}

export function rankWords(documents, {source = 'all', from = '', through = '', excludeSingle = false, includeInitials = false, search = ''} = {}) {
  const start = from ? Date.parse(`${from}T00:00:00+09:00`) : -Infinity;
  const end = through ? Date.parse(`${through}T23:59:59.999+09:00`) : Infinity;
  const counts = new Map();
  const sources = {dm: 0, posts: 0, comments: 0};
  let total = 0;
  for (const doc of documents) {
    if (source !== 'all' && doc.source !== source) continue;
    const time = Date.parse(doc.time);
    if ((from || through) && (!Number.isFinite(time) || time < start || time > end)) continue;
    sources[doc.source] += 1;
    const unique = new Set();
    for (const word of wordsIn(doc.text, excludeSingle, includeInitials)) {
      const entry = counts.get(word) || {word, count: 0, documents: 0, dm: 0, posts: 0, comments: 0};
      entry.count += 1;
      entry[doc.source] += 1;
      if (!unique.has(word)) { entry.documents += 1; unique.add(word); }
      counts.set(word, entry);
      total += 1;
    }
  }
  const rows = [...counts.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ko'));
  let rank = 0;
  const query = search.trim().normalize('NFKC').toLowerCase();
  const ranked = rows.map((row, i) => {
    if (!i || row.count !== rows[i - 1].count) rank = i + 1;
    return {...row, rank};
  });
  return {rows: ranked.filter(row => row.word.includes(query)), total, unique: counts.size, sources};
}

export function rankingCSV(rows) {
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  return '\uFEFF' + [['순위', '단어', '횟수', '사용한 글 수', 'DM', '게시글', '댓글'],
    ...rows.map(row => [row.rank, row.word, row.count, row.documents, row.dm, row.posts, row.comments])]
    .map(row => row.map(quote).join(',')).join('\r\n');
}

export async function loadWordRows(client, enabled, signal, progress = () => {}) {
  const result = {dm: [], posts: [], comments: []};
  const definitions = {
    dm: ['dm_messages', 'id,sent_at,sender_type,text,blocks,deleted', q => q.eq('room_id', 'WRBQM41').eq('sender_type', 'ARTIST').eq('deleted', false)],
    posts: ['weverse_posts', 'id,posted_at,date,content,content_blocks,weverse_url,is_diary', q => {
      if (!enabled.diary) return q.or('is_diary.is.null,is_diary.eq.false');
      if (!enabled.posts) return q.eq('is_diary', true);
      return q;
    }],
    comments: ['weverse_comments', 'id,created_at,text,is_target_artist', q => q.eq('is_target_artist', true).eq('artist_member_id', WEVERSE_ARTIST)],
  };
  for (const [source, [table, fields, filter]] of Object.entries(definitions)) {
    if (!(source === 'posts' ? enabled.posts || enabled.diary : enabled[source])) continue;
    for (let offset = 0; ; offset += 500) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const {data, error} = await filter(client.from(table).select(fields)).order('id').range(offset, offset + 499).abortSignal(signal);
      if (error) throw new Error(`${WORD_SOURCES[source]}: ${error.message}`);
      result[source].push(...data);
      progress(Object.values(result).reduce((sum, rows) => sum + rows.length, 0));
      if (data.length < 500) break;
    }
  }
  return wordDocuments(result);
}
