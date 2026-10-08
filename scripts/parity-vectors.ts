// Shared Core golden vectors, replayed through the Electron host's in-process Core entry
// (platform/electron/src/core.ts). `--write` regenerates `expected`. The browser URL contracts
// (public destinations, popups) replay against the Electron website-panel rules.
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
// Time-zone rules are part of the contract; every runner pins the same zone.
process.env.TZ='America/Los_Angeles';
const {coreEnvelope}=await import('../platform/electron/src/core.ts');
const {publicPage,httpsUpgrade,popupAllowed,opensAsTab,MAX_POPUPS}=await import('../platform/electron/src/modules/browser/rules.ts');
const dir='contracts/fixtures/parity';
// Not Core vectors: the host-usage baseline, the native URL contracts below, and the
// site-locked Applet list that scripts/page-resume-check.ts replays through core/browser.
const contracts=['host-core-usage.json','browser-public-page.json','browser-popup.json','browser-tab.json','browser-applet-site.json'];
type Case={name:string;operation:string;input:unknown;expected:unknown};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical)
 :value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])])):value;
const write=process.argv.includes('--write');
let count=0;
for(const file of readdirSync(dir).filter(name=>name.endsWith('.json')&&!contracts.includes(name)).sort()){
 const cases=JSON.parse(readFileSync(path.join(dir,file),'utf8')) as Case[];
 const names=new Set<string>();
 for(const row of cases){
  assert(typeof row.name==='string'&&!names.has(row.name),`${file}: unique case name required`);names.add(row.name);
  const actual=canonical(coreEnvelope(row.operation,row.input));
  if(write)row.expected=actual;
  else assert.deepEqual(actual,canonical(row.expected),`${file}: ${row.name}`);
  count++;
 }
 if(write)writeFileSync(path.join(dir,file),JSON.stringify(cases,null,1)+'\n');
}
assert(count>0,'parity vectors are missing');
const pages=JSON.parse(readFileSync(path.join(dir,'browser-public-page.json'),'utf8')) as {allowed:string[];refused:string[];upgraded:Record<string,string|null>};
for(const url of pages.allowed)assert.equal(publicPage(url),true,'public page: '+url);
for(const url of pages.refused)assert.equal(publicPage(url),false,'not a public page: '+url);
for(const [url,upgraded] of Object.entries(pages.upgraded))assert.equal(httpsUpgrade(url),upgraded,'https upgrade: '+url);
const popups=JSON.parse(readFileSync(path.join(dir,'browser-popup.json'),'utf8')) as {maxWindows:number;cases:{gesture:boolean;open:number;url:string;allowed:boolean}[]};
assert.equal(MAX_POPUPS,popups.maxWindows,'popup window cap');
for(const row of popups.cases)assert.equal(popupAllowed(row.gesture,row.open,row.url),row.allowed,'popup: '+JSON.stringify(row));
const tabs=JSON.parse(readFileSync(path.join(dir,'browser-tab.json'),'utf8')) as {cases:{gesture:boolean;tab:boolean;url:string;opens:boolean}[]};
for(const row of tabs.cases)assert.equal(opensAsTab(row.gesture,row.tab,row.url),row.opens,'tab: '+JSON.stringify(row));
console.log(`PASS ${count} shared Core parity vectors through the Electron host${write?' (expected regenerated)':''}; ${pages.allowed.length+pages.refused.length} public-page, ${Object.keys(pages.upgraded).length} https-upgrade, ${popups.cases.length} popup and ${tabs.cases.length} new-tab URL vectors`);
