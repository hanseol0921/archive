import { videoSourceTags } from "./videoClassification.js";
export const YOUTUBE_CONTENT_KEY = "youtube_contents";
export const VIDEO_FOLDERS_KEY = "video_folders";
export const ROOT_VIDEO_FOLDERS = [
  { id: "weverse", name: "위버스", parentId: null },
  { id: "youtube", name: "유튜브 콘텐츠", parentId: null },
  { id: "weverse-moments", name: "모먼트", parentId: "weverse", autoTag: "모먼트" },
  { id: "weverse-dm", name: "DM", parentId: "weverse", autoTag: "DM" },
  { id: "weverse-posts", name: "포스트", parentId: "weverse", autoTag: "포스트" },
  { id: "weverse-live", name: "라이브", parentId: "weverse", autoTag: "라이브" },
];

export function parseVideoFolders(value) {
  if (value == null || value === "") return ROOT_VIDEO_FOLDERS;
  const folders = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(folders) || folders.some((folder) => !folder || typeof folder.id !== "string"
    || typeof folder.name !== "string" || !folder.name.trim()
    || (folder.videoIds != null && !Array.isArray(folder.videoIds)))
    || new Set(folders.map((folder) => folder.id)).size !== folders.length
    || !ROOT_VIDEO_FOLDERS.filter((root) => root.parentId == null).every((root) => folders.some((folder) => folder.id === root.id && folder.parentId == null))) {
    throw new Error("폴더 목록 형식이 올바르지 않습니다.");
  }
  for (const folder of folders) {
    const seen = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId != null) {
      const parent = folders.find((item) => item.id === parentId);
      if (!parent || seen.has(parentId)) throw new Error("잘못된 폴더 구조입니다.");
      seen.add(parentId);
      parentId = parent.parentId;
    }
  }
  const result = folders.map((folder) => ({ ...folder }));
  for (const defaultFolder of ROOT_VIDEO_FOLDERS.filter((folder) => folder.autoTag)) {
    const existing = result.find((folder) => folderDescendants(result, "weverse").has(folder.id)
      && (folder.autoTag === defaultFolder.autoTag || folder.name.trim().toLowerCase() === defaultFolder.name.toLowerCase()));
    if (existing) existing.autoTag = defaultFolder.autoTag;
    else result.push({ ...defaultFolder, id: result.some((folder) => folder.id === defaultFolder.id) ? `${defaultFolder.id}-auto` : defaultFolder.id });
  }
  return result;
}

export function folderSource(folders, id) {
  if (folders.some((folder) => folder.autoTag === "라이브" && folderDescendants(folders, folder.id).has(id))) return "live";
  return folderDescendants(folders, "weverse").has(id) ? "weverse" : "youtube";
}

export function moveVideoFolder(folders, id, parentId, beforeId = "") {
  const target = folders.find((item) => item.id === id);
  if (!target || ["youtube", "weverse"].includes(id)) throw new Error("기본 폴더는 이동할 수 없습니다.");
  if (folderDescendants(folders, id).has(parentId)) throw new Error("자기 자신이나 하위 폴더 안으로 이동할 수 없습니다.");
  const parent = folders.find((item) => item.id === parentId);
  const source = folderSource(folders, id);
  const destinationSource = parentId == null ? "youtube" : folderSource(folders, parentId);
  if ((parentId != null && !parent) || (target.autoTag === "라이브" ? destinationSource !== "weverse" : source !== destinationSource)) throw new Error("같은 종류의 동영상 폴더 안에서 이동해주세요.");
  const next = folders.filter((item) => item.id !== id);
  const before = next.findIndex((item) => item.id === beforeId && (item.parentId || null) === (parentId || null));
  next.splice(before < 0 ? next.length : before, 0, { ...target, parentId: parentId || null });
  parseVideoFolders(next);
  return next;
}

export function weverseLiveUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "weverse.io" || url.username || url.password || url.port
      || !/^\/[^/]+\/live\/\d+-\d+\/?$/.test(url.pathname)) return null;
    return `https://weverse.io${url.pathname.replace(/\/$/, "")}`;
  } catch { return null; }
}

export function weverseFolderMatches(folders, folderId, video, post) {
  if (folderId === "weverse") return true;
  const descendants = folderDescendants(folders, folderId);
  const sourceTags = videoSourceTags(video, post);
  const isPostVideo = !sourceTags.includes("DM") && !sourceTags.includes("모먼트");
  if (folders.find((folder) => folder.id === folderId)?.autoTag === "포스트") return isPostVideo;
  if (isPostVideo && folders.some((folder) => descendants.has(folder.id) && folder.autoTag === "포스트")) return true;
  if (folders.some((folder) => descendants.has(folder.id) && sourceTags.includes(folder.autoTag || folder.name.trim()))) return true;
  const assigned = folders.find((folder) => (folder.videoIds || []).some((id) => String(id) === String(video.id)));
  if (assigned) return descendants.has(assigned.id);
  return folders.some((folder) => descendants.has(folder.id) && (
    (folder.videoIds || []).some((id) => String(id) === String(video.id))
  ));
}

export function folderDescendants(folders, id) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) if (ids.has(folder.parentId) && !ids.has(folder.id)) {
      ids.add(folder.id); changed = true;
    }
  }
  return ids;
}

export function youtubeVideoId(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    let id;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
    }
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch { return null; }
}

export function parseYoutubeContents(value) {
  if (value == null || value === "") return [];
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item.id !== "string"
    || typeof item.title !== "string" || (!youtubeVideoId(item.url) && !weverseLiveUrl(item.url)))) {
    throw new Error("유튜브 목록 형식이 올바르지 않습니다.");
  }
  return parsed;
}
