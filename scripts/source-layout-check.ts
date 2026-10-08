import './component-boundary-check.ts';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {access,readFile} from 'node:fs/promises';
import {buildDefines} from './build-info.ts';
// Guard the architectural boundary, not just whether both bundles compile.
// The open-source export leaves out the website, so its entries are checked only where it exists.
for(const [entry,forbidden] of [['website/main.ts','platform/'],['website/demo/main.ts','platform/'],['website/download/main.ts','platform/'],['ui/index.ts','website/']]){
 if(!await access(entry).then(()=>true,()=>false))continue;
 const {metafile}=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',define:buildDefines(),metafile:true,logLevel:'silent'});
 assert(!Object.keys(metafile.inputs).some(file=>/node_modules\/(?:@types\/)?three\//.test(file)),`${entry} must never include Three.js`);
 assert(!Object.keys(metafile.inputs).some(file=>file.startsWith(forbidden)),`${entry} must not import ${forbidden}`);
}
assert.equal(await access('web').then(()=>true,()=>false),false,'root web/ has been retired');
assert.equal(await access('Native').then(()=>true,()=>false),false,'old Native/ tree has been retired');
const packageScripts=JSON.parse(await readFile('package.json','utf8')).scripts;
assert.equal(packageScripts.dev,'node scripts/dev-channel.ts');
assert.equal(packageScripts['dev:worktree'],'node scripts/native-platform.ts dev');
assert.equal(packageScripts.build,'node scripts/build-app.ts');
const website=await access('website').then(()=>true,()=>false);
if(website)assert.equal(packageScripts['build:website'],'node scripts/build-website.ts');
assert.equal(packageScripts.test,'node scripts/run-steps.mjs test:core && npm run test:worktrees');
if(website)assert.match(await readFile('scripts/build-app.ts','utf8'),/WORKERS_CI==='1'/,'Cloudflare Git builds must compile the website, not the desktop app');
const hostWatcher=await readFile('scripts/dev-electron.ts','utf8');
if(website)assert((await readFile('scripts/dev-website.ts','utf8')).includes("['website','ui','core','contracts','resources']"));
assert(hostWatcher.includes("['ui','core','contracts','resources','platform/bridge','platform/electron','harness/hermes','platform/local-tools','platform/browser','platform/web-engine','scripts']"));
// Ignore old local caches, but never retain executable sources in retired roots.
const {execFileSync}=await import('node:child_process');
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0');
for(const file of tracked.filter(f=>/^(app|shared|adapters|applets|worlds|services)\//.test(f))){
 assert.equal(await access(file).then(()=>true,()=>false),false,`Retired source root: ${file}`);
}
await access('harness/hermes/host.py');await access('harness/example/agent.py');
console.log('PASS website/native source boundaries, shared scene reuse and independent development watchers.');

// Shared business/contracts must compile without a browser, Node or native host.
const {readdir}=await import('node:fs/promises');
const {default:ts}=await import('typescript');
async function sources(dir:string):Promise<string[]> {
 const entries=await readdir(dir,{withFileTypes:true});
 return (await Promise.all(entries.map(e=>e.isDirectory()?sources(dir+'/'+e.name):Promise.resolve(/\.(ts|js|mjs)$/.test(e.name)?[dir+'/'+e.name]:[])))).flat();
}
for(const file of [...await sources('core'),...await sources('contracts')]){
 const {metafile}=await build({entryPoints:[file],bundle:true,write:false,platform:'neutral',format:'esm',metafile:true,logLevel:'silent'});
 for(const dependency of Object.keys(metafile.inputs)){
  const allowed=file.startsWith('contracts/')?/^contracts\//:/^(core|contracts)\//;
  assert(allowed.test(dependency),`${file} crosses its module boundary: ${dependency}`);
 }
 const source=await readFile(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const walk=(node:any)=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){const target=node.moduleSpecifier.text;if(target.startsWith('.')){const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),target));assert((file.startsWith('contracts/')?/^contracts\//:/^(core|contracts)\//).test(resolved),`${file} has a forbidden type/module dependency: ${resolved}`);}else assert(false,`${file} imports external module ${target}`);}
 if(ts.isIdentifier(node))assert(!['window','document','navigator','process','require'].includes(node.text),`${file} uses host global ${node.text}`);ts.forEachChild(node,walk);};walk(ast);
}
for(const file of await sources('ui')){
 const source=await readFile(file,'utf8');
 assert(!/from\s*['"][^'"]*platform\/(?:electron|macos|windows|local-tools)\//.test(source),file+' must use the host bridge, not native implementation imports');
 assert(!/from\s*['"][^'"]*harness\//.test(source),file+' must not import a Harness implementation');
 assert(!/messageHandlers\s*(?:\?\.)?\s*\.?(?:worldlet|\[)|chrome\.webview/.test(source),`${file} must use platform/host, not a native transport`);
 assert(!/platform\s*={2,3}\s*['"](?:windows|macos)['"]/.test(source),`${file} must use host capabilities, not OS branches`);
}
console.log('PASS pure core/contracts and centralized platform transport/capability boundaries.');

for(const file of await sources('resources'))assert(false,`Executable code belongs in a component, not resources: ${file}`);
console.log('PASS direct layer roots, independent Applet catalog and non-executable resources.');

const packaging=await readFile('scripts/package-electron.ts','utf8');
assert(packaging.includes("run(process.execPath,['scripts/build-native-ui.ts']"),'Distribution must use the shared UI builder');
assert(packaging.includes("run(process.execPath,['scripts/build-electron.ts']"),'Distribution must bundle the Electron host');
await access('platform/electron/tsconfig.json');await access('platform/electron/src/main.ts');

// One World renderer: the trusted page is an isolated, sandboxed WebContentsView without Node.
const worldWindow=await readFile('platform/electron/src/world/window.ts','utf8');
assert(/contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true/.test(worldWindow),'the World page must stay isolated and sandboxed');
for(const file of await sources('platform/electron/src')){
 const source=await readFile(file,'utf8');
 assert(!/nodeIntegration\s*:\s*true|webviewTag\s*:\s*true|enableRemoteModule/.test(source),`${file} must not give a page Node, <webview> or remote access`);
 assert(!/getFileIcon\([^)]*size\s*:\s*['"]large['"]/.test(source),`${file} asks for a large file icon, which stops the app on macOS (Chromium's IconLoader): use 'normal' there`);
}
assert(!hostWatcher.includes('WORLDLET_CHROMIUM_UI'),'Chromium must not require an opt-in development switch');
console.log('PASS the Electron host packages the shared UI and keeps every page isolated without Node access.');
