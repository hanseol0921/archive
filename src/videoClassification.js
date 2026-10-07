export function videoSourceTags(video, post, sourcePath = "") {
  const markers = [video.type, video.source, video.source_type,
    ...(Array.isArray(video.tags) ? video.tags : []),
    ...(Array.isArray(video.search_tags) ? video.search_tags : [])];
  const paths = [sourcePath, video.weverse_url, video.video_url, post?.weverse_url].map((value) => String(value || ""));
  const result = [];
  if (markers.some((value) => /모먼트|moment/i.test(String(value || "")))
    || paths.some((value) => /모먼트|moment/i.test(value))) result.push("모먼트");
  if (video.dm_asset_id || video.dm_sent_at
    || markers.some((value) => /^dm$/i.test(String(value || "").trim()))
    || paths.some((value) => /(?:^|[\\/\s_-])dm(?:$|[\\/\s_.?-])/i.test(value))) result.push("DM");
  return result;
}

export function withVideoSourceTags(video, post, sourcePath = "") {
  return { ...video, tags: [...new Set([...(Array.isArray(video.tags) ? video.tags : []), ...videoSourceTags(video, post, sourcePath)])] };
}
