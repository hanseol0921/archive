import { GetBucketCorsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import process from 'node:process';

const client = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED' });
try {
  const cors = await client.send(new GetBucketCorsCommand({ Bucket: process.env.R2_BUCKET }));
  console.log(JSON.stringify({ rules: cors.CORSRules }, null, 2));
} catch (error) { console.log('CORS settings read:', error.name); }
const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: process.env.R2_BUCKET,
  Key: 'photos/dm/cors-diagnostic.jpg', ContentType: 'image/jpeg' }), { expiresIn: 60 });
// OPTIONS only: this diagnostic does not upload or overwrite an object.
for (const origin of ['http://127.0.0.1:5174', 'http://localhost:5173', 'https://riwooarchive.com']) {
  const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin,
    'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });
  console.log(JSON.stringify({ origin, status: response.status,
    allowOrigin: response.headers.get('access-control-allow-origin'),
    allowMethods: response.headers.get('access-control-allow-methods') }));
}
