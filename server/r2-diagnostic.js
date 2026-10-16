import { randomUUID } from 'node:crypto';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function describeUploadDiagnostic({ status, code, corsAllowed, cleanupFailed }) {
  if (status === 401 || ['InvalidAccessKeyId', 'Unauthorized', 'SignatureDoesNotMatch'].includes(code)) {
    return 'R2 인증 실패: Vercel의 Access Key ID·Secret Access Key가 같은 토큰의 값인지, R2_ENDPOINT가 해당 계정의 S3 주소인지 확인해주세요.';
  }
  if (status === 403) return 'R2 권한 거부: 토큰의 Object Read & Write 권한, 대상 버킷, IP 제한을 확인해주세요.';
  if (status === 404) return 'R2 버킷을 찾지 못했습니다. Vercel의 R2_BUCKET과 R2_ENDPOINT를 확인해주세요.';
  if (status < 200 || status >= 300) return `Vercel → R2 전송 실패 (HTTP ${status}${code ? `, ${code}` : ''}).`;
  if (!corsAllowed) return 'R2 서버 업로드는 정상이나 브라우저 CORS가 차단됩니다. 버킷 CORS에 https://riwooarchive.com, PUT 메서드, Content-Type 헤더를 허용해주세요.';
  return `Vercel의 R2 인증·업로드·CORS 검사는 정상입니다. 브라우저 확장 프로그램, VPN 또는 네트워크 차단을 확인해주세요.${cleanupFailed ? ' 임시 진단 파일을 정리하지 못했습니다.' : ''}`;
}

export async function diagnoseR2Upload(client, bucket) {
  const key = `photos/_diagnostics/${randomUUID()}.txt`;
  const origin = 'https://riwooarchive.com';
  let uploaded = false;
  let cleanupFailed = false;
  let result;
  try {
    const url = await getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket, Key: key, ContentType: 'text/plain',
      CacheControl: 'public, max-age=31536000, immutable',
    }), { expiresIn: 60 });
    const preflight = await fetch(url, { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type',
    }, signal: AbortSignal.timeout(5000) });
    const preflightAllowed = preflight.ok && [origin, '*'].includes(preflight.headers.get('access-control-allow-origin'))
      && /(?:^|[,\s])PUT(?:$|[,\s])/i.test(preflight.headers.get('access-control-allow-methods') || '')
      && /(?:^|[,\s])(?:content-type|\*)(?:$|[,\s])/i.test(preflight.headers.get('access-control-allow-headers') || '');
    await preflight.body?.cancel();
    const response = await fetch(url, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'text/plain' },
      body: 'R2 connection diagnostic', signal: AbortSignal.timeout(5000) });
    uploaded = response.ok;
    const body = await response.text();
    // Only expose a short service error code, never a signed URL or raw response.
    const code = body.match(/<Code>([A-Za-z0-9_]+)<\/Code>/)?.[1];
    result = { status: response.status, code, corsAllowed: preflightAllowed
      && [origin, '*'].includes(response.headers.get('access-control-allow-origin')) };
  } catch {
    return { error: 'Vercel 서버에서 R2 진단 연결에 실패했습니다. R2_ENDPOINT와 서버 네트워크를 확인해주세요.' };
  } finally {
    if (uploaded) {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(5000) }); }
      catch { cleanupFailed = true; }
    }
  }
  return { error: describeUploadDiagnostic({ ...result, cleanupFailed }) };
}
