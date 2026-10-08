// The Obsidian reader is read-only and confined to the chosen vault
// (platform/electron/src/modules/sources/local.ts), on a temporary vault; no dialog or app.
import {writeFile,mkdir,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {build} from 'esbuild';
import {withTempDir} from './test-temp.ts';
await withTempDir('worldlet-vault-check-',async temp=>{
 const vault=path.join(temp,'vault');await mkdir(path.join(vault,'.obsidian'),{recursive:true});
 await writeFile(path.join(vault,'Note.md'),'# Original\n\nLocal source.');
 await writeFile(path.join(vault,'.obsidian','secret.md'),'Hidden');
 await writeFile(path.join(temp,'outside.md'),'Outside');
 await symlink(path.join(temp,'outside.md'),path.join(vault,'escaped.md'));
 await writeFile(path.join(temp,'main.ts'),`import assert from 'node:assert/strict';
import {createLocal} from ${JSON.stringify(path.resolve('platform/electron/src/modules/sources/local.ts'))};
const store={writable:true,sampleEnabled:()=>false,changed(){},state:{connections:[{id:'obsidian-vault',provider:'obsidian',vaultPath:${JSON.stringify(vault)}}]}};
const local=createLocal({store,host:{profile:{webRoot:''},window:()=>null}} as any,()=>{});
const list=await local.obsidianContent({operation:'list'});
assert.deepEqual(list.pages.map((page:any)=>page.id),['Note.md'],'only visible Markdown notes are listed');
assert.match((await local.obsidianContent({operation:'read',id:'Note.md'})).text,/Local source\\./);
for(const id of ['../outside.md','escaped.md','.obsidian/secret.md','/outside.md'])await assert.rejects(local.obsidianContent({operation:'read',id}),'Unexpected access: '+id);
await assert.rejects(local.obsidianContent({operation:'write',id:'Note.md'}),/Unsupported/);
console.log('PASS read-only vault: Markdown read, hidden files excluded, path traversal and symlink escape rejected.');
`);
 await build({entryPoints:[path.join(temp,'main.ts')],outfile:path.join(temp,'check.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',
  // Plain Node runs the module; the Electron APIs it imports are not reached on this path.
  plugins:[{name:'electron-stub',setup(stub){stub.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-stub'}));stub.onLoad({filter:/.*/,namespace:'electron-stub'},()=>({contents:'export const clipboard={},dialog={},nativeImage={},app={},shell={};',loader:'js'}));}}]});
 execFileSync(process.execPath,[path.join(temp,'check.mjs')],{stdio:'inherit'});
});
