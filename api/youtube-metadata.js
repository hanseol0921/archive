import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import { isArchiveAdmin } from "../src/adminAccess.js";
import { parseYoutubeContents, youtubeVideoId } from "../src/youtubeContent.js";

const cache = new Map();
const TTL = 60 * 60 * 1000;
export default async function handler(req, res) {
  const reply = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return reply(405, { error: "GET 요청만 허용됩니다." }); }
  const ids = [...new Set(String(req.query?.ids || "").split(","))];
  if (!ids.length || ids.length > 50 || ids.some((id) => !/^[\w-]{11}$/.test(id))) return reply(400, { error: "영상 ID가 올바르지 않습니다." });
  if (!process.env.YOUTUBE_API_KEY) return reply(503, { error: "서버에 YOUTUBE_API_KEY를 설정하면 업로드일과 조회수를 자동으로 가져옵니다." });
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) return reply(503, { error: "유튜브 조회 서버 설정이 필요합니다." });
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    let admin = false;
    if (token) { const { data, error } = await db.auth.getUser(token); admin = !error && isArchiveAdmin(data.user); }
    if (!admin) {
      const { data, error } = await db.from("site_settings").select("value").eq("key", "youtube_contents").maybeSingle();
      if (error) throw new Error();
      const allowed = new Set(parseYoutubeContents(data?.value).map((item) => youtubeVideoId(item.url)));
      if (ids.some((id) => !allowed.has(id))) return reply(403, { error: "등록된 콘텐츠만 조회할 수 있습니다." });
    }
    const missing = ids.filter((id) => !cache.has(id) || cache.get(id).expires <= Date.now());
    if (missing.length) {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.search = new URLSearchParams({ part: "snippet,statistics", id: missing.join(","), key: process.env.YOUTUBE_API_KEY, fields: "items(id,snippet(title,publishedAt),statistics(viewCount))" }).toString();
      const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) return reply(502, { error: "유튜브 정보를 가져오지 못했습니다. API 설정과 할당량을 확인해주세요." });
      const data = await upstream.json();
      const fetchedAt = new Date().toISOString();
      for (const id of missing) {
        const video = data.items?.find((item) => item.id === id);
        const count = Number(video?.statistics?.viewCount);
        cache.set(id, { expires: Date.now() + TTL, value: video ? { title: video.snippet?.title || "", publishedAt: video.snippet?.publishedAt || null, viewCount: Number.isFinite(count) && count >= 0 ? count : null, fetchedAt } : { unavailable: true, fetchedAt } });
      }
      if (cache.size > 2000) for (const id of [...cache.keys()].slice(0, cache.size - 2000)) cache.delete(id);
    }
    if (!token) res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return reply(200, { videos: Object.fromEntries(ids.map((id) => [id, cache.get(id)?.value])) });
  } catch { return reply(502, { error: "유튜브 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요." }); }
}
