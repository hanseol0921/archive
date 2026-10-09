import { ROOT_VIDEO_FOLDERS } from "./videoFolderFixtures.js";
import test from "node:test";
import assert from "node:assert/strict";
import { weverseLiveUrl, parseYoutubeContents, parseVideoFolders, folderSource } from "../src/youtubeContent.js";
import { parseLiveMetadata } from "../src/weverseLiveMetadata.js";

test("live preview extracts reordered metadata attributes and validates image hosts", () => {
  assert.deepEqual(parseLiveMetadata('<meta content="https://phinf.wevpstatic.net/thumb.jpg?a=1&amp;b=2" property="og:image"><meta property="og:description" content="피카츄 &amp; 리우">'), { thumbnail: "https://phinf.wevpstatic.net/thumb.jpg?a=1&b=2", title: "피카츄 & 리우" });
  assert.equal(parseLiveMetadata('<meta property="og:image" content="https://evil.com/image.jpg">').thumbnail, "");
});

test("live links accept only Weverse HTTPS live pages and remove tracking", () => {
  assert.equal(weverseLiveUrl("https://weverse.io/boynextdoor/live/1-180676393?hl=ko"), "https://weverse.io/boynextdoor/live/1-180676393");
  for (const url of ["http://weverse.io/boynextdoor/live/1-1", "https://weverse.io.evil.com/boynextdoor/live/1-1", "https://user@weverse.io/boynextdoor/live/1-1", "https://weverse.io/boynextdoor/feed/1-1"]) assert.equal(weverseLiveUrl(url), null);
});
test("saved live folders remain intact and nested folders inherit its source", () => {
  const old = ROOT_VIDEO_FOLDERS.filter((folder) => folder.autoTag !== "라이브");
  assert.equal(parseVideoFolders(old).some((folder) => folder.autoTag === "라이브"), false);
  const migrated = parseVideoFolders(ROOT_VIDEO_FOLDERS);
  const next = parseVideoFolders([...migrated, { id: "live-child", name: "2026", parentId: "weverse-live" }]);
  assert.equal(next.filter((folder) => folder.autoTag === "라이브").length, 1);
  assert.equal(folderSource(next, "live-child"), "live");
  assert.equal(folderSource(next, "weverse-posts"), "weverse");
});
test("mixed link lists preserve existing YouTube content", () => {
  const items = [{ id: "youtube", title: "기존 영상", url: "https://youtu.be/abcdefghijk" }, { id: "live", title: "피카츄", url: "https://weverse.io/boynextdoor/live/1-180676393" }];
  assert.deepEqual(parseYoutubeContents(JSON.stringify(items)), items);
  assert.throws(() => parseYoutubeContents([{ id: "bad", title: "bad", url: "https://evil.com" }]));
});
