import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createServer} from 'node:http';
import {S3Client} from '@aws-sdk/client-s3';
import {uploadFile,putFeed,clientOptions,publicationBucket} from './r2-object-upload.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const folder=await mkdtemp(path.join(tmpdir(),'worldlet-r2-object-')),file=path.join(folder,'fixture.dmg');
const bytes=Buffer.alloc(65553,7),md5=data=>createHash('md5').update(data).digest('base64');
const collect=async stream=>{const chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks);};
function mock({existing,fail=false,corrupt=false,race,mutate=false}={}){
 const calls=[];let object=existing;
 return {calls,async send(command){
  const name=command.constructor.name,input=command.input;calls.push(name);
  if(name==='HeadObjectCommand'){
   if(mutate)await writeFile(file,Buffer.alloc(bytes.length,8));
   if(object)return {ContentLength:object.length};throw Object.assign(Error('missing'),{$metadata:{httpStatusCode:404}});
  }
  if(name==='PutObjectCommand'){
   assert.equal(input.IfNoneMatch,'*');assert.equal(input.ContentLength,bytes.length);
   if(fail)throw Error('simulated PUT failure');
   if(race){object=race;throw Object.assign(Error('precondition'),{$metadata:{httpStatusCode:412}});}
   const uploaded=await collect(input.Body);
   if(md5(uploaded)!==input.ContentMD5)throw Error('BadDigest');
   object=uploaded;return {};
  }
  if(name==='GetObjectCommand')return {ContentLength:object.length,Body:Readable.from([corrupt?Buffer.alloc(object.length):object])};
  throw Error('Unexpected operation '+name);
 }};
}
let server;
try{
 await writeFile(file,bytes);
 assert.equal(publicationBucket('worldlet-releases'),'worldlet-releases');
 assert.throws(()=>publicationBucket('legacy-releases'),/blocked/);
 const forbidden=mock();await assert.rejects(uploadFile(forbidden,'legacy-releases','key',file),/blocked/);assert.deepEqual(forbidden.calls,[]);
 const client=mock();assert.equal((await uploadFile(client,'worldlet-releases','key',file)).reused,false);
 assert.deepEqual(client.calls,['HeadObjectCommand','PutObjectCommand','GetObjectCommand']);
 const same=mock({existing:bytes});assert.equal((await uploadFile(same,'worldlet-releases','key',file)).reused,true);assert(!same.calls.includes('PutObjectCommand'));
 const different=mock({existing:Buffer.alloc(bytes.length,2)});await assert.rejects(uploadFile(different,'worldlet-releases','key',file),/bytes differ/);assert(!different.calls.includes('PutObjectCommand'));
 const deniedCalls=[];const denied={async send(command){deniedCalls.push(command.constructor.name);throw Object.assign(Error('denied'),{$metadata:{httpStatusCode:403}});}};await assert.rejects(uploadFile(denied,'worldlet-releases','key',file),/denied/);assert.deepEqual(deniedCalls,['HeadObjectCommand']);
 const failure=mock({fail:true});await assert.rejects(uploadFile(failure,'worldlet-releases','key',file),/PUT failure/);assert.deepEqual(failure.calls,['HeadObjectCommand','PutObjectCommand']);
 const race=mock({race:Buffer.alloc(bytes.length,2)});await assert.rejects(uploadFile(race,'worldlet-releases','key',file),/bytes differ/);
 assert.equal((await uploadFile(mock({race:bytes}),'worldlet-releases','key',file)).reused,true);
 await assert.rejects(uploadFile(mock({corrupt:true}),'worldlet-releases','key',file),/bytes differ/);
 await assert.rejects(uploadFile(mock({mutate:true}),'worldlet-releases','key',file),/BadDigest/);
 // Feeds are replaced in place (no If-None-Match), then read back in full.
 const feed=path.join(folder,'appcast.xml');await writeFile(feed,'<rss/>');
 const feedCalls=[];let feedObject=Buffer.from('<rss>old</rss>'),feedCorrupt=false;
 const feedClient={async send(command){const name=command.constructor.name,input=command.input;feedCalls.push(name);
  if(name==='PutObjectCommand'){assert.equal(input.IfNoneMatch,undefined);assert.equal(input.ContentType,'application/rss+xml');assert.equal(md5(input.Body),input.ContentMD5);feedObject=Buffer.from(input.Body);return {};}
  if(name==='GetObjectCommand')return {ContentLength:feedObject.length,Body:Readable.from([feedCorrupt?Buffer.alloc(feedObject.length):feedObject])};
  throw Error('Unexpected operation '+name);}};
 assert.equal((await putFeed(feedClient,'worldlet-releases','appcast-intel.xml',feed)).size,6);assert.deepEqual(feedCalls,['PutObjectCommand','GetObjectCommand']);
 feedCorrupt=true;await assert.rejects(putFeed(feedClient,'worldlet-releases','appcast.xml',feed),/bytes differ/);
 await assert.rejects(putFeed(feedClient,'worldlet-releases','Worldlet-2026.1005.1-1-macos-universal.dmg',feed),/Only appcast/);
 await assert.rejects(putFeed(feedClient,'legacy-releases','appcast.xml',feed),/blocked/);
 // The command line accepts only the DMG, its checksum and the two feeds (rejected before any request).
 const cli=(...args)=>spawnSync(process.execPath,[fileURLToPath(new URL('./r2-object-upload.mjs',import.meta.url)),...args],{encoding:'utf8',env:{...process.env,WORLDLET_R2_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',AWS_ACCESS_KEY_ID:'fixture',AWS_SECRET_ACCESS_KEY:'fixture'}});
 assert.match(cli('--upload',path.join(folder,'Worldlet-2026.1005.1-1-macos-universal.txt')).stderr,/checksum may use/);
 assert.match(cli('--put-feed','index.html',feed).stderr,/Only appcast/);
 assert.throws(()=>clientOptions({}),/ENDPOINT/);assert.throws(()=>clientOptions({WORLDLET_R2_ENDPOINT:'https://example.com'}),/ENDPOINT/);
 const options=clientOptions({WORLDLET_R2_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',AWS_ACCESS_KEY_ID:'fixture',AWS_SECRET_ACCESS_KEY:'fixture',AWS_SESSION_TOKEN:'temporary'});assert.equal(options.credentials.sessionToken,'temporary');
 // Exercise the actual SDK serialization/stream against a local S3-shaped endpoint.
 await writeFile(file,bytes);let stored;const methods=[];
 server=createServer(async(req,res)=>{
  methods.push(req.method);
  if(req.method==='HEAD'){res.writeHead(404);res.end();return;}
  if(req.method==='PUT'){
   const body=await collect(req);assert.equal(req.headers['if-none-match'],'*');assert.equal(req.headers['content-md5'],md5(body));assert.equal(Number(req.headers['content-length']),bytes.length);assert.deepEqual(body,bytes);stored=body;res.writeHead(200,{ETag:'"fixture"'});res.end();return;
  }
  assert.equal(req.method,'GET');res.writeHead(200,{'Content-Length':stored.length});res.end(stored);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const sdk=new S3Client({...options,endpoint:`http://127.0.0.1:${server.address().port}`});
 try{await uploadFile(sdk,'worldlet-releases','key',file);}finally{sdk.destroy();}
 assert.deepEqual(methods,['HEAD','PUT','GET']);
 console.log('PASS single streaming PUT, verified feed replacement, CLI key allowlist, conditional creation, SDK wire headers, full remote hashes, immutable retries, access errors, races and changed-input rejection.');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(folder,{recursive:true,force:true});}
