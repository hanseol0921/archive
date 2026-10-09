import test from "node:test";
import assert from "node:assert/strict";
import { videoSourceTags, withVideoSourceTags } from "../src/videoClassification.js";
import { parseVideoFolders, weverseFolderMatches } from "../src/youtubeContent.js";
test("Moment and DM metadata attach canonical tags without duplicates", () => {
  assert.deepEqual(withVideoSourceTags({ type: "moment", tags: ["리우"] }).tags, ["리우", "모먼트"]);
  assert.deepEqual(withVideoSourceTags({ dm_asset_id: "asset", tags: ["DM"] }).tags, ["DM"]);
  assert.deepEqual(videoSourceTags({ search_tags: ["dm"] }), ["DM"]);
  assert.deepEqual(videoSourceTags({}, null, "백업/DM/2026"), ["DM"]);
  assert.deepEqual(videoSourceTags({ type: "직캠", video_url: "https://example.com/admin/video.mp4" }), []);
});
test("saved folder tags are recognized without creating extra folders", () => {
  const folders = parseVideoFolders([{ id: "weverse", name: "위버스", parentId: null }, { id: "youtube", name: "유튜브", parentId: null }, { id: "old", name: "모먼트", parentId: "weverse" }]);
  assert.equal(folders.filter((folder) => folder.autoTag === "모먼트").length, 1);
  assert.equal(folders.find((folder) => folder.id === "old").autoTag, "모먼트");
  assert.equal(folders.some((folder) => folder.autoTag === "DM"), false);
  assert.equal(weverseFolderMatches(folders, "old", { type: "moment" }), true);
});

test("missing folder settings never create initial folders", () => { assert.deepEqual(parseVideoFolders(null), []); assert.deepEqual(parseVideoFolders(""), []); assert.deepEqual(parseVideoFolders([]), []); });
