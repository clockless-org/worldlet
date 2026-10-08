// A CEF website page whose engine takes long to make it still loads its address (owner Order 2026-10-07:
// LinkedIn stayed white after Worldlet updated on a computer short of memory). The engine drops every
// message for a page it has not made yet, so the host waits for `created` before its DevTools work and
// sends the load once the page exists. Runs the real CefPageView with a stubbed `electron` and a fake
// engine; no app or engine is launched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build,type Plugin} from 'esbuild';
import {withTempDir} from './test-temp.ts';

const ELECTRON=`
const contents=()=>({on(){},ipc:{on(){}},setWindowOpenHandler(){},loadURL:async()=>{},isDestroyed:()=>false,send(){},close(){},mainFrame:{}});
export class WebContentsView{constructor(){this.webContents=contents();this.bounds={x:0,y:0,width:0,height:0};this.visible=true;}
 setBackgroundColor(){} setBorderRadius(){} setBounds(b){this.bounds=b;} getBounds(){return this.bounds;} setVisible(v){this.visible=v;} getVisible(){return this.visible;}}
export const session={fromPartition:()=>({})};
export const sharedTexture={};
export const app={getPath:()=>'/tmp'};
export const dialog={};
export const screen={getDisplayMatching:()=>({scaleFactor:2,displayFrequency:60,bounds:{x:0,y:0,width:1600,height:900},workArea:{x:0,y:0,width:1600,height:900}})};
`;
const stub:Plugin={name:'electron-stub',setup(b){
 b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-stub'}));
 b.onLoad({filter:/.*/,namespace:'electron-stub'},()=>({contents:ELECTRON,loader:'js'}));
}};

await withTempDir('worldlet-cef-page-start-',async temp=>{
 const out=path.join(temp,'page.mjs');
 await build({entryPoints:['platform/electron/src/modules/browser/engine/page.ts'],bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'error',plugins:[stub]});
 const webRoot=path.join(temp,'web');fs.mkdirSync(path.join(webRoot,'browser'),{recursive:true});
 fs.writeFileSync(path.join(webRoot,'browser','video-formats.js'),'(()=>{})');
 const {CefPageView}=await import(pathToFileURL(out).href);

 // The fake engine: like the real one it ignores a page's messages until the page exists, and makes
 // it only when the check says so.
 const sent:any[]=[],listeners=new Map<number,(message:any)=>void>(),made=new Set<number>();
 let nextId=1;
 const engine={
  allocate:()=>nextId++,start:async()=>{},listen:(id:number,listener:(message:any)=>void)=>listeners.set(id,listener),unlisten:(id:number)=>listeners.delete(id),
  onQuestion(){},addon:null,restartedAt:0,restarts:0,
  // The real engine's exit: every page it had reports gone (process.ts).
  restart(){this.restartedAt=Date.now();this.restarts++;const all=[...listeners.entries()];listeners.clear();made.clear();for(const [id,listener] of all)listener({t:'gone',id,status:-1});return true;},
  send(message:any){
   sent.push(message);
   if(message.t==='devtools'&&made.has(message.id)){const request=JSON.parse(message.m);if(request.id>0)queueMicrotask(()=>listeners.get(message.id)?.({t:'devtools',m:JSON.stringify({id:request.id,result:{}})}));}
  },
 };
 const parent={children:[] as unknown[],addChildView(view:unknown){this.children.push(view);},removeChildView(){},getBounds:()=>({x:0,y:0,width:1600,height:900})};
 const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 const page=new CefPageView({engine,parent,window:()=>null,scope:'personal',webRoot,demo:false,url:'https://www.linkedin.com/feed/',preload:'',onDownload(){}});
 const errors:number[]=[];page.onError=(code:number)=>errors.push(code);
 page.setFrame({x:10,y:20,width:800,height:600});page.setHidden(false);
 await wait(0);
 const created=sent.find(message=>message.t==='create');
 assert.ok(created,'the page is asked for');
 assert.equal(created.url,'about:blank','every website page starts blank');
 assert.equal(created.hidden,false,'it is asked for shown');

 // The engine is slow (a busy computer): far longer than the host's DevTools attempts last.
 await wait(6500);
 assert.equal(sent.some(message=>message.t==='load'),false,'nothing loads before the page exists, where the engine would drop it');

 made.add(created.id);sent.length=0;
 listeners.get(created.id)!({t:'created'});
 for(let i=0;i<50&&!sent.some(message=>message.t==='load');i++)await wait(20);
 const load=sent.find(message=>message.t==='load');
 assert.ok(load,'once made, the page loads its address');
 assert.equal(load.url,'https://www.linkedin.com/feed/');
 assert.ok(sent.some(message=>message.t==='devtools'&&/Page\.addScriptToEvaluateOnNewDocument/.test(message.m)),'after its document scripts');
 const index=(t:string)=>sent.findIndex(message=>message.t===t);
 assert.ok(index('show')>=0&&index('resize')>=0,'its place and visibility are said again once it exists');
 assert.ok(sent.some(message=>message.t==='show'&&message.hidden===false),'and it shows');
 console.log('PASS a slow-to-start CEF page still loads its address, after its document scripts, and shows');

 // The engine then draws nothing (no frame reaches the surface): it is restarted and the page opens again.
 const later=()=>Date.now()+13_000;
 assert.equal(page.checkStall(Date.now()),null,'a page just shown is given time to draw');
 sent.length=0;
 assert.equal(page.checkStall(later()),'restarted','a shown page that drew nothing restarts its engine');
 assert.equal(engine.restarts,1);
 await wait(10);
 assert.deepEqual(errors,[],'the restart is not reported as a failed page');
 const again=sent.find(message=>message.t==='create');
 assert.ok(again&&again.id!==created.id,'the page is asked for again in the new engine');
 made.add(again.id);sent.length=0;listeners.get(again.id)!({t:'created'});
 for(let i=0;i<50&&!sent.some(message=>message.t==='load');i++)await wait(20);
 assert.equal(sent.find(message=>message.t==='load')?.url,'https://www.linkedin.com/feed/','and loads the same address');

 // Still nothing drawn soon after: the page says it could not load (once) instead of staying white.
 assert.equal(page.checkStall(later()),'failed');
 assert.deepEqual(errors,[-2]);
 assert.equal(page.checkStall(later()),null,'said once');
 assert.equal(engine.restarts,1,'at most one restart per ENGINE_STALL.restartMs');
 page.close();
 console.log('PASS a page whose engine draws nothing restarts the engine and loads again; still blank, it says so once');
});
