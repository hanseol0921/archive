import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import process from "node:process";

const MAX_PHOTO_BYTES = 50 * 1024 * 1024;

// Only proxy public photos from our own storage, never arbitrary URLs.
export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end();
  }
  let url;
  try {
    url = new URL(request.query.url);
    const r2Base = new URL(process.env.R2_PUBLIC_BASE_URL || "https://media.riwooarchive.com");
    const supabaseBase = process.env.VITE_SUPABASE_URL && new URL(process.env.VITE_SUPABASE_URL);
    const isR2 = url.origin === r2Base.origin && url.pathname.startsWith(`${r2Base.pathname.replace(/\/$/, "")}/photos/`);
    const isSupabase = supabaseBase && url.origin === supabaseBase.origin
      && url.pathname.startsWith("/storage/v1/object/public/photos/");
    if (url.protocol !== "https:" || url.username || url.password || (!isR2 && !isSupabase)) {
      return response.status(400).end("Invalid photo URL");
    }
  } catch {
    return response.status(400).end("Invalid photo URL");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const abort = () => { if (!response.writableFinished) controller.abort(); };
  response.on("close", abort);
  try {
    const upstream = await fetch(url, { redirect: "error", signal: controller.signal });
    if (!upstream.ok || !upstream.body) return response.status(502).end("Photo unavailable");
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      await upstream.body.cancel();
      return response.status(502).end("Invalid photo response");
    }
    if (Number(upstream.headers.get("content-length")) > MAX_PHOTO_BYTES) {
      await upstream.body.cancel();
      return response.status(413).end("Photo exceeds 50 MB");
    }
    const fileName = String(request.query.filename || "photo.jpg")
      .replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 180);
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");
    let bytes = 0;
    const sizeLimit = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_PHOTO_BYTES) {
          controller.abort();
          callback(new Error("Photo exceeds 50 MB"));
        } else callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(upstream.body), sizeLimit, response);
  } catch (error) {
    console.error("Photo download failed", error);
    if (!response.headersSent) response.status(502).end("Photo download failed");
    else response.destroy();
  } finally {
    clearTimeout(timer);
    response.off("close", abort);
  }
}
