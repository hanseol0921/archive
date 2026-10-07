export function dmStorageKey(roomId, digest, extension) {
  if (!roomId || !/^[a-f0-9]{64}$/.test(digest)
      || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4'].includes(extension)) {
    throw new Error('Invalid DM media key');
  }
  return {
    bucket: extension === 'mp4' ? 'videos' : 'photos',
    path: `dm/${encodeURIComponent(roomId)}/${digest}.${extension}`,
  };
}

export function isSharedDMKey(key) {
  return /^(dm\/|(?:photos|videos)\/dm\/)/.test(key || '');
}
