// Checks the CI release pipeline (scripts/ci-release.mjs, .github/workflows/release.yml) without signing or storage.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BUILD_OFFSET,channelKeys,devTests,githubStore,labelOf,feedBuild,liveChannel,macFeed,macItem,publish,releaseIdentity,releaseManifest,verifyMacItem,windowsManifest} from './ci-release.mjs';

// Build = offset + commit position; the label is the commit's Pacific day.
const id=releaseIdentity(12,'2026-10-09T05:30:00Z');
assert.deepEqual(id,{version:'2026.1008.4012',build:4012,label:'2026.1008.4012',builtAt:'2026-10-09T05:30:00Z'});
assert.equal(releaseIdentity(1,'2027-01-05T20:00:00Z').label,'2027.0105.4001');
assert.equal(releaseIdentity(1,'2027-01-05T20:00:00Z').version,'2027.105.4001');
assert.throws(()=>releaseIdentity(0,'2026-10-09T05:30:00Z'));
assert.throws(()=>releaseIdentity(65536-BUILD_OFFSET,'2026-10-09T05:30:00Z'));
assert.deepEqual(releaseManifest(id,'a'.repeat(40)).platformBuilds,{mac:4012,windows:4012});
// The builds this repository publishes stay above every build the release hosts published before it.
assert(BUILD_OFFSET>=3400);

// Channels: live ones use the feeds installed apps read; others go to staging releases nothing reads.
assert.equal(liveChannel('dev',{live:['dev']}),true);
assert.equal(liveChannel('beta',{live:['dev']}),false);
assert.throws(()=>liveChannel('nightly',{live:[]}));
assert.deepEqual(channelKeys('alpha',true),{feedTag:'channel-alpha',prefix:'alpha/',mac:['appcast-alpha.xml'],windows:'windows-alpha.json',history:false});
assert.deepEqual(channelKeys('beta',true),{feedTag:'channel-beta',prefix:'',mac:['appcast.xml','appcast-intel.xml'],windows:'windows-preview.json',history:true});
assert.equal(channelKeys('beta',false).feedTag,'staging-beta');
assert.equal(labelOf('2026.105.4001'),'2026.0105.4001');
const committed=JSON.parse(readFileSync(new URL('../platform/electron/distribution/Channels.json',import.meta.url),'utf8'));
assert(committed.live.every(c=>['dev','alpha','beta'].includes(c)));

// A Sparkle item keeps its signature and points at the build's release; history keeps other builds.
const dir=mkdtempSync(path.join(os.tmpdir(),'ci-release-check-'));
const dmg=path.join(dir,'Worldlet-2026.1008.4012-4012-macos-universal.dmg');writeFileSync(dmg,'disk image bytes');writeFileSync(dmg+'.sha256','x');
writeFileSync(path.join(dir,'release.json'),JSON.stringify(releaseManifest(id,'c'.repeat(40))));
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const raw=publicKey.export({format:'jwk'}).x,signature=sign(null,readFileSync(dmg),privateKey).toString('base64');
const appcast=`<rss><channel><item><title>2026.1008.4012</title><pubDate>Thu, 08 Oct 2026 12:00:00 +0000</pubDate><sparkle:version>4012</sparkle:version><enclosure url="https://example.com/downloads/${path.basename(dmg)}" length="16" type="application/octet-stream" sparkle:edSignature="${signature}"/></item></channel></rss>`;
writeFileSync(path.join(dir,'appcast.xml'),appcast);
const url='https://github.com/example/worldlet/releases/download/v2026.1008.4012/'+path.basename(dmg);
const item=macItem(appcast,path.basename(dmg),url,new Date('2026-10-09T00:00:00Z'));
assert(item.includes(`url="${url}"`));
assert.match(item,/<pubDate>Fri, 09 Oct 2026 00:00:00 \+0000<\/pubDate>/);
const key=Buffer.from(raw,'base64url').toString('base64');
await verifyMacItem(item,dmg,key);
await assert.rejects(verifyMacItem(item.replace(signature,sign(null,Buffer.from('other'),privateKey).toString('base64')),dmg,key));
const old='<rss><channel><item><sparkle:version>3300</sparkle:version></item><item><sparkle:version>4012</sparkle:version></item></channel></rss>';
const merged=macFeed(item,'Worldlet beta',old);
assert.equal(feedBuild('mac',merged),4012);
assert.equal((merged.match(/<item>/g)||[]).length,2,'the same build is replaced, older builds stay');
assert.equal(feedBuild('windows','{"build":4012}'),4012);
assert.equal(feedBuild('windows','not json'),0);
const manifest=windowsManifest({version:'2026.1008.4012',build:4012,sha256:'f'.repeat(64)},1e6,'dev/','https://example.com/x.exe');
assert.equal(manifest.url,'/downloads/dev/Worldlet-2026.1008.4012-4012-windows-x64-unsigned.exe');
assert.equal(manifest.download,'https://example.com/x.exe');

// Publication: release, installer, then feeds; a channel's newer build is never replaced.
const store=(assets={})=>{const writes=[];return {repo:'example/worldlet',writes,assets,
 ensure:async tag=>{writes.push('ensure '+tag);},read:async(tag,name)=>assets[tag+'/'+name]||'',
 upload:async(tag,file)=>{writes.push(tag+'/'+path.basename(file));},put:async(tag,name,body)=>{writes.push(tag+'/'+name);assets[tag+'/'+name]=body;},
 promote:async tag=>{writes.push('promote '+tag);}};};
const updates={feedURL:'https://example.com/downloads/appcast.xml',publicKey:key};
await assert.rejects(publish({channel:'dev',platform:'mac',dir,live:true,store:store()}),/signature/,'an item not signed by the published key is refused');
const dev=store();
assert.equal((await publish({channel:'dev',platform:'mac',dir,live:true,store:dev,updates})).build,4012);
const name=path.basename(dmg);
assert.deepEqual(dev.writes,['ensure v2026.1008.4012','ensure channel-dev','v2026.1008.4012/'+name,'v2026.1008.4012/'+name+'.sha256','channel-dev/appcast-dev.xml']);
assert(dev.assets['channel-dev/appcast-dev.xml'].includes(url));
const newer=store({'channel-alpha/appcast-alpha.xml':'<item><sparkle:version>4013</sparkle:version></item>'});
assert.match((await publish({channel:'alpha',platform:'mac',dir,live:true,store:newer,updates})).skipped,/4013/);
assert(!newer.writes.some(w=>w.startsWith('v2026')&&w.includes('/')),'nothing is uploaded over a newer build');
const beta=store({'channel-beta/appcast.xml':old,'channel-beta/appcast-intel.xml':old});
await publish({channel:'beta',platform:'mac',dir,live:true,store:beta,updates});
assert.equal((beta.assets['channel-beta/appcast.xml'].match(/<item>/g)||[]).length,2);
assert.equal(beta.writes.at(-1),'promote v2026.1008.4012','a live Beta build becomes the latest release');
await assert.rejects(publish({channel:'beta',platform:'mac',dir,live:true,store:store({'channel-beta/appcast.xml':'<item><sparkle:version>5000</sparkle:version></item>'}),updates}),/newer/);
const staged=store();
await publish({channel:'beta',platform:'mac',dir,live:false,store:staged,updates});
assert(staged.writes.every(w=>!w.includes('channel-')&&!w.startsWith('promote')),'a channel that is not live writes only to its staging release');
const superseded=Object.assign(store(),{superseded:async()=>'.github/workflows/rc.yml'});
assert.match((await publish({channel:'dev',platform:'mac',dir,live:true,store:superseded,updates})).skipped,/rc\.yml/,'a Dev build whose tag GitHub would refuse is skipped');
assert.deepEqual(superseded.writes,[]);

// Windows: the installer, then the Store MSIX of the same Build when it was built, then the feed.
{
 const wdir=mkdtempSync(path.join(os.tmpdir(),'ci-release-windows-'));
 writeFileSync(path.join(wdir,'release.json'),JSON.stringify(releaseManifest(id,'c'.repeat(40))));
 const exe=path.join(wdir,'Worldlet-2026.1008.4012-4012-windows-x64-unsigned.exe');writeFileSync(exe,Buffer.alloc(200000,1));writeFileSync(exe+'.sha256','x');
 const digest=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
 writeFileSync(exe+'.json',JSON.stringify({version:'2026.1008.4012',build:4012,sha256:digest(exe),googleSignIn:true}));
 const plain=store();await publish({channel:'dev',platform:'windows',dir:wdir,live:true,store:plain});
 assert.deepEqual(plain.writes.slice(2),['v2026.1008.4012/'+path.basename(exe),'v2026.1008.4012/'+path.basename(exe)+'.sha256','channel-dev/windows-dev.json'],'no Store MSIX: the installer alone');
 const msix=exe.replace(/-unsigned\.exe$/,'-store.msix');writeFileSync(msix,'store package bytes');
 writeFileSync(msix+'.json',JSON.stringify({build:4012,distributionChannel:'microsoft-store',sha256:digest(msix)}));
 const withStore=store();await publish({channel:'dev',platform:'windows',dir:wdir,live:true,store:withStore});
 assert.deepEqual(withStore.writes.slice(4),['v2026.1008.4012/'+path.basename(msix),'v2026.1008.4012/'+path.basename(msix)+'.json','channel-dev/windows-dev.json'],'the Store MSIX goes beside the installer, before the feed');
 writeFileSync(msix,'other bytes');
 await assert.rejects(publish({channel:'dev',platform:'windows',dir:wdir,live:true,store:store()}),/Store MSIX differs/);
 rmSync(wdir,{recursive:true,force:true});
}

// The GitHub store: reads only listed assets, never replaces an installer with other bytes, tolerates a parallel create.
{
 const calls=[];let created=false;
 const fake=(args)=>{calls.push(args.join(' '));
  if(args[0]==='api')return created||args[1].endsWith('/v1')?{status:0,stdout:JSON.stringify({assets:[{name:path.basename(dmg),size:1}]})}:{status:1,stderr:'gh: Not Found (HTTP 404)'};
  if(args[0]==='release'&&args[1]==='create'){created=true;return {status:1,stderr:'already exists'};}
  return {status:0,stdout:''};};
 const gh=githubStore('example/worldlet',fake);
 await gh.ensure('v2',{title:'t'});
 assert.equal(await gh.read('v0','appcast.xml'),'');
 assert.throws(()=>gh.upload('v1',dmg),/different bytes/);
 gh.close();
 const compare=(stdout,exists=false)=>githubStore('example/worldlet',args=>args[1].startsWith('repos/example/worldlet/releases/')?(exists?{status:0,stdout:'{}'}:{status:1,stderr:'HTTP 404'}):{status:0,stdout});
 assert.equal(compare('.github/workflows/rc.yml\n').superseded('v9','abc'),'.github/workflows/rc.yml');
 assert.equal(compare('').superseded('v9','abc'),'');
 assert.equal(compare('.github/workflows/rc.yml',true).superseded('v9','abc'),'','a tag that already exists needs no new ref');
}

// A Dev build publishes only after this run's Dev tests passed.
const job=(name,status,conclusion=null)=>({name:'Dev tests / '+name,status,conclusion});
assert.equal(devTests([job('Static checks','completed','success')]).state,'wait','all three must finish');
assert.equal(devTests([job('Static checks','completed','success'),job('Fast checks','completed','success'),job('Operational checks','completed','success'),job('Architecture','completed','skipped'),{name:'Mac',status:'in_progress'}]).state,'pass');
assert.deepEqual(devTests([job('Static checks','completed','failure'),job('Fast checks','in_progress')]),{state:'fail',failed:['Static checks']});

// The workflow: never on pull requests, secrets only in jobs of the protected `release` environment on main.
const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
// Nothing cancels a running build: each platform's build waits in its own group, where a newer push replaces only a
// waiting build (2026-10-09: whole-run cancelling starved Mac Dev for over an hour).
assert(!/cancel-in-progress: (true|\$\{\{)/.test(workflow),'no run or build is cancelled once it runs; promotions are never cancelled');
for(const [platform,group] of [['mac','release-dev-mac'],['windows','release-dev-windows']])
 assert(new RegExp(`\\n  ${platform}:\\n(?:    .*\\n)*?    concurrency:\\n      group: ${group}\\n      cancel-in-progress: false\\n`).test(workflow),`${platform}: one build at a time, the newest waiting`);
assert(!/^\s*(pull_request|pull_request_target|merge_group)\s*:/m.test(workflow),'release.yml never runs for pull requests');
const jobs=workflow.split(/\n  (?=[a-z][\w-]*:\n)/).slice(1);
for(const job of jobs){
 const name=job.split(':')[0];
 if(/secrets\./.test(job))assert(/\n    environment: release\n/.test(job),`${name}: secrets only in the release environment`);
}
assert(/if: github\.repository == 'clockless-org\/worldlet' && github\.ref == 'refs\/heads\/main'/.test(workflow),'only clockless-org/worldlet main releases');
assert(/worldlet\/\$CHANNEL-\$platform/.test(workflow)&&/for platform in mac windows/.test(workflow),'a promotion requires both release machines to have passed the channel\'s tests');
assert.equal((workflow.match(/node scripts\/ci-release\.mjs analytics/g)||[]).length,2,'both platform builds carry the PostHog key');
assert.equal((workflow.match(/secrets\.POSTHOG_PROJECT_KEY != ''/g)||[]).length,2,'no build without the PostHog key');
console.log('ci-release checks passed');
