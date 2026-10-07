import test from "node:test";
import assert from "node:assert/strict";
import { ROOT_VIDEO_FOLDERS, moveVideoFolder, folderDescendants } from "../src/youtubeContent.js";
const folders = [...ROOT_VIDEO_FOLDERS, { id: "a", name: "A", parentId: "youtube", videoIds: ["1"] }, { id: "b", name: "B", parentId: "youtube" }, { id: "child", name: "child", parentId: "a" }];
test("moving a folder preserves child folders and video assignments", () => {
  const next = moveVideoFolder(folders, "a", "b");
  assert.equal(next.find((item) => item.id === "a").parentId, "b");
  assert.deepEqual(next.find((item) => item.id === "a").videoIds, ["1"]);
  assert.ok(folderDescendants(next, "b").has("child"));
});
test("sibling order can change without changing the parent", () => {
  const next = moveVideoFolder(folders, "b", "youtube", "a");
  assert.deepEqual(next.filter((item) => item.parentId === "youtube").map((item) => item.id), ["b", "a"]);
});
test("cycles, missing destinations and incompatible media folders are rejected", () => {
  for (const parent of ["a", "child", "missing", "weverse", "weverse-live"]) assert.throws(() => moveVideoFolder(folders, "a", parent));
  assert.throws(() => moveVideoFolder(folders, "youtube", "a"));
});
