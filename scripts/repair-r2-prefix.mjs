import process from 'node:process';
import { S3Client, ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { normalizeR2Endpoint } from '../server/r2-endpoint.js';

const bucket = process.env.R2_BUCKET;
if (!bucket || !process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  throw new Error('로컬 R2 환경변수 설정이 필요합니다.');
}
const client = new S3Client({ region: 'auto', endpoint: normalizeR2Endpoint(process.env.R2_ENDPOINT, bucket),
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
const apply = process.argv.includes('--apply');
let token, candidates = 0, existing = 0, copied = 0;
const prefix = `${bucket}/`;
try {
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const object of page.Contents || []) {
      const source = object.Key;
      const target = source.slice(prefix.length);
      if (!/^(photos|videos|dm)\/.+/.test(target) || target.endsWith('/') || target.includes('/_diagnostics/')) continue;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target }));
        existing++;
        continue;
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 404) throw error;
      }
      candidates++;
      if (apply) {
        // Only copy. Existing destination objects and all source objects remain untouched.
        await client.send(new CopyObjectCommand({ Bucket: bucket, Key: target,
          CopySource: `${encodeURIComponent(bucket)}/${source.split('/').map(encodeURIComponent).join('/')}` }));
        const restored = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target }));
        if (restored.ContentLength !== object.Size) throw new Error('복사 후 파일 크기가 일치하지 않습니다. 원본은 유지되어 있습니다.');
        copied++;
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  console.log(JSON.stringify({ mode: apply ? 'copy' : 'preview', missingFiles: candidates, existingFiles: existing, copiedFiles: copied, sourceDeleted: false }));
} catch (error) {
  // Never print signed requests, credentials or full SDK error objects.
  console.error(`R2 복구 확인 실패: ${error.name || 'Error'} (HTTP ${error.$metadata?.httpStatusCode || '연결 오류'}). 원본은 삭제하지 않았습니다.`);
  process.exitCode = 1;
}
