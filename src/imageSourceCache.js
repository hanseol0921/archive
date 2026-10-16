const resolved = new Map();
export const cachedImageSource = source => resolved.get(source);
export function rememberImageSource(original, loaded) {
  if (original === loaded) return;
  resolved.set(original, loaded);
  if (resolved.size > 1000) resolved.delete(resolved.keys().next().value);
}
export function retryImageSource(source) {
  try {
    const url = new URL(source);
    if (url.hostname !== 'media.riwooarchive.com') return source;
    url.searchParams.set('image-retry', 'r2-restored-20261016');
    return url.href;
  } catch { return source; }
}
