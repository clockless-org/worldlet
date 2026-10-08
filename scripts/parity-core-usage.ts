// Ratchet: the Electron host must invoke every Core operation the retired Swift and C# hosts invoked.
// contracts/fixtures/parity/host-core-usage.json fixes that union once; `electronPending` lists the
// operations not yet routed through the Electron host and may only shrink. `electronShared` records, with a reason,
// operations Electron deliberately reaches through a different shared Core path instead. Module checks (`check.ts`) do not count.
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
const baselineFile='contracts/fixtures/parity/host-core-usage.json';
const operations=new Set([...readFileSync('core/index.ts','utf8').matchAll(/operation==='([A-Za-z]+)'/g)].map(match=>match[1]));
const sources=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const file=path.join(dir,entry.name);
 if(entry.isDirectory())return sources(file);
 return entry.name.endsWith('.ts')&&entry.name!=='check.ts'?[file]:[];
});
// Operation names are the string literals in the first argument of core(…)/coreEnvelope(…), ternaries included.
const used=new Set(sources('platform/electron/src').flatMap(file=>[...readFileSync(file,'utf8').matchAll(/\b(?:core|coreEnvelope)(?:<[^>()]*>)?\(([^,)]*)/g)]
 .flatMap(call=>[...call[1].matchAll(/['"`]([A-Za-z]+)['"`]/g)].map(match=>match[1]))).filter(name=>operations.has(name)));
const baseline=JSON.parse(readFileSync(baselineFile,'utf8')) as {operations:string[];electronPending:string[];electronShared:Record<string,string>};
assert.deepEqual(baseline.operations.filter(name=>!operations.has(name)),[],`Core no longer defines these operations; remove them from ${baselineFile}`);
assert.deepEqual(baseline.electronPending.filter(name=>!baseline.operations.includes(name)),[],'electronPending lists only recorded native-host operations');
const shared=Object.entries(baseline.electronShared);
assert.deepEqual(shared.filter(([name,reason])=>!baseline.operations.includes(name)||baseline.electronPending.includes(name)||typeof reason!=='string'||!reason.trim()).map(([name])=>name),[],'electronShared lists recorded native-host operations, not pending ones, each with a reason');
assert.deepEqual(shared.map(([name])=>name).filter(name=>used.has(name)),[],`The Electron host now invokes these operations; remove them from electronShared in ${baselineFile}`);
const missing=baseline.operations.filter(name=>!used.has(name)&&!(name in baseline.electronShared));
const added=missing.filter(name=>!baseline.electronPending.includes(name)),closed=baseline.electronPending.filter(name=>used.has(name));
assert.deepEqual(added,[],'The retired native hosts invoked these Core operations but the Electron host does not; route the host through Core');
assert.deepEqual(closed,[],`The Electron host now invokes these operations; remove them from electronPending in ${baselineFile}`);
console.log(`PASS Core-usage ratchet (${used.size} Electron operations, ${baseline.operations.length} native-host operations, ${missing.length} pending, ${shared.length} via shared Core paths)`);
