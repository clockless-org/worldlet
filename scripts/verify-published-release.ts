import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildInfo} from './build-info.ts';

const info=buildInfo(),{feedURL,intelFeedURL}=JSON.parse(readFileSync('platform/electron/distribution/Updates.json','utf8'));
const origin=new URL(feedURL).origin;
async function get(url,method='GET'){
 const result=await fetch(url,{method,redirect:'follow',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'WorldletMachines/1'}});
 if(![origin,'https://worldlet.ai'].includes(new URL(result.url).origin))throw Error('Unexpected release redirect');
 if(!result.ok)throw Error(`${method} ${url}: ${result.status}`);return result;
}
// The website has its own release cadence; Mac publication must not update it.
const name=`Worldlet-${info.version}-${info.build}-macos-universal.dmg`;
for(const feed of [feedURL,intelFeedURL]){
 const xml=await(await get(feed+`?release=${info.build}`)).text();
 assert.ok(xml.includes(name),`${feed} must reference the universal installer`);
 assert.ok(xml.includes(`<sparkle:version>${info.build}</sparkle:version>`),'Feed build must match');
 const url=new URL(name,feed).href;
 const head=await get(url,'HEAD');assert.ok(Number(head.headers.get('content-length'))>100000,'Installer must be downloadable');
 const checksum=await(await get(url+'.sha256')).text();assert.equal(checksum,readFileSync(`dist/releases/universal/${name}.sha256`,'utf8'));
}
console.log(`PASS one universal Mac download and both existing update feeds identify v${info.version} / Build ${info.build}`);
