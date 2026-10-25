import test from "node:test";
import assert from "node:assert/strict";
import { getPhotoExtraGroups, isPhotoVisible, shouldMigrateToRiwooView } from "../src/photoVisibility.js";

test("excluded photos cannot be restored by any extra selection", () => {
  const all = { members: true, food: true, scenery: true, dogs: true, other: true, dm: true };
  for (const tag of ["음식", "풍경", "그 외", "DM", "짱이", "운학"]) {
    assert.equal(isPhotoVisible({ tags: [tag], archive_visible: false }, all, all), false);
  }
});
test("base view shows ungrouped photos, extras require both visitor selection and publication permission", () => {
  assert.equal(isPhotoVisible({ tags: ["리우"] }), true);
  assert.equal(getPhotoExtraGroups({ tags: ["리우"] }).other, false);
  const food = { tags: ["음식"], archive_visible: true };
  assert.equal(isPhotoVisible(food), false);
  assert.equal(isPhotoVisible(food, { food: true }, { food: true }), true);
  assert.equal(isPhotoVisible(food, { food: true }, { food: false }), false);
  assert.equal(isPhotoVisible({ tags: ["그 외"] }, { other: true }), true);
});
test("DM is blocked even when displayed and all visitor extras are selected", () => {
  assert.equal(isPhotoVisible({ dm_asset_id: "asset", archive_visible: true }, { dm: true }, { dm: false }), false);
  assert.equal(isPhotoVisible({ tags: ["DM"] }, { dm: true }), false);
});

test("Riwoo view without a named extra group belongs to other; Riwoo portraits remain in the base view", () => {
  const view = { type: "리우뷰", tags: ["책"] };
  assert.equal(isPhotoVisible(view), false);
  assert.equal(isPhotoVisible(view, { other: true }), true);
  assert.equal(isPhotoVisible({ type: "리우뷰", tags: ["음식"] }, { other: true }), false);
  assert.equal(isPhotoVisible({ type: "셀카", tags: ["짱대박"] }), true);
  assert.equal(isPhotoVisible({ type: "스크린샷", archive_visible: true }, { other: true }), false);
  assert.equal(isPhotoVisible({ type: "같은사진", archive_visible: true }, { other: true }), false);
});
test("food/scenery conversion leaves dogs and DM unchanged", () => {
  assert.equal(shouldMigrateToRiwooView({ tags: ["음식"] }), true);
  assert.equal(shouldMigrateToRiwooView({ tags: ["풍경"] }), true);
  for (const tag of ["짱대박", "짱이", "대박이", "DM"]) assert.equal(shouldMigrateToRiwooView({ tags: ["음식", tag] }), false);
  assert.equal(shouldMigrateToRiwooView({ tags: ["풍경"], dm_asset_id: "asset" }), false);
});

test("meme photos stay hidden regardless of extra selection", () => { assert.equal(isPhotoVisible({type:"짤",archive_visible:true,tags:["음식"]},{food:true},{food:true}),false); });


test('published DM portraits appear without requiring a visitor DM checkbox, while hidden media stay hidden', () => {
  const portrait = { dm_asset_id:'message:0', type:'셀카', tags:['DM'], archive_visible:true };
  assert.equal(isPhotoVisible(portrait, {}, { dm:true }), true);
  assert.equal(isPhotoVisible(portrait, {}, { dm:false }), false);
  assert.equal(isPhotoVisible({...portrait,archive_visible:false}, {dm:true}, {dm:true}), false);
  assert.equal(isPhotoVisible({...portrait,type:'스크린샷'}, {dm:true}, {dm:true}), false);
  const view = {...portrait,type:'리우뷰',tags:['DM','풍경']};
  assert.equal(isPhotoVisible(view, {}, {dm:true,scenery:true}), false);
  assert.equal(isPhotoVisible(view, {scenery:true}, {dm:true,scenery:true}), true);
});
