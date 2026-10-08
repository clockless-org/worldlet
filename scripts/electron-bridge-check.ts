// The Electron World bridge: only the trusted top-level worldlet://app/index.html document (no query)
// receives `window.worldletHost` (version 1), and the main process re-checks the sending frame on
// every request. Runs the real preload and URL rule with a stubbed `electron`; no app is launched.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build,type Plugin} from 'esbuild';
import {withTempDir} from './test-temp.ts';

const stub=(contents:string):Plugin=>({name:'electron-stub',setup(b){
 b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-stub'}));
 b.onLoad({filter:/.*/,namespace:'electron-stub'},()=>({contents,loader:'js'}));
}});

// 1. The preload exposes the bridge only in the trusted top-level World document.
const preload=(await build({entryPoints:['platform/electron/src/world/preload.ts'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'error',
 plugins:[stub('export const contextBridge=globalThis.__electron.contextBridge,ipcRenderer=globalThis.__electron.ipcRenderer;')]})).outputFiles[0].text;
function load(href:string,top=true){
 const exposed:Record<string,any>={},invoked:any[]=[];let reply:any={ok:true,value:{workspaceId:'test'}};
 const window:any={};window.top=top?window:{};
 const url=new URL(href);
 const location={href,origin:url.protocol==='worldlet:'?'worldlet://'+url.host:url.origin,pathname:url.pathname,search:url.search};
 const __electron={
  contextBridge:{exposeInMainWorld:(name:string,value:unknown)=>{exposed[name]=value;}},
  ipcRenderer:{sendSync:(channel:string)=>{assert.equal(channel,'worldlet:platform');return 'macos';},invoke:async(channel:string,body:unknown)=>{assert.equal(channel,'worldlet:request');invoked.push(body);return reply;}}
 };
 runInNewContext(preload,{window,location,__electron,Error});
 return {host:exposed.worldletHost,names:Object.keys(exposed),invoked,setReply:(value:unknown)=>{reply=value;}};
}
{
 const trusted=load('worldlet://app/index.html');
 assert.deepEqual(trusted.names,['worldletHost'],'only worldletHost is exposed');
 assert.equal(trusted.host.version,1);assert.equal(trusted.host.platform,'macos');
 assert.deepEqual(await trusted.host.request({action:'snapshot'}),{workspaceId:'test'});
 assert.deepEqual(trusted.invoked,[{action:'snapshot'}]);
 trusted.setReply({ok:false,error:'This page cannot use Worldlet.'});
 await assert.rejects(trusted.host.request({action:'snapshot'}),/cannot use Worldlet/);
 trusted.setReply(undefined);
 await assert.rejects(trusted.host.request({action:'snapshot'}),/did not respond/);
}
for(const href of ['worldlet://app/index.html?debug=1','worldlet://app/other.html','worldlet://app/','worldlet://evil/index.html','https://evil.example/index.html','file:///index.html'])
 assert.deepEqual(load(href).names,[],'no bridge for '+href);
assert.deepEqual(load('worldlet://app/index.html',false).names,[],'no bridge in a subframe');
console.log('PASS preload exposes worldletHost v1 only to the top-level worldlet://app/index.html document without a query');

// 2. The main process trusts the same document only.
await withTempDir('worldlet-bridge-check-',async scratch=>{
 const out=path.join(scratch,'protocol.mjs');
 await build({entryPoints:['platform/electron/src/world/protocol.ts'],outfile:out,bundle:true,format:'esm',platform:'node',logLevel:'error',plugins:[stub('export const protocol={},net={};')]});
 const {trustedWorldURL,WORLD_URL}=await import(pathToFileURL(out).href);
 assert.equal(WORLD_URL,'worldlet://app/index.html');
 assert.equal(trustedWorldURL(WORLD_URL),true);
 for(const href of ['worldlet://app/index.html?x=1','worldlet://app/other.html','worldlet://user:pass@app/index.html','worldlet://evil/index.html','https://app/index.html','about:blank','not a url'])
  assert.equal(trustedWorldURL(href),false,href);
});

// 3. Every request is re-checked against the sending frame before the router runs.
const main=readFileSync('platform/electron/src/main.ts','utf8');
const handler=main.slice(main.indexOf("ipcMain.handle('worldlet:request'"));
assert(handler.length<main.length,'main.ts handles worldlet:request');
const guard=handler.indexOf('const frame=event.senderFrame;'),dispatch=handler.indexOf('router.dispatch(');
assert(guard>=0&&dispatch>guard,'the sending frame is read before dispatch');
const check=handler.slice(guard,dispatch);
for(const condition of ['event.sender!==world.view.webContents','!frame','frame.parent','!trustedWorldURL(frame.url)'])
 assert(check.includes(condition),'request guard rejects: '+condition);
assert.match(check,/return \{ok:false,error:/,'untrusted senders get an error, not a dispatch');
// The preload is attached to the World view only; website views never get one.
assert.match(readFileSync('platform/electron/src/world/window.ts','utf8'),/new WebContentsView\(\{webPreferences:\{preload,/);
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.ts')?[path.join(dir,e.name)]:[]);
// The one module view with a preload is the CEF page surface (#1170): it draws engine frames, never loads a website,
// and its preload is its own (web-surface), not the World's.
const SURFACE=path.join('platform/electron/src/modules/browser/engine/surface.ts');
for(const file of files('platform/electron/src/modules'))for(const [prefs] of readFileSync(file,'utf8').matchAll(/webPreferences\s*:\s*\{[^}]*\}/g))
 assert(!/\bpreload\b/.test(prefs)||file===SURFACE,`${file} must not give a website view a preload`);
const surface=readFileSync(SURFACE,'utf8');
for(const rule of ["setWindowOpenHandler(()=>({action:'deny'}))","on('will-navigate',event=>event.preventDefault())","loadURL('data:text/html;charset=utf-8,'"])
 assert(surface.includes(rule),'the website surface never leaves its own document: '+rule);
assert.match(readFileSync('platform/electron/src/modules/browser/engine/process.ts','utf8'),/export function surfacePreload\([^)]*\)\{return [^\n]*'web-surface-preload\.cjs'\)/,'the surface gets its own preload');
console.log('PASS main process rejects other senders, subframes and untrusted documents; only the World view has the preload (the CEF surface has its own and never loads a website)');
