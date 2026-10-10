// Desktop releases from GitHub Actions (.github/workflows/release.yml, docs/RELEASING.md). This repository builds,
// signs and publishes the Mac and Windows apps itself, and keeps them on its own GitHub Releases (owner decision
// 2026-10-08): no release machine and no separate storage.
//
// Where things live:
//  v<label>          one release per Build, holding the Mac DMG, the Windows installer and their checksums. A prerelease
//                    until the Build is promoted to Beta, which makes it the repository's latest release.
//  channel-<name>    one release per channel (dev, alpha, beta) holding that channel's update feeds, replaced in place,
//                    so a feed's address never changes: releases/download/channel-<name>/<feed>.
//  staging-<name>    the same for a channel that is not live yet (platform/electron/distribution/Channels.json): CI
//                    publishes there while the release machines still run the channel, and nothing reads it.
// Channels are the in-app update channels (core/distribution/update-channel.ts):
//  dev    every push to main; alpha  a Dev build promoted by a maintainer; beta  an Alpha build promoted, the public
//  download, whose feeds keep history. Promotion never rebuilds: it only names the same installer in another feed.
// The website's old /downloads/ addresses forward to these (installed apps that read them keep updating).
//
// Build numbers: Build = BUILD_OFFSET + the commit's position on main (git rev-list --count). The offset keeps every
// build of this repository above the builds the release machines published before it (up to about 3,300), so installed
// apps keep updating; the label is YYYY.MMDD.<build>, the date being the commit's day in Pacific time.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createReadStream,existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export const BUILD_OFFSET=4000;
export const CHANNELS={
 dev:{prefix:'dev/',mac:['appcast-dev.xml'],windows:'windows-dev.json',history:false},
 alpha:{prefix:'alpha/',mac:['appcast-alpha.xml'],windows:'windows-alpha.json',history:false},
 beta:{prefix:'',mac:['appcast.xml','appcast-intel.xml'],windows:'windows-preview.json',history:true},
};
export const macName=(version,build)=>`Worldlet-${version}-${build}-macos-universal.dmg`;
export const windowsName=(version,build)=>`Worldlet-${version}-${build}-windows-x64-unsigned.exe`;

/** The release identity of a commit: its Build, native version and label. `committedAt` is the commit time. */
export function releaseIdentity(count,committedAt,offset=BUILD_OFFSET){
 const build=offset+count;
 if(!Number.isSafeInteger(count)||count<1||build>65535)throw Error('Invalid commit position '+count);
 const date=new Date(committedAt);if(!Number.isFinite(date.getTime()))throw Error('Invalid commit time');
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));
 const version=`${p.year}.${Number(p.month)*100+Number(p.day)}.${build}`;
 return {version,build,label:labelOf(version),builtAt:date.toISOString().replace(/\.\d{3}Z$/,'Z')};
}
/** The public label of a native version: 2026.105.4001 → 2026.0105.4001. */
export function labelOf(version){
 const m=/^(\d{4})\.(\d{3,4})\.(\d+)$/.exec(version||'');if(!m)throw Error('Invalid release version '+version);
 return `${m[1]}.${m[2].padStart(4,'0')}.${m[3]}`;
}
/** The manifest scripts/build-info.ts reads through WORLDLET_RELEASE_MANIFEST: the identity, bound to its commit. */
export const releaseManifest=(identity,sourceCommit)=>({version:identity.version,build:identity.build,platformBuilds:{mac:identity.build,windows:identity.build},builtAt:identity.builtAt,sourceCommit});

/** Whether a channel publishes to its live feeds, from the committed Channels.json. */
export function liveChannel(channel,config=JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/Channels.json'),'utf8'))){
 if(!CHANNELS[channel])throw Error('Unknown channel '+channel);
 return Array.isArray(config.live)&&config.live.includes(channel);
}
/** Where a channel's feeds go: the release `channel-<name>`, or `staging-<name>` while it is not live. */
export function channelKeys(channel,live){
 const c=CHANNELS[channel];
 return {feedTag:(live?'channel-':'staging-')+channel,prefix:c.prefix,mac:c.mac,windows:c.windows,history:c.history};
}
export const assetURL=(repo,tag,name)=>`https://github.com/${repo}/releases/download/${tag}/${name}`;

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
/** The Windows update manifest. `url` is the website path installed updaters read (they accept only /downloads/ and
 * /downloads/alpha/ on the website, which forwards to the release); `download` is the release asset itself. */
export const windowsManifest=({version,build,sha256},size,prefix,download)=>({formatVersion:1,version,build,architecture:'x64',signed:false,url:'/downloads/'+prefix+windowsName(version,build),size,sha256,googleSignIn:true,download});

async function sha256(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
/** GitHub Releases of this repository through the gh CLI (GH_TOKEN with contents: write). */
export function githubStore(repo=process.env.GITHUB_REPOSITORY,gh=(args,input)=>spawnSync('gh',args,{encoding:'utf8',input,maxBuffer:64*1024*1024})){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo||''))throw Error('Set GITHUB_REPOSITORY.');
 const run=(...args)=>{const r=gh(args);if(r.status!==0)throw Error(`gh ${args.slice(0,2).join(' ')} failed: ${(r.stderr||'').trim().slice(0,300)}`);return r.stdout;};
 const release=tag=>{const r=gh(['api',`repos/${repo}/releases/tags/${tag}`]);if(r.status===0)return JSON.parse(r.stdout);if(/HTTP 404|Not Found/.test(r.stderr||''))return null;throw Error(`Could not read release ${tag}: ${(r.stderr||'').trim().slice(0,300)}`);};
 const scratch=mkdtempSync(path.join(os.tmpdir(),'ci-release-'));
 return {
  repo,
  ensure(tag,{title,target,prerelease=true,notes=''}){
   if(release(tag))return;
   const r=gh(['release','create',tag,'--repo',repo,'--title',title,'--notes',notes||title,...(target?['--target',target]:[]),...(prerelease?['--prerelease']:[]),'--latest=false']);
   // The Mac and Windows jobs publish side by side: the other one may have just created it.
   if(r.status!==0&&!release(tag))throw Error(`Could not create release ${tag}: ${(r.stderr||'').trim().slice(0,300)}`);
  },
  read(tag,name){
   const found=release(tag)?.assets?.find(a=>a.name===name);if(!found)return '';
   const out=path.join(scratch,'read-'+name);rmSync(out,{force:true});
   run('release','download',tag,'--repo',repo,'--pattern',name,'--output',out);
   return readFileSync(out,'utf8');
  },
  // Installers are immutable: an asset already there must be the same size (a re-run), never replaced.
  upload(tag,file){
   const found=release(tag)?.assets?.find(a=>a.name===path.basename(file));
   if(found){if(found.size!==statSync(file).size)throw Error(`${tag}/${found.name} already exists with different bytes.`);return {reused:true};}
   run('release','upload',tag,file,'--repo',repo);return {reused:false};
  },
  put(tag,name,body){
   const file=path.join(scratch,name);writeFileSync(file,body);
   run('release','upload',tag,file,'--repo',repo,'--clobber');
   if(this.read(tag,name)!==body)throw Error(`The stored feed differs: ${tag}/${name}`);
  },
  promote(tag){run('release','edit',tag,'--repo',repo,'--prerelease=false','--latest');},
  // The release of a Build (v<label>) and its asset names, or null.
  findBuild(build){
   const r=gh(['api',`repos/${repo}/releases?per_page=100`,'--jq','[.[]|{tag:.tag_name,assets:[.assets[].name]}]']);
   if(r.status!==0)throw Error(`Could not list releases: ${(r.stderr||'').trim().slice(0,300)}`);
   const tag=new RegExp(`^v\\d{4}\\.\\d{4}\\.${Number(build)}$`);
   return JSON.parse((r.stdout||'').trim()||'[]').find(x=>tag.test(x.tag))||null;
  },
  download(tag,name,out){rmSync(out,{force:true});run('release','download',tag,'--repo',repo,'--pattern',name,'--output',out);},
  // GitHub refuses this workflow's token a new tag on a commit whose .github/workflows differ from main's ("Resource
  // not accessible by integration": a new tag counts as a workflow change). That happens only after a newer push
  // changed a workflow, and that push runs its own Dev build, so the older build is superseded. Names the changes.
  superseded(tag,sha){
   if(release(tag))return '';
   const r=gh(['api',`repos/${repo}/compare/${sha}...main`,'--jq','[.files[]?.filename|select(startswith(".github/workflows/"))]|join(", ")']);
   if(r.status!==0)throw Error(`Could not compare ${sha} with main: ${(r.stderr||'').trim().slice(0,300)}`);
   return r.stdout.trim();
  },
  close(){rmSync(scratch,{recursive:true,force:true});},
 };
}

/** Publishes one platform's build to a channel. `dir` holds the build job's output (with release.json, its
 * identity). Refuses to replace a channel's newer build. Returns what it did. */
export async function publish({channel,platform,dir,live=liveChannel(channel),store,now=new Date(),updates=JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/Updates.json'),'utf8'))}){
 const keys=channelKeys(channel,live),own=store||githubStore();
 const identity=JSON.parse(readFileSync(path.join(dir,'release.json'),'utf8')),label=labelOf(identity.version),tag='v'+label;
 try{
  const changed=channel==='dev'&&own.superseded?await own.superseded(tag,identity.sourceCommit):'';
  if(changed)return {skipped:`main has changed ${changed} since ${identity.sourceCommit}, so GitHub refuses a tag there; the newer push publishes a newer Dev build`};
  await own.ensure(tag,{title:`Worldlet v${label}`,target:identity.sourceCommit,notes:`Build ${identity.build} of ${identity.sourceCommit}.`});
  await own.ensure(keys.feedTag,{title:`Worldlet ${channel} channel${live?'':' (staging)'}`,notes:`The ${channel} channel's update feeds. Installed apps read them here; the installers are in each build's release.`});
  let result;
  if(platform==='mac'){
   const dmg=readdirOne(dir,/-macos-universal\.dmg$/),name=path.basename(dmg),appcast=readFileSync(path.join(dir,'appcast.xml'),'utf8');
   const item=macItem(appcast,name,assetURL(own.repo,tag,name),now);
   await verifyMacItem(item,dmg,updates.publicKey);
   const build=itemBuild(item);if(build!==identity.build)throw Error('The DMG is not this Build.');
   const current=feedBuild('mac',await own.read(keys.feedTag,keys.mac[0]));
   if(current>=build&&!keys.history)return {skipped:`${keys.feedTag}/${keys.mac[0]} already has Build ${current}`};
   await own.upload(tag,dmg);await own.upload(tag,dmg+'.sha256');
   // The build's own records beside it, so a promotion fetches everything from the release (fetchBuild).
   writeFileSync(dmg+'.appcast.xml',appcast);await own.upload(tag,dmg+'.appcast.xml');
   writeFileSync(dmg+'.release.json',readFileSync(path.join(dir,'release.json')));await own.upload(tag,dmg+'.release.json');
   // Feeds go last, so a feed never names an installer that is not there.
   for(const name of keys.mac){
    const old=keys.history?await own.read(keys.feedTag,name):'';
    if(keys.history&&feedBuild('mac',old)>build)throw Error(`${keys.feedTag}/${name} already names a newer Build than ${build}.`);
    await own.put(keys.feedTag,name,macFeed(item,`Worldlet ${channel}`,old));
   }
   result={published:true,build,keys:[`${tag}/${name}`,...keys.mac.map(n=>`${keys.feedTag}/${n}`)]};
  }else{
   const exe=readdirOne(dir,/-windows-x64-unsigned\.exe$/),built=JSON.parse(readFileSync(exe+'.json','utf8')),name=path.basename(exe);
   if(built.sha256!==await sha256(exe)||built.build!==identity.build)throw Error('The Windows installer differs from its identity.');
   const manifest=windowsManifest(built,statSync(exe).size,keys.prefix,assetURL(own.repo,tag,name));
   const {parseWindowsManifest}=await import(pathToFileURL(path.join(root,'platform/electron/src/modules/shell/windows-release.ts')).href);
   // The shipped updater reads /downloads/ and /downloads/alpha/; every other field is checked as it would check them.
   parseWindowsManifest(['','alpha/'].includes(keys.prefix)?manifest:{...manifest,url:'/downloads/'+name});
   const current=feedBuild('windows',await own.read(keys.feedTag,keys.windows));
   if(current>identity.build||current===identity.build&&!keys.history)return {skipped:`${keys.feedTag}/${keys.windows} already has Build ${current}`};
   await own.upload(tag,exe);await own.upload(tag,exe+'.sha256');
   await own.upload(tag,exe+'.json');
   writeFileSync(exe+'.release.json',readFileSync(path.join(dir,'release.json')));await own.upload(tag,exe+'.release.json');
   // The Store MSIX of the same Build, when its build succeeded (release machine 01 submits it once the Build is on Beta).
   const msix=exe.replace(/-unsigned\.exe$/,'-store.msix');
   if(existsSync(msix)&&existsSync(msix+'.json')){
    const record=JSON.parse(readFileSync(msix+'.json','utf8'));
    if(record.sha256!==await sha256(msix)||record.build!==identity.build||record.distributionChannel!=='microsoft-store')throw Error('The Store MSIX differs from its record.');
    await own.upload(tag,msix);await own.upload(tag,msix+'.json');
   }
   await own.put(keys.feedTag,keys.windows,JSON.stringify(manifest,null,2)+'\n');
   result={published:true,build:identity.build,keys:[`${tag}/${name}`,`${keys.feedTag}/${keys.windows}`]};
  }
  // A Build on live Beta is the public release: no longer a prerelease, and the repository's latest.
  if(channel==='beta'&&live)await own.promote(tag);
  return result;
 }finally{if(!store)own.close();}
}
/** A published Build's files from its release, laid out as `publish` reads them (`<dir>/mac`, `<dir>/windows`): the
 * installer, its checksum, its build records (the Sparkle item, the Windows record, release.json) and the Store MSIX when
 * there is one. Promotion uses it: the release machines build the Dev packages (owner decision 2026-10-10), so there is no
 * workflow artifact. Throws when the release lacks a record (a Build published before the records were kept). */
export async function fetchBuild({build,dir,store,platforms=['mac','windows']}){
 const own=store||githubStore();
 try{
  const found=await own.findBuild(build);
  if(!found)throw Error(`No release for Build ${build}.`);
  const has=new Set(found.assets);
  const files={
   mac:[[/-macos-universal\.dmg$/,''],[/-macos-universal\.dmg$/,'.sha256'],[/-macos-universal\.dmg$/,'.appcast.xml','appcast.xml'],[/-macos-universal\.dmg$/,'.release.json','release.json']],
   windows:[[/-windows-x64-unsigned\.exe$/,''],[/-windows-x64-unsigned\.exe$/,'.sha256'],[/-windows-x64-unsigned\.exe$/,'.json'],[/-windows-x64-unsigned\.exe$/,'.release.json','release.json'],[/-windows-x64-store\.msix$/,'',null,true],[/-windows-x64-store\.msix$/,'.json',null,true]],
  };
  const out={};
  for(const [platform,list] of Object.entries(files).filter(([p])=>platforms.includes(p))){
   const target=path.join(dir,platform);mkdirSync(target,{recursive:true});
   for(const [pattern,suffix,as,optional] of list){
    const base=found.assets.find(n=>pattern.test(n));
    if(!base||!has.has(base+suffix)){if(optional)continue;throw Error(`Build ${build}'s release has no ${base?base+suffix:pattern.source} for ${platform}.`);}
    await own.download(found.tag,base+suffix,path.join(target,as||base+suffix));
   }
   out[platform]=target;
  }
  return {tag:found.tag,...out};
 }finally{if(!store)own.close?.();}
}

// The Dev tests (release.yml's `checks` job, the pull request checks of architecture.yml) as seen in this run's job list:
// 'pass' once all of them succeeded, 'fail' once one failed, 'wait' meanwhile. A build publishes to Dev only after
// 'pass' (owner decision 2026-10-09: CI runs the Dev tests before each Dev release; within five minutes since 2026-10-10).
export const DEV_TESTS='Dev tests / ',DEV_TEST_JOBS=4; // Static, Fast and Operational checks and UI checks
export function devTests(jobs){
 const mine=jobs.filter(j=>j.name.startsWith(DEV_TESTS)&&j.conclusion!=='skipped');
 const failed=mine.filter(j=>j.status==='completed'&&j.conclusion!=='success').map(j=>j.name.slice(DEV_TESTS.length));
 if(failed.length)return {state:'fail',failed};
 return mine.length>=DEV_TEST_JOBS&&mine.every(j=>j.status==='completed')?{state:'pass',failed:[]}:{state:'wait',failed:[]};
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
  const line=result.published?`Published ${platform} Build ${result.build} to ${channel}${live?'':' (staging)'}: ${result.keys.join(', ')}`:`Skipped ${platform} ${channel}: ${result.skipped}`;
  if(process.env.GITHUB_STEP_SUMMARY)writeFileSync(process.env.GITHUB_STEP_SUMMARY,`- ${line}\n`,{flag:'a'});
  console.log(line);return;
 }
 if(command==='fetch'){
  // --build <n> --dir <dir> [--platform mac,windows]: the Build's files from its release, for a promotion.
  const build=Number(arg('build')),dir=path.resolve(arg('dir')||''),platforms=(arg('platform')||'mac,windows').split(',');
  if(!Number.isSafeInteger(build)||!arg('dir')||!platforms.every(p=>['mac','windows'].includes(p)))throw Error('Usage: ci-release.mjs fetch --build <n> --dir <dir> [--platform mac,windows]');
  const r=await fetchBuild({build,dir,platforms});console.log(`Fetched Build ${build} from ${r.tag} into ${dir}`);return;
 }
 if(command==='analytics'){
  // Writes the PostHog project key (POSTHOG_PROJECT_KEY, a release secret) into the app's analytics config. This
  // repository keeps the key empty; a build without it would send no crash or usage events (owner decision 2026-10-09).
  const key=(process.env.POSTHOG_PROJECT_KEY||'').trim(),file=path.join(root,'platform/electron/distribution/Analytics.json');
  if(!/^phc_\w+$/.test(key))throw Error('POSTHOG_PROJECT_KEY is not a PostHog project key.');
  writeFileSync(file,JSON.stringify({...JSON.parse(readFileSync(file,'utf8')),projectKey:key},null,2)+'\n');
  // The build still counts as a clean commit (ci-build.sh refuses a dirty checkout; sourceDirty in build-info).
  const r=spawnSync('git',['update-index','--skip-worktree',path.relative(root,file)],{cwd:root,encoding:'utf8'});
  if(r.status!==0)throw Error(`git update-index failed: ${(r.stderr||'').trim()}`);
  console.log('Analytics.json carries the PostHog project key.');return;
 }
 if(command==='dev-tests'){
  // Waits for this run's Dev tests; fails when one of them failed or they took longer than --minutes (default 20).
  const repo=process.env.GITHUB_REPOSITORY,run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT||'1',limit=Date.now()+Number(arg('minutes')||20)*60_000;
  for(;;){
   const r=spawnSync('gh',['api',`repos/${repo}/actions/runs/${run}/attempts/${attempt}/jobs?per_page=100`,'--jq','.jobs'],{encoding:'utf8'});
   const result=r.status===0?devTests(JSON.parse(r.stdout||'[]')):{state:'wait',failed:[]};
   if(result.state==='pass'){console.log('The Dev tests passed.');return;}
   if(result.state==='fail')throw Error('The Dev tests failed ('+result.failed.join(', ')+'): nothing is published.');
   if(Date.now()>limit)throw Error('The Dev tests did not finish in time: nothing is published.');
   await new Promise(resolve=>setTimeout(resolve,10_000));
  }
 }
 throw Error('Usage: ci-release.mjs identity … | manifest … | publish … | fetch … | analytics | dev-tests');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 console.error(error.message);
 process.exitCode=1;
});
