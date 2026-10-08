// contracts/world-event-policy.json is the only copy of the World event fast filter: Core and the
// Electron host import it directly. Validate it and that the host reads it instead of copying the lists.
// (`--check` is accepted for compatibility; nothing is generated.)
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
const policy=JSON.parse(await readFile('contracts/world-event-policy.json','utf8')) as Record<string,unknown>;
for(const key of ['plumbing','conversation','fields']){
 const values=policy[key];
 assert(Array.isArray(values)&&values.length>0&&values.every(v=>typeof v==='string'&&/^[a-zA-Z0-9_.:]+$/.test(v))&&new Set(values).size===values.length,'Invalid event policy '+key);
}
const plumbing=new Set(policy.plumbing as string[]);
const host='platform/electron/src/store/world-store.ts',source=await readFile(host,'utf8');
assert.match(source,/^import eventPolicy from '(?:\.\.\/)+contracts\/world-event-policy\.json';$/m,`${host} imports the shared policy`);
assert.match(source,/eventPolicy\.plumbing\.includes\(/,`${host} filters with the shared plumbing list`);
// No host file keeps its own list: an array literal naming half of the plumbing actions is a copy.
const files=async(dir:string):Promise<string[]>=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(entry=>
 entry.isDirectory()?files(path.join(dir,entry.name)):Promise.resolve(entry.name.endsWith('.ts')?[path.join(dir,entry.name)]:[])))).flat();
for(const file of await files('platform/electron/src')){
 for(const list of (await readFile(file,'utf8')).matchAll(/\[\s*'[^'\]]*'(?:\s*,\s*'[^'\]]*')+\s*\]/g)){
  const copied=[...list[0].matchAll(/'([^']*)'/g)].filter(match=>plumbing.has(match[1])).length;
  assert(copied<Math.ceil(plumbing.size/2),`${file} restates the World event plumbing list; import contracts/world-event-policy.json`);
 }
}
console.log('PASS shared world-event policy is valid and the Electron host imports it');
