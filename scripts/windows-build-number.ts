// Reserve the next Windows build without advancing the independent Mac build.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const file=path.join(root,'release.json');
const release=JSON.parse(readFileSync(file,'utf8'));
const local=release.platformBuilds?.windows ?? release.build;
const response=await fetch('https://worldlet.ai/downloads/windows-preview.json',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'WorldletMachines/1'}});
if(!response.ok&&response.status!==404)throw Error(`Could not read published Windows build: HTTP ${response.status}`);
let published=0;
if(response.ok){
 const manifest=await response.json();
 if(!Number.isSafeInteger(manifest.build)||manifest.build<1||manifest.build>65535)throw Error('Invalid published Windows build');
 published=manifest.build;
}
const next=Math.max(local,published)+1;
if(next>65535)throw Error('Windows build ceiling reached');
release.platformBuilds={...release.platformBuilds,mac:release.platformBuilds?.mac??release.build,windows:next};
writeFileSync(file,JSON.stringify(release,null,2)+'\n');
console.log(`Reserved Windows Build ${next}; Mac remains Build ${release.platformBuilds.mac}. Commit release.json before packaging.`);
