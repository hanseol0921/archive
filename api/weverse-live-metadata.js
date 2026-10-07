import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import { Buffer } from "node:buffer";
import { isArchiveAdmin } from "../src/adminAccess.js";
import { parseYoutubeContents, weverseLiveUrl } from "../src/youtubeContent.js";
import { parseLiveMetadata } from "../src/weverseLiveMetadata.js";

const cache = new Map();
export default async function handler(req, res) {
  const reply = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return reply(405, { error: "GET 요청만 허용됩니다." }); }
  const url = weverseLiveUrl(String(req.query?.url || ""));
  if (!url) return reply(400, { error: "올바른 위버스 라이브 링크가 아닙니다." });
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) return reply(503, { error: "서버 설정이 필요합니다." });
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    let admin = false;
    if (token) { const { data, error } = await db.auth.getUser(token); admin = !error && isArchiveAdmin(data.user); }
    if (!admin) {
      const { data, error } = await db.from("site_settings").select("value").eq("key", "youtube_contents").maybeSingle();
      if (error) throw error;
      if (!parseYoutubeContents(data?.value).some((item) => weverseLiveUrl(item.url) === url)) return reply(403, { error: "등록된 라이브만 조회할 수 있습니다." });
    }
    if (!cache.has(url) || cache.get(url).expires <= Date.now()) {
      let target = url;
      let upstream;
      const signal = AbortSignal.timeout(15000);
      for (let redirects = 0; redirects < 4; redirects++) {
        upstream = await fetch(target, { signal, redirect: "manual", headers: { "User-Agent": "Googlebot", Accept: "text/html" } });
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
        const next = new URL(upstream.headers.get("location"), target);
        await upstream.body?.cancel();
        if (next.protocol !== "https:" || next.port || next.username || next.password || !["weverse.io", "wev3s.weverse.io"].includes(next.hostname)) throw new Error();
        target = next.href;
      }
      if (!upstream.ok) throw new Error();
      const reader = upstream.body.getReader();
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
      const data = parseLiveMetadata(Buffer.concat(chunks).toString("utf8"));
      if (!data.thumbnail) throw new Error();
      cache.set(url, { expires: Date.now() + 3600000, data });
      if (cache.size > 1000) cache.delete(cache.keys().next().value);
    }
    if (!token) res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return reply(200, cache.get(url).data);
  } catch { return reply(502, { error: "라이브 썸네일을 가져오지 못했습니다. 잠시 후 다시 시도해주세요." }); }
}
