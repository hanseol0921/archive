export function normalizeR2Endpoint(value, bucket) {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('R2_ENDPOINT에는 HTTPS S3 API 주소만 입력해주세요.');
  }
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '');
  if (path && path !== `/${bucket}`) {
    throw new Error('R2_ENDPOINT의 버킷 경로를 확인해주세요.');
  }
  // The SDK already adds Bucket. Keeping it in the endpoint duplicates the object prefix.
  return url.origin;
}
