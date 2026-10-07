import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import process from 'node:process';
const client=new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED'});
const Key=`photos/dm/upload-diagnostic-${crypto.randomUUID()}.txt`;
try {
  const signed=await getSignedUrl(client,new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key,ContentType:'text/plain'}),{expiresIn:60});
  const response=await fetch(`http://localhost:5175/api/r2-upload?url=${encodeURIComponent(signed)}`,{method:'PUT',headers:{'content-type':'text/plain',origin:'http://localhost:5175'},body:'local upload test'});
  console.log('Local upload HTTP:',response.status);
  if (!response.ok) console.log((await response.text()).slice(0,180));
  if (!response.ok) process.exitCode=1;
} finally { await client.send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET,Key})); }
