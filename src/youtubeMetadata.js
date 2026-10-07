const cache = new Map();
export async function loadYoutubeMetadata(ids, token, signal) {
  const unique = [...new Set(ids)];
  const missing = unique.filter((id) => !cache.has(id) || cache.get(id).expires <= Date.now());
  for (let i = 0; i < missing.length; i += 50) {
    const response = await fetch(`/api/youtube-metadata?ids=${missing.slice(i, i + 50).join(",")}`, { signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "유튜브 정보를 가져오지 못했습니다.");
    for (const [id, value] of Object.entries(data.videos || {})) cache.set(id, { value, expires: Date.now() + 3600000 });
  }
  return Object.fromEntries(unique.filter((id) => cache.has(id)).map((id) => [id, cache.get(id).value]));
}
export function youtubeKstDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function sortYoutubeItems(items, metadata, order) {
  const date = (item) => Date.parse(metadata[item.videoId]?.publishedAt || item.publishedAt || "") || 0;
  const count = (item) => metadata[item.videoId]?.viewCount ?? item.viewCount;
  return [...items].sort((a, b) => {
    if (order === "인기순") {
      const av = count(a), bv = count(b);
      if (av == null && bv != null) return 1;
      if (av != null && bv == null) return -1;
      return (bv ?? 0) - (av ?? 0) || date(b) - date(a);
    }
    if (!date(a) && date(b)) return 1;
    if (date(a) && !date(b)) return -1;
    return order === "오래된순" ? date(a) - date(b) : date(b) - date(a);
  });
}
