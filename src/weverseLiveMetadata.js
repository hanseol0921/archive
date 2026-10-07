export function parseLiveMetadata(html) {
  const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((match) => [match[1].toLowerCase(), decode(match[3])]));
    if (attrs.property || attrs.name) meta[attrs.property || attrs.name] = attrs.content;
  }
  let thumbnail = meta["og:image"] || meta["twitter:image"] || "";
  try {
    const url = new URL(thumbnail);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["phinf.wevpstatic.net", "weverse-phinf.pstatic.net"].includes(url.hostname)) thumbnail = "";
  } catch { thumbnail = ""; }
  return { thumbnail, title: (meta["og:description"] || meta.description || "").slice(0, 120) };
}

export async function loadLiveMetadata(url, token, signal) {
  const response = await fetch(`/api/weverse-live-metadata?url=${encodeURIComponent(url)}`, { signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "라이브 썸네일을 가져오지 못했습니다.");
  return data;
}
