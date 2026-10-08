// contracts/companion-policy.json is the only copy of the companion limits: Core and the Electron
// host import it directly. Validate its values and that the host reads it instead of restating them.
// (`--check` is accepted for compatibility; nothing is generated.)
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=(file:string)=>readFile(new URL('../'+file,import.meta.url),'utf8');
const policy=JSON.parse(await read('contracts/companion-policy.json')) as Record<string,unknown>;
for(const [key,value] of Object.entries(policy)){
 assert(typeof value==='string'?value.length>0:Number.isSafeInteger(value)&&Number(value)>=1,'Invalid companion policy '+key);
 if(key.endsWith('Pattern'))assert(typeof value==='string'&&value.startsWith('^')&&value.endsWith('\\z'),`${key} is an anchored pattern`);
}
assert.equal(policy.format,'worldlet.companion');assert.equal(policy.version,1);
const host='platform/electron/src/modules/fox/companion.ts',source=await read(host);
assert.match(source,/^import policy from '(?:\.\.\/)+contracts\/companion-policy\.json';$/m,`${host} imports the shared policy`);
for(const match of source.matchAll(/(?<![\w-])policy\.(\w+)/g))assert(match[1] in policy,`Unknown companion policy ${match[1]} in ${host}`);
assert(!/\bCompanionPolicy\b|\b16_?000_?000\b/.test(source),`${host} must not restate companion limits`);
console.log('PASS shared companion policy is valid and the Electron host imports it');
