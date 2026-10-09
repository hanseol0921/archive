import { ROOT_VIDEO_FOLDERS } from "./videoFolderFixtures.js";
import test from "node:test";
import assert from "node:assert/strict";
import { youtubeVideoId, parseYoutubeContents, parseVideoFolders, folderDescendants, folderSource, weverseFolderMatches } from "../src/youtubeContent.js";

test("Weverse posts folder automatically includes ordinary videos and excludes DM and Moments", () => {
  const folders = parseVideoFolders(ROOT_VIDEO_FOLDERS);
  assert.equal(weverseFolderMatches(folders, "weverse-posts", { id: 1 }), true);
  assert.equal(weverseFolderMatches(folders, "weverse-posts", { id: 2, tags: ["모먼트"] }), false);
  assert.equal(weverseFolderMatches(folders, "weverse-posts", { id: 3, dm_asset_id: "dm-1" }), false);
  assert.equal(weverseFolderMatches(folders, "weverse-posts", { id: 4 }, { weverse_url: "https://weverse.io/moment/4" }), false);
  const oldFolders = ROOT_VIDEO_FOLDERS.filter((folder) => folder.id !== "weverse-posts");
  assert.equal(parseVideoFolders(oldFolders).some((folder) => folder.autoTag === "포스트"), false);
  const renamed = folders.map((folder) => folder.id === "weverse-posts" ? { ...folder, name: "게시 영상", videoIds: ["2"] } : folder);
  assert.equal(weverseFolderMatches(renamed, "weverse-posts", { id: 1 }), true);
  assert.equal(weverseFolderMatches(renamed, "weverse-posts", { id: 2, tags: ["모먼트"] }), false);
});

test("supported YouTube URL formats normalize to a video ID", () => {
  for (const url of ["https://www.youtube.com/watch?v=ptDnd4lGr-k&t=30", "https://youtu.be/ptDnd4lGr-k?si=abc", "https://youtube.com/shorts/ptDnd4lGr-k", "https://m.youtube.com/live/ptDnd4lGr-k", "https://youtube.com/embed/ptDnd4lGr-k"]) assert.equal(youtubeVideoId(url), "ptDnd4lGr-k");
});
test("Weverse subfolders support Moment tags and manual assignments", () => {
  const folders = parseVideoFolders([...ROOT_VIDEO_FOLDERS, { id: "moments", name: "모먼트", parentId: "weverse" }, { id: "manual", name: "직캠", parentId: "weverse", videoIds: ["42"] }]);
  assert.equal(folderSource(folders, "moments"), "weverse");
  assert.equal(weverseFolderMatches(folders, "moments", { id: 1, tags: ["모먼트"] }), true);
  assert.equal(weverseFolderMatches(folders, "moments", { id: 2 }), false);
  assert.equal(weverseFolderMatches(folders, "manual", { id: 42 }), true);
  assert.equal(weverseFolderMatches(folders, "weverse", { id: 2 }), true);
});
test("non-YouTube hosts, credentials and invalid video IDs are rejected", () => {
  for (const url of ["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=ptDnd4lGr-k", "https://evil.test/watch?v=ptDnd4lGr-k", "https://user@youtube.com/watch?v=ptDnd4lGr-k", "https://youtu.be/abc", "https://youtube.com/playlist?list=123"]) assert.equal(youtubeVideoId(url), null);
});
test("bad stored content does not silently become an empty writable list", () => {
  assert.deepEqual(parseYoutubeContents(null), []);
  assert.throws(() => parseYoutubeContents("broken"));
  assert.throws(() => parseYoutubeContents('[{"id":"a","title":"a","url":"https://evil.test"}]'));
});
test("nested folders include descendants and reject cycles or missing parents", () => {
  const folders = [...ROOT_VIDEO_FOLDERS, { id: "a", name: "커버", parentId: "youtube" }, { id: "b", name: "2026", parentId: "a" }];
  assert.deepEqual([...folderDescendants(parseVideoFolders(folders), "youtube")], ["youtube", "a", "b"]);
  assert.throws(() => parseVideoFolders([...ROOT_VIDEO_FOLDERS, { id: "a", name: "a", parentId: "b" }, { id: "b", name: "b", parentId: "a" }]));
  assert.throws(() => parseVideoFolders([...ROOT_VIDEO_FOLDERS, { id: "a", name: "a", parentId: "missing" }]));
});
