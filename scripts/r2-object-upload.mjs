// Release-only S3 transport; credentials never enter artifacts or command arguments.
import {S3Client,HeadObjectCommand,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {createReadStream,readFileSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const config=JSON.parse(readFileSync(new URL('../platform/electron/distribution/Updates.json',import.meta.url),'utf8'));
export function publicationBucket(bucket){
 if(bucket!=='worldlet-releases')throw Error('Publication is blocked until reviewed tools target worldlet-releases.');
 return bucket;
}
export function clientOptions(env=process.env){
 const endpoint=env.WORLDLET_R2_ENDPOINT;
 if(!endpoint||!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/.test(endpoint))throw Error('Set WORLDLET_R2_ENDPOINT to the account R2 S3 HTTPS endpoint.');
 if(!env.AWS_ACCESS_KEY_ID||!env.AWS_SECRET_ACCESS_KEY)throw Error('Configure bucket-scoped AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for R2 S3 publication.');
 return {endpoint,region:'auto',forcePathStyle:true,maxAttempts:1,requestHandler:{connectionTimeout:15000,requestTimeout:1200000},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',credentials:{accessKeyId:env.AWS_ACCESS_KEY_ID,secretAccessKey:env.AWS_SECRET_ACCESS_KEY,...(env.AWS_SESSION_TOKEN?{sessionToken:env.AWS_SESSION_TOKEN}:{})}};
}
async function digest(stream){const hash=createHash('sha256');for await(const chunk of stream)hash.update(chunk);return hash.digest('hex');}
async function head(client,input){try{return await client.send(new HeadObjectCommand(input));}catch(error){if(error.$metadata?.httpStatusCode===404)return null;throw error;}}
async function verify(client,input,size,sha){
 const object=await client.send(new GetObjectCommand(input));
 if(object.ContentLength!==size||!object.Body||await digest(object.Body)!==sha)throw Error('Remote object bytes differ; refusing publication.');
}
export async function uploadFile(client,bucket,key,file,contentType='application/x-apple-diskimage'){
 publicationBucket(bucket);
 const size=(await stat(file)).size;
 if(!size)throw Error('Release artifact is empty.');
 const shaHash=createHash('sha256'),md5Hash=createHash('md5');
 for await(const chunk of createReadStream(file)){shaHash.update(chunk);md5Hash.update(chunk);}
 const sha=shaHash.digest('hex'),md5=md5Hash.digest('base64'),input={Bucket:bucket,Key:key};
 const existing=await head(client,input);
 if(existing){
  if(existing.ContentLength!==size)throw Error('Immutable release object already exists with a different size.');
  await verify(client,input,size,sha);return {size,sha,reused:true};
 }
 const body=createReadStream(file);let reused=false;
 try{
  // S3 PutObject is one streamed request. The service, not the app, owns its size limit.
  // Conditional creation prevents races; Content-MD5 rejects changed input in transit.
  await client.send(new PutObjectCommand({...input,Body:body,ContentLength:size,
   ContentType:contentType,ContentMD5:md5,IfNoneMatch:'*',Metadata:{sha256:sha}}));
 }catch(error){
  if(error.$metadata?.httpStatusCode!==412)throw error;
  // A competing/uncertain previous request may already have created the object.
  // Never overwrite it: only a complete matching download permits an idempotent retry.
  reused=true;
 }finally{body.destroy();}
 await verify(client,input,size,sha);
 return {size,sha,reused};
}
// A feed is replaced in place (both appcasts, after their artifact); the stored bytes are read back.
export async function putFeed(client,bucket,key,file){
 publicationBucket(bucket);
 if(!feedKeys.has(key))throw Error('Only appcast.xml or appcast-intel.xml may be replaced.');
 const bytes=readFileSync(file),sha=createHash('sha256').update(bytes).digest('hex');
 if(!bytes.length)throw Error('Feed is empty.');
 const input={Bucket:bucket,Key:key};
 await client.send(new PutObjectCommand({...input,Body:bytes,ContentLength:bytes.length,ContentType:'application/rss+xml',
  ContentMD5:createHash('md5').update(bytes).digest('base64')}));
 await verify(client,input,bytes.length,sha);
 return {size:bytes.length,sha};
}
const feedKeys=new Set(['appcast.xml','appcast-intel.xml']);
async function main(){
 const [mode,...args]=process.argv.slice(2),bucket=publicationBucket(config.bucket),client=new S3Client(clientOptions());
 try{
  if(mode==='--check'&&args.length===0){
   if(!await head(client,{Bucket:bucket,Key:'appcast.xml'}))throw Error('Existing appcast.xml is missing.');
   console.log('R2 S3 credential/read probe passed; write permission is verified during publication.');return;
  }
  if(mode==='--put-feed'&&args.length===2){
   const result=await putFeed(client,bucket,args[0],path.resolve(args[1]));
   console.log(`R2 feed verified: ${args[0]}, ${result.size} bytes, SHA-256 ${result.sha}`);return;
  }
  if(mode!=='--upload'||args.length!==1)throw Error('Usage: r2-object-upload.mjs --check | --upload <universal-dmg>[.sha256] | --put-feed <appcast.xml|appcast-intel.xml> <file>');
  const file=path.resolve(args[0]),key=path.basename(file);
  // The DMG and its checksum share this transport, so the Mac release host needs no Wrangler sign-in.
  const match=/^Worldlet-\d{4}\.\d+\.\d+-\d+-macos-universal\.dmg(\.sha256)?$/.exec(key);
  if(!match)throw Error('Only a versioned universal Mac DMG or its checksum may use this uploader.');
  const result=await uploadFile(client,bucket,key,file,match[1]?'text/plain':undefined);
  console.log(`R2 immutable artifact verified: ${key}, ${result.size} bytes, SHA-256 ${result.sha}${result.reused?' (identical existing object)':''}`);
 }finally{client.destroy();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 // SDK errors can carry signed request details; print only classification/status.
 if(error.$metadata)console.error(`R2 S3 request failed: ${error.name}, HTTP ${error.$metadata.httpStatusCode??'unknown'}.`);
 else console.error(error.message);
 process.exitCode=1;
});
