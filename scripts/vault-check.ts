// The credential vault (platform/electron/src/vault.ts), with Electron stubbed: a vault file that no longer parses
// is moved aside before the next write instead of being overwritten (every stored credential was lost before), and
// Linux's keyring-less `basic_text` storage is reported by code.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {withTempDir} from './test-temp.ts';

const source=(file:string)=>JSON.stringify(path.resolve('platform/electron/src',file));
await withTempDir('worldlet-vault-',async temp=>{
 fs.writeFileSync(path.join(temp,'main.ts'),`import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createVault} from ${source('vault.ts')};
const root=${JSON.stringify(path.join(temp,'library'))};fs.mkdirSync(root);
const file=path.join(root,'vault.json');
const warnings:string[]=[];console.warn=(line:string)=>{warnings.push(String(line));};
const storage=(backend:string)=>({isEncryptionAvailable:()=>true,encryptString:(text:string)=>Buffer.from('sealed:'+text),
 decryptString:(data:Buffer)=>{const text=data.toString();if(!text.startsWith('sealed:'))throw Error('no');return text.slice(7);},getSelectedStorageBackend:()=>backend});
const vault=createVault(root,'app.worldlet.check',storage('gnome_libsecret'),'linux');
vault.set('github','one');vault.set('google','two');
assert.equal(vault.get('github'),'one');assert.equal(vault.get('google'),'two');
assert.deepEqual(warnings,[],'a real keyring is not reported');

// A damaged vault: reads see nothing, a delete leaves it alone, and the next write keeps it beside the new one.
const damaged=fs.readFileSync(file,'utf8').slice(0,-3);
fs.writeFileSync(file,damaged);
assert.equal(vault.get('github'),null);
vault.delete('github');
assert.equal(fs.readFileSync(file,'utf8'),damaged,'a delete never rewrites a damaged vault');
vault.set('slack','three');
const kept=fs.readdirSync(root).filter(name=>name.startsWith('vault.json.corrupt-'));
assert.equal(kept.length,1,'the damaged vault is kept');
assert.equal(fs.readFileSync(path.join(root,kept[0]),'utf8'),damaged,'byte for byte, so its credentials can still be recovered');
assert.equal(vault.get('slack'),'three');
assert.ok(warnings.includes('worldlet: vault-corrupt-kept'));
assert.ok(warnings.every(line=>!line.includes('sealed')&&!line.includes('three')),'only a code is logged');
// A file that parses but is not an object is damaged too.
fs.writeFileSync(file,'[1]');vault.set('slack','four');
assert.equal(fs.readdirSync(root).filter(name=>name.startsWith('vault.json.corrupt-')).length,2);
assert.equal(vault.get('slack'),'four');

// Keyring-less Linux storage is reported once, by code; elsewhere nothing is asked.
warnings.length=0;
const plain=createVault(root,'app.worldlet.check',storage('basic_text'),'linux');
plain.set('a','1');plain.set('b','2');
assert.deepEqual(warnings,['worldlet: vault-basic-text-storage']);
warnings.length=0;
createVault(root,'app.worldlet.check',{...storage('basic_text'),getSelectedStorageBackend:()=>{throw Error('not on this platform');}},'darwin').set('c','3');
assert.deepEqual(warnings,[]);
assert.equal(plain.get('a'),'1');
console.log('PASS vault: a damaged vault is kept aside before the next write, deletes never rewrite it, and keyring-less Linux storage is reported by code');
`);
 await build({entryPoints:[path.join(temp,'main.ts')],outfile:path.join(temp,'check.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',
  banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"},
  plugins:[{name:'electron-stub',setup(stub){stub.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-stub'}));stub.onLoad({filter:/.*/,namespace:'electron-stub'},()=>({contents:'export const safeStorage={isEncryptionAvailable:()=>false};',loader:'js'}));}}]});
 execFileSync(process.execPath,[path.join(temp,'check.mjs')],{stdio:'inherit'});
});
