import test from "node:test";
import assert from "node:assert/strict";
import { isPendingMedia, managedMediaValues, mediaDate, normalizeManagedMedia } from "../src/mediaManager.js";

test("photo and video with the same database ID have different selection keys", () => {
  const photo = normalizeManagedMedia({ id: 7 }, "photos");
  const video = normalizeManagedMedia({ id: 7 }, "videos");
  assert.notEqual(photo.id, video.id);
  assert.equal(photo.originalId, 7);
  assert.equal(video.originalId, 7);
});
test("video month follows the post date or DM time in Korea", () => {
  assert.equal(mediaDate({ dm_sent_at: "2026-09-30T15:01:00Z" }), "2026-10-01");
  assert.equal(mediaDate({ created_at: "2026-09-30T15:01:00Z" }), "2026-10-01");
  assert.equal(mediaDate({ post_id: 1 }, { date: "2026-09-30" }), "2026-09-30");
});
test("video editing never writes photo-only columns or a picture type", () => {
  const video = normalizeManagedMedia({ id: 7, type: "DM", tags: [], hair_color: "금발" }, "videos");
  const values = managedMediaValues(video);
  assert.equal(values.hair_color, "금발");
  assert.deepEqual(values.tags, ["DM"]);
  for (const field of ["type", "archive_visible", "weverse_url", "crop_position", "id", "date"]) assert.equal(field in values, false);
});
test("screenshot and duplicate photos are hidden on save and crop is retained", () => {
  for (const type of ["스크린샷", "같은사진"]) {
    const values = managedMediaValues(normalizeManagedMedia({ id: 7, type, archive_visible: true, crop_position: "20% 70%" }, "photos"));
    assert.equal(values.archive_visible, false);
    assert.equal(values.crop_position, "20% 70%");
  }
});
test("pending photos leave after type assignment; pending videos leave after hair or content tag assignment", () => {
  assert.equal(isPendingMedia({ table: "photos", type: null }), true);
  assert.equal(isPendingMedia({ table: "photos", type: "리우뷰" }), false);
  assert.equal(isPendingMedia({ table: "videos", tags: ["DM"] }), true);
  assert.equal(isPendingMedia({ table: "videos", tags: ["DM", "리우"] }), false);
  assert.equal(isPendingMedia({ table: "videos", tags: ["DM"], hair_color: "흑발" }), false);
});
