export function getPhotoExtraGroups(photo) {
  const tags = new Set((Array.isArray(photo.tags) ? photo.tags : [])
    .map((tag) => String(tag).replace(/\s+/g, "")));
  const has = (values) => values.some((value) => tags.has(value));
  const groups = {
    members: has(["멤버", "성호", "명재현", "재현", "태산", "이한", "운학"]),
    food: tags.has("음식"),
    scenery: tags.has("풍경"),
    dogs: has(["짱대박", "짱이", "대박이"]),
  };
  return {
    ...groups,
    other: has(["그외", "기타"]) || (photo.type === "리우뷰" && !Object.values(groups).some(Boolean)),
  };
}

export function isPhotoVisible(photo, extraSelection = {}, allowed = {}) {
  if (photo.archive_visible === false) return false;
  if (["스크린샷", "같은사진"].includes(photo.type)) return false;
  if (isDmMedia(photo) && allowed.dm !== true) return false;
  const groups = getPhotoExtraGroups(photo);
  const assigned = Object.keys(groups).filter((key) => groups[key]);
  if (photo.type && photo.type !== "리우뷰") return true;
  if (!assigned.length) return true;
  return assigned.some((key) => allowed[key] !== false && extraSelection[key]);
}
import { videoSourceTags } from "./videoClassification.js";

export function isDmMedia(media) {
  return videoSourceTags(media).includes("DM");
}

export function shouldMigrateToRiwooView(photo) {
  const groups = getPhotoExtraGroups(photo);
  return (groups.food || groups.scenery) && !groups.dogs && !isDmMedia(photo);
}
