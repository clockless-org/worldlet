// Desktop releases from GitHub Actions (.github/workflows/release.yml, docs/RELEASING.md). This repository builds,
// signs and publishes the Mac and Windows apps itself; nothing here needs a release machine.
//
// Channels are the in-app update channels (core/distribution/update-channel.ts):
//  dev    every push to main: a signed, numbered build, published to dev/ with its own one-build feeds
//  alpha  a Dev build promoted to Alpha: the same bytes, under alpha/ with one-build feeds
//  beta   an Alpha (or Dev) build promoted to Beta: the download everyone gets and the release feeds, which keep history
// Promotion never rebuilds: it republishes the exact installer and its signed Sparkle item under the channel.
// A channel that is not live yet (platform/electron/distribution/Channels.json) publishes under ci-staging/ instead,
// where installed apps and the download page never look, so CI releases can run beside the old release hosts.
//
// Build numbers: Build = BUILD_OFFSET + the commit's position on main (git rev-list --count). The offset keeps every
// build of this repository above the builds the release hosts published before it (up to about 3,300), so installed
// apps keep updating; the label is YYYY.MMDD.<build>, the date being the commit's day in Pacific time.
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export const BUILD_OFFSET=4000;
export const BUCKET='worldlet-releases';
export const CHANNELS={
 dev:{prefix:'dev/',mac:['appcast-dev.xml'],windows:'windows-dev.json',history:false},
 alpha:{prefix:'alpha/',mac:['appcast-alpha.xml'],windows:'windows-alpha.json',history:false},
 beta:{prefix:'',mac:['appcast.xml','appcast-intel.xml'],windows:'windows-preview.json',history:true},
};
export const STAGING='ci-staging/';
export const macName=(version,build)=>`Worldlet-${version}-${build}-macos-universal.dmg`;
export const windowsName=(version,build)=>`Worldlet-${version}-${build}-windows-x64-unsigned.exe`;

/** The release identity of a commit: its Build, native version and label. `committedAt` is the commit time. */
export function releaseIdentity(count,committedAt,offset=BUILD_OFFSET){
 const build=offset+count;
 if(!Number.isSafeInteger(count)||count<1||build>65535)throw Error('Invalid commit position '+count);
 const date=new Date(committedAt);if(!Number.isFinite(date.getTime()))throw Error('Invalid commit time');
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));
 const version=`${p.year}.${Number(p.month)*100+Number(p.day)}.${build}`;
 return {version,build,label:`${p.year}.${p.month}${p.day}.${build}`,builtAt:date.toISOString().replace(/\.\d{3}Z$/,'Z')};
}
/** The manifest scripts/build-info.ts reads through WORLDLET_RELEASE_MANIFEST: the identity, bound to its commit. */
export const releaseManifest=(identity,sourceCommit)=>({version:identity.version,build:identity.build,platformBuilds:{mac:identity.build,windows:identity.build},builtAt:identity.builtAt,sourceCommit});

/** Whether a channel publishes to its live feeds, from the committed Channels.json. */
export function liveChannel(channel,config=JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/Channels.json'),'utf8'))){
 if(!CHANNELS[channel])throw Error('Unknown channel '+channel);
 return Array.isArray(config.live)&&config.live.includes(channel);
}
/** The storage keys of a channel: installers under `prefix`, the feeds by name; under ci-staging/ when not live. */
export function channelKeys(channel,live){
 const c=CHANNELS[channel],base=live?'':STAGING+(c.prefix||'beta/');
 const prefix=live?c.prefix:base;
 return {prefix,mac:c.mac.map(f=>(live?'':base)+f),windows:(live?'':base)+c.windows,history:c.history};
}

const attribute=(xml,name)=>new RegExp(`\\s${name}="([^"]*)"`).exec(xml)?.[1];
const items=xml=>[...String(xml).matchAll(/<item\b[^>]*>[\s\S]*?<\/item>/g)].map(m=>m[0]);
const itemBuild=item=>Number(/<sparkle:version>(\d+)<\/sparkle:version>/.exec(item)?.[1]||attribute(/<enclosure\b[^>]*>/.exec(item)?.[0]||'','sparkle:version')||0);
/** The newest Build a Mac feed or Windows manifest names (0 for none). */
export function feedBuild(platform,text){
 if(platform==='windows'){try{const build=JSON.parse(text).build;return Number.isSafeInteger(build)?build:0;}catch{return 0;}}
 return Math.max(0,...items(text).map(itemBuild));
}
/** The Sparkle item for `name` from the build's own appcast, its URL moved to `url` and dated now. */
export function macItem(appcast,name,url,publishedAt=new Date()){
 const item=items(appcast).find(i=>(attribute(/<enclosure\b[^>]*>/.exec(i)?.[0]||'','url')||'').split('/').pop()===name);
 if(!item)throw Error(`The build's appcast has no item for ${name}.`);
 const stamp=`<pubDate>${publishedAt.toUTCString().replace('GMT','+0000')}</pubDate>`;
 const moved=item.replace(/(<enclosure\b[^>]*\surl=")[^"]*(")/,`$1${url}$2`);
 return /<pubDate>[^<]*<\/pubDate>/.test(moved)?moved.replace(/<pubDate>[^<]*<\/pubDate>/,stamp):moved.replace(/<\/item>$/,stamp+'</item>');
}
/** A channel feed: the new item first, then (for a channel with history) the old feed's other builds. */
export function macFeed(item,title,old=''){
 const build=itemBuild(item),kept=old?items(old).filter(i=>itemBuild(i)!==build):[];
 return `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>${title}</title><language>en</language>${[item,...kept].join('')}</channel></rss>\n`;
}
/** The item's Ed25519 signature checked against the app's published key, the way the app checks it. */
export async function verifyMacItem(item,file,publicKey){
 const {createPublicKey,verify}=await import('node:crypto');
 const enclosure=/<enclosure\b[^>]*>/.exec(item)?.[0]||'',signature=attribute(enclosure,'sparkle:edSignature')||'';
 if(Number(attribute(enclosure,'length'))!==statSync(file).size)throw Error('The Sparkle item length differs from the DMG.');
 const key=createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:Buffer.from(publicKey,'base64').toString('base64url')},format:'jwk'});
 if(!verify(null,readFileSync(file),key,Buffer.from(signature,'base64')))throw Error('The Sparkle signature does not verify against the published key.');
}
/** The Windows update manifest for an installer under `prefix` (the updater's format, windows-release.ts). */
export const windowsManifest=({version,build,sha256},size,prefix)=>({formatVersion:1,version,build,architecture:'x64',signed:false,url:'/downloads/'+prefix+windowsName(version,build),size,sha256,googleSignIn:true});

async function sha256(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
async function storage(){
 const {S3Client,GetObjectCommand,PutObjectCommand}=await import('@aws-sdk/client-s3');
 const {clientOptions,uploadFile}=await import('./r2-object-upload.mjs');
 const client=new S3Client(clientOptions());
 const read=async key=>{try{return await (await client.send(new GetObjectCommand({Bucket:BUCKET,Key:key}))).Body.transformToString();}catch(error){if(error.$metadata?.httpStatusCode===404||error.name==='NoSuchKey')return '';throw error;}};
 return {read,
  upload:(key,file,type)=>uploadFile(client,BUCKET,key,file,type),
  put:async(key,body,type)=>{await client.send(new PutObjectCommand({Bucket:BUCKET,Key:key,Body:body,ContentType:type,CacheControl:'no-cache'}));if(await read(key)!==body)throw Error('The stored feed differs: '+key);},
  close:()=>client.destroy()};
}

/** Publishes one platform's build to a channel. `dir` holds the build job's output. Refuses to replace a channel's
 * newer build. Returns what it did. */
export async function publish({channel,platform,dir,live=liveChannel(channel),store,now=new Date(),updates=JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/Updates.json'),'utf8'))}){
 const keys=channelKeys(channel,live);
 const origin=new URL(updates.feedURL).origin;
 const own=store||await storage();
 try{
  if(platform==='mac'){
   const dmg=readdirOne(dir,/-macos-universal\.dmg$/),name=path.basename(dmg),appcast=readFileSync(path.join(dir,'appcast.xml'),'utf8');
   const item=macItem(appcast,name,`${origin}/downloads/${keys.prefix}${name}`,now);
   await verifyMacItem(item,dmg,updates.publicKey);
   const build=itemBuild(item),current=await own.read(keys.mac[0]);
   if(feedBuild('mac',current)>=build&&!keys.history)return {skipped:`${keys.mac[0]} already has Build ${feedBuild('mac',current)}`};
   await own.upload(keys.prefix+name,dmg,'application/x-apple-diskimage');
   await own.upload(keys.prefix+name+'.sha256',dmg+'.sha256','text/plain');
   // Feeds go last, so a feed never names an installer that is not there.
   for(const key of keys.mac){
    const old=keys.history?await own.read(key):'';
    if(keys.history&&feedBuild('mac',old)>build)throw Error(`${key} already names a newer Build than ${build}.`);
    await own.put(key,macFeed(item,`Worldlet ${channel}`,old),'application/rss+xml');
   }
   return {published:true,build,keys:[keys.prefix+name,...keys.mac]};
  }
  const exe=readdirOne(dir,/-windows-x64-unsigned\.exe$/),identity=JSON.parse(readFileSync(exe+'.json','utf8'));
  if(identity.sha256!==await sha256(exe))throw Error('The Windows installer differs from its identity.');
  const manifest=windowsManifest(identity,statSync(exe).size,keys.prefix);
  const {parseWindowsManifest}=await import(pathToFileURL(path.join(root,'platform/electron/src/modules/shell/windows-release.ts')).href);
  // The shipped updater reads /downloads/ and /downloads/alpha/; every other field is checked as it would check them.
  parseWindowsManifest(['','alpha/'].includes(keys.prefix)?manifest:{...manifest,url:'/downloads/'+path.basename(exe)});
  const published=feedBuild('windows',await own.read(keys.windows));
  if(published>=identity.build&&!(keys.history&&published===identity.build))return {skipped:`${keys.windows} already has Build ${published}`};
  await own.upload(keys.prefix+path.basename(exe),exe,'application/vnd.microsoft.portable-executable');
  await own.upload(keys.prefix+path.basename(exe)+'.sha256',exe+'.sha256','text/plain');
  await own.put(keys.windows,JSON.stringify(manifest,null,2)+'\n','application/json');
  return {published:true,build:identity.build,keys:[keys.prefix+path.basename(exe),keys.windows]};
 }finally{if(!store)own.close();}
}
function readdirOne(dir,pattern){
 const found=readdirSync(dir).filter(n=>pattern.test(n));
 if(found.length!==1)throw Error(`Expected one ${pattern} in ${dir}, found ${found.length}.`);
 return path.join(dir,found[0]);
}

async function main(){
 const [command,...args]=process.argv.slice(2);
 const arg=name=>{const at=args.indexOf('--'+name);return at<0?undefined:args[at+1];};
 if(command==='identity'){
  // --count <n> --committed-at <iso>: prints the identity (and writes it to the job's outputs).
  const identity=releaseIdentity(Number(arg('count')),arg('committed-at'));
  const lines=Object.entries(identity).map(([k,v])=>`${k}=${v}`);
  if(process.env.GITHUB_OUTPUT)writeFileSync(process.env.GITHUB_OUTPUT,lines.join('\n')+'\n',{flag:'a'});
  console.log(lines.join('\n'));return;
 }
 if(command==='manifest'){
  // --version <native> --build <n> --built-at <iso> --sha <commit> --out <file>: the identity job's outputs as a build manifest.
  const identity={version:arg('version'),build:Number(arg('build')),builtAt:arg('built-at')};
  if(!/^\d{4}\.\d{3,4}\.\d+$/.test(identity.version)||!Number.isSafeInteger(identity.build)||!/^[0-9a-f]{40}$/.test(arg('sha')||''))throw Error('Usage: ci-release.mjs manifest --version --build --built-at --sha --out');
  writeFileSync(arg('out'),JSON.stringify(releaseManifest(identity,arg('sha')),null,2)+'\n');return;
 }
 if(command==='publish'){
  // --channel dev|alpha|beta --platform mac|windows --dir <build output>
  const channel=arg('channel'),platform=arg('platform'),dir=path.resolve(arg('dir')||'');
  if(!CHANNELS[channel]||!['mac','windows'].includes(platform)||!existsSync(dir))throw Error('Usage: ci-release.mjs publish --channel dev|alpha|beta --platform mac|windows --dir <dir>');
  const live=liveChannel(channel),result=await publish({channel,platform,dir,live});
  const line=result.published?`Published ${platform} Build ${result.build} to ${channel}${live?'':' (staging: ci-staging/)'}: ${result.keys.join(', ')}`:`Skipped ${platform} ${channel}: ${result.skipped}`;
  if(process.env.GITHUB_STEP_SUMMARY)writeFileSync(process.env.GITHUB_STEP_SUMMARY,`- ${line}\n`,{flag:'a'});
  console.log(line);return;
 }
 throw Error('Usage: ci-release.mjs identity … | publish …');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 // SDK errors can carry signed request details; print only the classification.
 console.error(error.$metadata?`R2 request failed: ${error.name}, HTTP ${error.$metadata.httpStatusCode??'unknown'}.`:error.message);
 process.exitCode=1;
});
