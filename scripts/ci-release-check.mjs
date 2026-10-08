// Checks the CI release pipeline (scripts/ci-release.mjs, .github/workflows/release.yml) without signing or storage.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BUILD_OFFSET,channelKeys,feedBuild,liveChannel,macFeed,macItem,publish,releaseIdentity,releaseManifest,verifyMacItem,windowsManifest} from './ci-release.mjs';

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

// Channels: live ones use the feeds installed apps read; others stay under ci-staging/.
assert.equal(liveChannel('dev',{live:['dev']}),true);
assert.equal(liveChannel('beta',{live:['dev']}),false);
assert.throws(()=>liveChannel('nightly',{live:[]}));
assert.deepEqual(channelKeys('alpha',true),{prefix:'alpha/',mac:['appcast-alpha.xml'],windows:'windows-alpha.json',history:false});
assert.deepEqual(channelKeys('beta',true),{prefix:'',mac:['appcast.xml','appcast-intel.xml'],windows:'windows-preview.json',history:true});
assert.deepEqual(channelKeys('beta',false),{prefix:'ci-staging/beta/',mac:['ci-staging/beta/appcast.xml','ci-staging/beta/appcast-intel.xml'],windows:'ci-staging/beta/windows-preview.json',history:true});
assert.equal(channelKeys('dev',false).windows,'ci-staging/dev/windows-dev.json');
const committed=JSON.parse(readFileSync(new URL('../platform/electron/distribution/Channels.json',import.meta.url),'utf8'));
assert(committed.live.every(c=>['dev','alpha','beta'].includes(c)));

// A Sparkle item keeps its signature and moves to the channel's address; history keeps other builds.
const dir=mkdtempSync(path.join(os.tmpdir(),'ci-release-check-'));
const dmg=path.join(dir,'Worldlet-2026.1008.4012-4012-macos-universal.dmg');writeFileSync(dmg,'disk image bytes');writeFileSync(dmg+'.sha256','x');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const raw=publicKey.export({format:'jwk'}).x,signature=sign(null,readFileSync(dmg),privateKey).toString('base64');
const appcast=`<rss><channel><item><title>2026.1008.4012</title><pubDate>Thu, 08 Oct 2026 12:00:00 +0000</pubDate><sparkle:version>4012</sparkle:version><enclosure url="https://example.com/downloads/${path.basename(dmg)}" length="16" type="application/octet-stream" sparkle:edSignature="${signature}"/></item></channel></rss>`;
writeFileSync(path.join(dir,'appcast.xml'),appcast);
const item=macItem(appcast,path.basename(dmg),'https://example.com/downloads/dev/'+path.basename(dmg),new Date('2026-10-09T00:00:00Z'));
assert.match(item,/url="https:\/\/example\.com\/downloads\/dev\/Worldlet-2026\.1008\.4012-4012-macos-universal\.dmg"/);
assert.match(item,/<pubDate>Fri, 09 Oct 2026 00:00:00 \+0000<\/pubDate>/);
await verifyMacItem(item,dmg,Buffer.from(raw,'base64url').toString('base64'));
await assert.rejects(verifyMacItem(item.replace(signature,sign(null,Buffer.from('other'),privateKey).toString('base64')),dmg,Buffer.from(raw,'base64url').toString('base64')));
const old='<rss><channel><item><sparkle:version>3300</sparkle:version></item><item><sparkle:version>4012</sparkle:version></item></channel></rss>';
const merged=macFeed(item,'Worldlet beta',old);
assert.equal(feedBuild('mac',merged),4012);
assert.equal((merged.match(/<item>/g)||[]).length,2,'the same build is replaced, older builds stay');
assert.equal(feedBuild('mac',macFeed(item,'Worldlet dev')),4012);
assert.equal(feedBuild('windows','{"build":4012}'),4012);
assert.equal(feedBuild('windows','not json'),0);
assert.equal(windowsManifest({version:'2026.1008.4012',build:4012,sha256:'f'.repeat(64)},1e6,'dev/').url,'/downloads/dev/Worldlet-2026.1008.4012-4012-windows-x64-unsigned.exe');

// Publication: installer first, then feeds; a channel's newer build is never replaced.
const store=(feeds={})=>{const writes=[];return {writes,feeds,read:async k=>feeds[k]||'',upload:async k=>{writes.push(k);},put:async(k,body)=>{writes.push(k);feeds[k]=body;}};};
const updates={feedURL:'https://example.com/downloads/appcast.xml',publicKey:Buffer.from(raw,'base64url').toString('base64')};
const own=store();
await assert.rejects(publish({channel:'dev',platform:'mac',dir,live:true,store:own}),/signature/,'an item not signed by the published key is refused');
assert.deepEqual(own.writes,[]);
const dev=store();
assert.equal((await publish({channel:'dev',platform:'mac',dir,live:true,store:dev,updates})).build,4012);
assert.deepEqual(dev.writes,['dev/'+path.basename(dmg),'dev/'+path.basename(dmg)+'.sha256','appcast-dev.xml']);
assert.match(dev.feeds['appcast-dev.xml'],/downloads\/dev\/Worldlet-2026\.1008\.4012/);
const newer=store({'appcast-alpha.xml':'<item><sparkle:version>4013</sparkle:version></item>'});
assert.match((await publish({channel:'alpha',platform:'mac',dir,live:true,store:newer,updates})).skipped,/4013/);
assert.deepEqual(newer.writes,[]);
const beta=store({'appcast.xml':old,'appcast-intel.xml':old});
await publish({channel:'beta',platform:'mac',dir,live:true,store:beta,updates});
assert.equal((beta.feeds['appcast.xml'].match(/<item>/g)||[]).length,2);
await assert.rejects(publish({channel:'beta',platform:'mac',dir,live:true,store:store({'appcast.xml':'<item><sparkle:version>5000</sparkle:version></item>'}),updates}),/newer/);
const staged=store();
await publish({channel:'beta',platform:'mac',dir,live:false,store:staged,updates});
assert(staged.writes.every(k=>k.startsWith('ci-staging/')),'a channel that is not live writes only under ci-staging/');

// The workflow: never on pull requests, secrets only in jobs of the protected `release` environment on main.
const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
assert(!/^\s*(pull_request|pull_request_target|merge_group)\s*:/m.test(workflow),'release.yml never runs for pull requests');
const jobs=workflow.split(/\n  (?=[a-z][\w-]*:\n)/).slice(1);
for(const job of jobs){
 const name=job.split(':')[0];
 if(/secrets\./.test(job))assert(/\n    environment: release\n/.test(job),`${name}: secrets only in the release environment`);
}
assert(/if: github\.ref == 'refs\/heads\/main'/.test(workflow));
console.log('ci-release checks passed');
