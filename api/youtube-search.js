import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import { isArchiveAdmin } from '../src/adminAccess.js';

const cache = new Map();
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return reply(405, { error: 'GET 요청만 허용됩니다.' }); }
  const q = String(req.query?.q || '').trim();
  const page = String(req.query?.page || '');
  if (!q || q.length > 150 || !/^[\w=-]{0,200}$/.test(page)) return reply(400, { error: '검색어는 1~150자로 입력해주세요.' });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: '관리자 로그인이 필요합니다.' });
  if (!process.env.YOUTUBE_API_KEY || !process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) return reply(503, { error: '서버의 YouTube API 설정을 확인해주세요.' });
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return reply(401, { error: '관리자 로그인이 만료되었습니다.' });
    if (!isArchiveAdmin(data.user)) return reply(403, { error: '관리자만 검색할 수 있습니다.' });
    const key = JSON.stringify([q, page]);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return reply(200, cached.value);
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({ part: 'snippet', type: 'video', q, maxResults: '12',
      videoEmbeddable: 'true', relevanceLanguage: 'ko', key: process.env.YOUTUBE_API_KEY,
      ...(page ? { pageToken: page } : {}),
      fields: 'nextPageToken,items(id/videoId,snippet(title,channelTitle,publishedAt,thumbnails/medium/url))' }).toString();
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const result = await upstream.json();
    if (!upstream.ok) {
      const reason = result.error?.errors?.[0]?.reason;
      return reply(502, { error: ['quotaExceeded', 'dailyLimitExceeded'].includes(reason)
        ? '유튜브 검색 할당량을 초과했습니다. 나중에 다시 시도하거나 링크를 직접 입력해주세요.'
        : '유튜브 검색에 실패했습니다. API 설정을 확인하거나 링크를 직접 입력해주세요.' });
    }
    const value = { items: (result.items || []).filter(item => /^[\w-]{11}$/.test(item.id?.videoId || '')).map(item => ({
      id: item.id.videoId, title: item.snippet?.title || '', channel: item.snippet?.channelTitle || '',
      publishedAt: item.snippet?.publishedAt || null,
      thumbnail: `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`,
    })), nextPage: result.nextPageToken || '' };
    cache.set(key, { expires: Date.now() + 10 * 60 * 1000, value });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return reply(200, value);
  } catch { return reply(502, { error: '유튜브 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
}
