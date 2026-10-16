import test from 'node:test';
import assert from 'node:assert/strict';
import { describeUploadDiagnostic, diagnoseR2Upload } from '../server/r2-diagnostic.js';
import { S3Client } from '@aws-sdk/client-s3';

test('authentication errors are distinguished from masked CORS failures', () => {
  assert.match(describeUploadDiagnostic({ status: 401, corsAllowed: false }), /인증 실패/);
  assert.match(describeUploadDiagnostic({ status: 403, code: 'SignatureDoesNotMatch', corsAllowed: false }), /인증 실패/);
  assert.match(describeUploadDiagnostic({ status: 403, corsAllowed: false }), /권한 거부/);
});
test('only successful storage requests can identify browser-only failures', () => {
  assert.match(describeUploadDiagnostic({ status: 200, corsAllowed: false }), /CORS가 차단/);
  assert.match(describeUploadDiagnostic({ status: 200, corsAllowed: true }), /검사는 정상/);
  assert.match(describeUploadDiagnostic({ status: 404, corsAllowed: false }), /버킷을 찾지/);
});

test('diagnosis uses an isolated object and cleans it after a successful probe', async t => {
  const client = new S3Client({ region: 'auto', endpoint: 'https://example.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' }, requestChecksumCalculation: 'WHEN_REQUIRED' });
  const calls = [], deletions = [];
  t.mock.method(client, 'send', async command => { deletions.push(command.input); });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: new URL(url), method: options.method });
    return new Response(null, { status: options.method === 'OPTIONS' ? 204 : 200, headers: {
      'access-control-allow-origin': 'https://riwooarchive.com',
      'access-control-allow-methods': 'GET, HEAD, PUT', 'access-control-allow-headers': 'content-type',
    } });
  });
  const result = await diagnoseR2Upload(client, 'test-bucket');
  assert.match(result.error, /검사는 정상/);
  assert.deepEqual(calls.map(c => c.method), ['OPTIONS', 'PUT']);
  assert.match(calls[1].url.pathname, /\/photos\/_diagnostics\/[^/]+\.txt$/);
  assert.equal(deletions.length, 1);
  assert.equal(deletions[0].Bucket, 'test-bucket');
  assert.equal('/' + deletions[0].Key, calls[1].url.pathname);
});
