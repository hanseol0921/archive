import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { S3Client, ListObjectsV2Command, PutObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { normalizeR2Endpoint } from '../server/r2-endpoint.js';
import { dmStorageKey } from '../src/dmStorageKey.js';

const bucket = process.env.R2_BUCKET;
const root = path.resolve(fileURLToPath(new URL('../../Scraper/backups/dm/리우/', import.meta.url)));
const apply = process.argv.includes('--apply');
const client = new S3Client({ region: 'auto', endpoint: normalizeR2Endpoint(process.env.R2_ENDPOINT, bucket),
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
try {
  const archive = JSON.parse(await fs.readFile(path.join(root, 'archive.json'), 'utf8'));
  const assets = new Map();
  for (const message of archive.messages) for (const block of message.blocks || []) {
    for (const [relative, expected] of [[block.file, block.sha256], [block.thumbnail_file, null]]) {
      if (!relative) continue;
      const local = path.resolve(root, relative);
      if (!local.startsWith(root + path.sep)) throw new Error('UnsafePath');
      const body = await fs.readFile(local);
      const hash = crypto.createHash('sha256').update(body).digest('hex');
      if (expected && hash !== expected) throw new Error('HashMismatch');
      const extension = path.extname(local).slice(1).toLowerCase();
      const location = dmStorageKey(archive.room.id, hash, extension);
      const key = `${location.bucket}/${location.path}`;
      assets.set(key, { local, bytes: body.length, extension });
    }
  }
  const stored = new Map();
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const object of page.Contents || []) stored.set(object.Key, object.Size);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const missing = [...assets].filter(([key, asset]) => !stored.has(key) || stored.get(key) !== asset.bytes);
  // Never overwrite an unexpected existing object, even if its size is wrong.
  if (missing.some(([key]) => stored.has(key))) throw new Error('ExistingSizeMismatch');
  console.log(JSON.stringify({ mode: apply ? 'restore' : 'preview', backupFiles: assets.size,
    present: assets.size - missing.length, missing: missing.length,
    restoreMB: Math.round(missing.reduce((n, [, a]) => n + a.bytes, 0) / 1024 / 1024) }));
  let restored = 0;
  if (apply) for (const [key, asset] of missing) {
    const nested = `${bucket}/${key}`;
    if (stored.get(nested) === asset.bytes) {
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: key,
        CopySource: `${encodeURIComponent(bucket)}/${nested.split('/').map(encodeURIComponent).join('/')}` }));
    } else {
      const body = await fs.readFile(asset.local);
      const type = asset.extension === 'mp4' ? 'video/mp4' : `image/${asset.extension === 'jpg' ? 'jpeg' : asset.extension}`;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body,
        ContentType: type, CacheControl: 'public, max-age=31536000, immutable' }));
    }
    const check = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (check.ContentLength !== asset.bytes) throw new Error('RestoreSizeMismatch');
    restored++;
    if (restored % 20 === 0) console.log(JSON.stringify({ restored, total: missing.length }));
  }
  console.log(JSON.stringify({ restored, sourceDeleted: false }));
  if (process.argv.includes('--verify-public')) {
    const queue = [...assets.keys()];
    const counts = {};
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (queue.length) {
        const key = queue.shift();
        let status;
        try {
          const response = await fetch(`https://media.riwooarchive.com/${key.split('/').map(encodeURIComponent).join('/')}`,
            { method: 'HEAD', signal: AbortSignal.timeout(10000) });
          status = response.status;
        } catch { status = 'network-error'; }
        counts[status] = (counts[status] || 0) + 1;
        if (status !== 200) console.log(JSON.stringify({ publicFailure: key, status }));
      }
    }));
    console.log(JSON.stringify({ publicResponses: counts }));
  }
} catch (error) {
  console.error(`DM 미디어 복구 실패: ${error.name} (${error.message === 'HashMismatch' || error.message === 'ExistingSizeMismatch' ? error.message : error.$metadata?.httpStatusCode || '검사 오류'}). 원본은 삭제하지 않았습니다.`);
  process.exitCode = 1;
}
