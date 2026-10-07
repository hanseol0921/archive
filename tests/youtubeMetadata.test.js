import test from "node:test";
import assert from "node:assert/strict";
import { youtubeKstDate, sortYoutubeItems } from "../src/youtubeMetadata.js";
import handler from "../api/youtube-metadata.js";

test("YouTube upload dates cross midnight in KST regardless of browser timezone", () => {
  assert.equal(youtubeKstDate("2026-10-02T15:30:00Z"), "2026-10-03");
  assert.equal(youtubeKstDate("2026-10-02T14:30:00Z"), "2026-10-02");
  assert.equal(youtubeKstDate("invalid"), "");
});
test("sorts actual publication times and YouTube views, keeping unknown metadata last", () => {
  const items = [{ videoId: "a" }, { videoId: "unknown" }, { videoId: "b" }];
  const metadata = { a: { publishedAt: "2026-10-02T15:00:00Z", viewCount: 0 }, b: { publishedAt: "2026-10-02T14:00:00Z", viewCount: 500 } };
  assert.deepEqual(sortYoutubeItems(items, metadata, "최신순").map((i) => i.videoId), ["a", "b", "unknown"]);
  assert.deepEqual(sortYoutubeItems(items, metadata, "오래된순").map((i) => i.videoId), ["b", "a", "unknown"]);
  assert.deepEqual(sortYoutubeItems(items, metadata, "인기순").map((i) => i.videoId), ["b", "a", "unknown"]);
  assert.equal(items[1].videoId, "unknown");
});
test("stored automatic metadata works when refresh is unavailable; manual dates are ignored", () => {
  const items = [{ videoId: "a", publishedAt: "2025-01-01T00:00:00Z", viewCount: 200 }, { videoId: "b", date: "2030-01-01" }];
  assert.equal(sortYoutubeItems(items, {}, "최신순")[0].videoId, "a");
});
test("metadata endpoint rejects arbitrary URLs and oversized batches before any upstream request", async () => {
  for (const ids of ["https://evil.test", Array.from({ length: 51 }, (_, i) => String(i).padStart(11, "0")).join(",")]) {
    const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handler({ method: "GET", query: { ids }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
  }
});
