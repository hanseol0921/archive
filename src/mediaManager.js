import { isUnclassifiedType } from "./mediaClassification.js";
import { withVideoSourceTags } from "./videoClassification.js";

export const splitMediaTags = (value) => [...new Set(String(value || "").split(",").map((tag) => tag.trim()).filter(Boolean))];
export function mediaDate(row, post) {
  if (row.dm_sent_at) {
    const date = new Date(row.dm_sent_at);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
  }
  if (row.date || post?.date) return String(row.date || post.date).slice(0, 10);
  if (row.created_at) {
    const date = new Date(row.created_at);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
  }
  return "";
}
export function isPendingMedia(row) {
  return row.table === "photos" ? isUnclassifiedType(row.type)
    : !row.hair_color && !(row.tags || []).some((tag) => !["DM", "모먼트", "포스트"].includes(tag));
}
export function normalizeManagedMedia(row, table, post) {
  const media = withVideoSourceTags(row, post);
  return { ...media, originalId: row.id, id: `${table}:${row.id}`, table, date: mediaDate(row, post),
    tagsText: media.tags.join(", "), searchTagsText: (row.search_tags || []).join(", ") };
}
export function managedMediaValues(row) {
  const values = { hair_color: row.hair_color || null, tags: withVideoSourceTags({ ...row, tags: splitMediaTags(row.tagsText) }).tags,
    search_tags: splitMediaTags(row.searchTagsText) };
  if (row.table === "photos") Object.assign(values, { type: isUnclassifiedType(row.type) ? null : row.type,
    archive_visible: !["스크린샷", "같은사진"].includes(row.type) && row.archive_visible !== false,
    weverse_url: row.weverse_url || null, crop_position: row.crop_position || "50% 50%" });
  return values;
}
