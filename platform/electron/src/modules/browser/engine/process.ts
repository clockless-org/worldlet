// The website engine process (platform/web-engine): CEF with Chrome's own layer, spawned on demand
// and supervised here. One engine serves every website page of this app; the personal and practice
// worlds use separate storage inside it. Messages are length-prefixed JSON over the engine's
// stdin/stdout; frames travel as shared GPU surfaces, on Linux as pixels in shared memory (surface.ts).
import {spawn,type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {app} from 'electron';
import type {Profile} from '../../../profile.ts';
import {platformArch} from '../../../resources.ts';

export type EngineMessage=Record<string,any>&{t:string};
export type EngineListener=(message:EngineMessage)=>void;
/** The Electron main process's receiver for macOS shared surfaces (platform/web-engine/addon). */
export interface SurfaceAddon {
 listen(pid:number):string;
 setSender(pid:number):void;
 take(tag:number,generation:number):Buffer|null;
 drop(tag:number,generation:number):void;
 forget(id:number):void;
 sample(tag:number,generation:number,x:number,y:number):number[]|null;
}
export interface EngineFiles {executable:string;addon:string|null}

const linux=process.platform==='linux';
/** Linux: a frame slot's shared-memory file, named by the engine's process, page, element and slot. */
const frameFile=(pid:number,id:number,kind:number,slot:number)=>`/dev/shm/worldlet-web-${pid}-${id}-${kind}-${slot}`;
/** Linux: what an engine left in shared memory; it removes its own files unless it crashed. */
function removeFrames(pid:number){
 try{for(const name of fs.readdirSync('/dev/shm'))if(name.startsWith(`worldlet-web-${pid}-`))fs.rmSync(path.join('/dev/shm',name),{force:true});}catch{}
}
/** The built engine: inside the packaged app, or the checkout's .local/web-engine in development. */
export function locateEngine(profile:Profile,env=process.env):EngineFiles|null {
 const mac=process.platform==='darwin';
 if(!mac&&!linux&&process.platform!=='win32')return null;
 // Linux: no space in the folder, where Chromium looks for its sandbox helper (scripts/build-web-engine.ts).
 const binary=linux?path.join('worldlet-web','worldlet-web'):path.join('Worldlet Web','Worldlet Web.exe');
 const inside=(directory:string)=>mac?path.join(directory,'Worldlet Web.app/Contents/MacOS/Worldlet Web'):path.join(directory,binary);
 const candidates:EngineFiles[]=[];
 if(app.isPackaged)candidates.push(mac
  ?{executable:path.join(process.resourcesPath,'..','Frameworks','Worldlet Web.app/Contents/MacOS/Worldlet Web'),addon:path.join(process.resourcesPath,'worldlet_surfaces.node')}
  :{executable:path.join(process.resourcesPath,binary),addon:null});
 else{
  const directories=[...env.WORLDLET_WEB_ENGINE_DIR?[env.WORLDLET_WEB_ENGINE_DIR]:[],path.join(profile.resources,'.local/web-engine',platformArch())];
  for(const directory of directories)candidates.push({executable:inside(directory),addon:mac?path.join(directory,'worldlet_surfaces.node'):null});
 }
 return candidates.find(files=>fs.existsSync(files.executable)&&(!files.addon||fs.existsSync(files.addon)))??null;
}

/** What a built engine records about itself (scripts/build-web-engine.ts): its CEF version, and
 * whether it is Worldlet's own CEF build with H.264/AAC (#1174). */
export function engineInfo(files:EngineFiles):{cef?:string;codecs?:boolean}{
 const directory=path.dirname(files.executable);
 try{return JSON.parse(fs.readFileSync(process.platform==='darwin'?path.join(directory,'..','Resources','web-engine.json'):path.join(directory,'web-engine.json'),'utf8'));}
 catch{return {};}
}

/** The website surface's preload, built beside the host's main bundle (scripts/build-electron.ts). */
export function surfacePreload(env=process.env){return (!app.isPackaged&&env.WORLDLET_WEB_SURFACE_PRELOAD)||path.join(app.getAppPath(),'web-surface-preload.cjs');}

/** Which engine website pages use: CEF when it is built and not turned off, else Electron's own views. */
export function websiteEngine(profile:Profile,env=process.env):'cef'|'electron' {
 if(env.WORLDLET_WEB_ENGINE==='electron')return 'electron';
 return locateEngine(profile,env)?'cef':'electron';
}

/** Applets whose pages stay on Electron's own views even where CEF is built. X serves its video only
 * as H.264/AAC, which the standard CEF build cannot play and Electron's views can (owner decision
 * 2026-10-06, instead of Worldlet's own CEF build, #1174). Douyin's videos are H.264 too, and its
 * security check left the CEF panel blank or on "浏览器版本过低" (owner Order 2026-10-06 on 2915).
 * Twitch streams H.264/AAC only and shows "not supported in this browser (Error #4000)" on CEF
 * (owner Order 2026-10-07 on 3039). Google sign-in is refused there (#1089). */
export const ELECTRON_VIEW_APPLETS:ReadonlySet<string>=new Set(['x','douyin','twitch']);

/** The engine for one website Applet's pages: `platform` as in BrowserDevice ('x', 'youtube', 'web'…)
 * and, for a website Applet on the 'web' platform, its Applet key ('douyin', 'twitch'). */
export function pageEngine(profile:Profile,platform:string,applet='',env=process.env):'cef'|'electron' {
 const name=applet.replace(/^app-/,'');
 return ELECTRON_VIEW_APPLETS.has(platform)||ELECTRON_VIEW_APPLETS.has(name)?'electron':websiteEngine(profile,env);
}

/** CEF's TerminationStatus (cef_types.h) as Electron's exit reasons, the allowlist `app_process_gone` reports. */
const TERMINATION=['abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure'];
export function pageGoneReason(status:unknown){return typeof status==='number'&&TERMINATION[status]||'abnormal-exit';}
/** Why the engine process itself ended without being asked to: a signal (SIGKILL is a kill) or a failing exit code. */
export function engineExitReason(code:number|null,signal:NodeJS.Signals|null){
 if(signal)return signal==='SIGKILL'||signal==='SIGTERM'?'killed':'crashed';
 return code===0?'clean-exit':'abnormal-exit';
}

/** How long the website engine runs with no page before it ends. */
export const ENGINE_IDLE_MS=5*60_000;
export class WebEngine {
 private child:ChildProcess|null=null;
 private started:Promise<void>|null=null;
 private buffer:Buffer=Buffer.alloc(0);
 private listeners=new Map<number,EngineListener>();
 private questions:EngineListener=()=>{};
 private nextId=1;
 private nextQuery=1;
 private queries=new Map<number,(message:EngineMessage)=>void>();
 private stopping=false;
 /** When `restart` last ended an engine that stopped drawing (0: never). */
 restartedAt=0;
 addon:SurfaceAddon|null=null;
 version:{cef:string,chromium:string}|null=null;
 onExit=(_code:number|null)=>{};
 /** A crashed page renderer (`web_page`) or an engine that stopped on its own (`web_engine`); never a requested stop. */
 onGone=(_process:'web_engine'|'web_page',_reason:string)=>{};
 private profile:Profile;
 private files:EngineFiles;
 constructor(profile:Profile,files:EngineFiles){this.profile=profile;this.files=files;}

 /** A fresh page id; popups the engine opens get ids from 2^30 upward. */
 allocate(){return this.nextId++;}
 listen(id:number,listener:EngineListener){this.listeners.set(id,listener);this.cancelIdle();}
 unlisten(id:number){this.listeners.delete(id);this.addon?.forget(id);if(!this.listeners.size)this.idleSoon();}
 // With no page left the engine ends after ENGINE_IDLE_MS, giving back its browser and GPU processes' memory
 // (owner Order 2026-10-07: "要把内存管理好"); the next page starts a new one in a second or two.
 private idleTimer:NodeJS.Timeout|null=null;
 private idleSoon(){
  this.cancelIdle();if(!this.running)return;
  this.idleTimer=setTimeout(()=>{this.idleTimer=null;if(!this.listeners.size&&!this.queries.size)this.stop();},ENGINE_IDLE_MS);
  this.idleTimer.unref?.();
 }
 private cancelIdle(){if(this.idleTimer)clearTimeout(this.idleTimer);this.idleTimer=null;}
 /** Dialogs, permissions, files and downloads the engine asks the host about. */
 onQuestion(handler:EngineListener){this.questions=handler;}
 get running(){return !!this.child&&this.child.exitCode===null&&!this.child.killed;}
 /** The engine's process id while it runs (memory.ts counts it and its helpers). */
 get pid(){return this.running?this.child?.pid??null:null;}

 start():Promise<void> {
  // A page opened while the idle engine is ending waits for it to end, then starts a new one.
  if(this.stopping&&this.running){const child=this.child!;return new Promise<void>(resolve=>child.once('exit',()=>resolve())).then(()=>this.start());}
  if(this.started&&this.running)return this.started;
  this.stopping=false;
  this.started=new Promise((resolve,reject)=>{
   const cache=path.join(this.profile.root,'Browser','CEF');
   fs.mkdirSync(cache,{recursive:true});
   if(this.files.addon&&!this.addon){
    const module={exports:{}} as {exports:SurfaceAddon};
    process.dlopen(module,this.files.addon);
    this.addon=module.exports;
   }
   const args=['--worldlet-cache='+cache,'--worldlet-host='+process.pid];
   if(this.addon)args.push('--worldlet-rendezvous='+this.addon.listen(0));
   // Development profiles are disposable and their engine is signed ad hoc on every build, so a
   // keychain grant would not outlive the next build. Chromium's mock keychain answers with one fixed
   // key, so their cookies (and sign-ins) still last across launches; they are just not protected.
   if(this.profile.channel==='dev')args.push('--worldlet-mock-keychain');
   // Development checks hand pages Chromium's fake camera and microphone (engine/check.ts).
   if(this.profile.channel==='dev'&&process.env.WORLDLET_WEB_FAKE_MEDIA==='1')args.push('--worldlet-fake-media');
   // Linux: the engine keeps Chromium's sandbox unless the app itself was started without one
   // (--no-sandbox, where the system offers neither user namespaces nor the setuid helper).
   if(linux&&app.commandLine.hasSwitch('no-sandbox'))args.push('--worldlet-no-sandbox');
   // Linux: it starts in its own folder, where it finds libcef.so.
   const child=spawn(this.files.executable,args,{stdio:['pipe','pipe','pipe'],windowsHide:true,...linux?{cwd:path.dirname(this.files.executable)}:{}});
   this.child=child;this.buffer=Buffer.alloc(0);
   if(child.pid)this.addon?.setSender(child.pid);
   const timer=setTimeout(()=>reject(new Error('The website engine did not start.')),30_000);
   child.stdout!.on('data',(chunk:Buffer)=>this.read(chunk,ready=>{clearTimeout(timer);this.version={cef:ready.cef,chromium:ready.chromium};resolve();}));
   // Chromium's own log lines; kept short so a noisy page cannot flood the host.
   child.stderr!.on('data',()=>{});
   child.stdin!.on('error',()=>{});
   child.on('error',error=>{clearTimeout(timer);reject(error);});
   child.on('exit',(code,signal)=>{
    clearTimeout(timer);reject(new Error('The website engine stopped.'));
    if(linux&&child.pid)removeFrames(child.pid);
    if(this.child!==child)return;
    this.child=null;this.started=null;this.addon?.forget(-1);
    // Every page of a stopped engine is gone; the panel reports it like a crashed renderer. A stop asked for
    // ends with no pages, so pages listening by then are new ones waiting for the next engine.
    if(!this.stopping){
     const listeners=[...this.listeners.entries()];this.listeners.clear();
     for(const [id,listener] of listeners)listener({t:'gone',id,status:-1});
     const reason=engineExitReason(code,signal);
     if(reason!=='clean-exit')this.onGone('web_engine',reason);
    }
    for(const answer of this.queries.values())answer({t:'policy'});
    this.queries.clear();
    this.onExit(code);
   });
  });
  return this.started;
 }

 private read(chunk:Buffer,ready:(message:EngineMessage)=>void){
  this.buffer=this.buffer.length?Buffer.concat([this.buffer,chunk]):chunk;
  while(this.buffer.length>=4){
   const size=this.buffer.readUInt32LE(0);
   if(this.buffer.length<4+size)return;
   let message:EngineMessage;
   try{message=JSON.parse(this.buffer.subarray(4,4+size).toString('utf8'));}catch{message={t:'invalid'};}
   this.buffer=this.buffer.subarray(4+size);
   if(message.t==='ready')ready(message);
   else if(message.t==='ask')this.questions(message);
   else if(message.t==='policy'||message.t==='cookies'){const answer=this.queries.get(message.q);this.queries.delete(message.q);answer?.(message);}
   // A new popup belongs to its opener's page until the opener starts listening for it.
   else if(message.t==='gone'&&typeof message.id==='number'){this.onGone('web_page',pageGoneReason(message.status));this.listeners.get(message.id)?.(message);}
   else if(message.t==='popup')this.listeners.get(message.opener)?.(message);
   else if(typeof message.id==='number')this.listeners.get(message.id)?.(message);
  }
 }

 /** Linux: one frame's BGRA pixels, read from its shared-memory slot (platform/web-engine/src/frames_linux.cc)
  * to the start of `into` when it is large enough, else of a new buffer. Null when the slot is gone (a closed
  * page, a stopped engine). */
 readFrame(id:number,frame:EngineMessage,into?:Buffer):Buffer|null {
  const pid=this.child?.pid,{k,s,w,h}=frame;
  if(!pid||![k,s,w,h].every(Number.isInteger)||w<1||h<1||w>16384||h>16384)return null;
  const size=w*h*4,data=into&&into.length>=size?into:Buffer.allocUnsafeSlow(size);
  let file:number;try{file=fs.openSync(frameFile(pid,id,k,s),'r');}catch{return null;}
  try{return fs.readSync(file,data,0,size,0)===size?data:null;}finally{fs.closeSync(file);}
 }

 send(message:EngineMessage){
  const child=this.child;if(!child?.stdin||child.stdin.destroyed)return;
  const body=Buffer.from(JSON.stringify(message),'utf8'),header=Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  child.stdin.write(Buffer.concat([header,body]));
 }

 /** The engine's own rule answers for the parity fixtures (public pages, http:// upgrades, popups and new tabs). */
 async policy(urls:string[],popups:{gesture:boolean,open:number,url:string}[],upgrades:string[]=[],tabs:{gesture:boolean,tab:boolean,url:string}[]=[]):Promise<{public:boolean[],popup:boolean[],upgrade:string[],tab:boolean[]}> {
  await this.start();
  const q=this.nextQuery++;
  const reply=await new Promise<EngineMessage>(resolve=>{this.queries.set(q,resolve);this.send({t:'policy',q,urls,popups,upgrades,tabs});});
  return {public:reply.public??[],popup:reply.popup??[],upgrade:reply.upgrade??[],tab:reply.tab??[]};
 }

 /** Every cookie of a world's website storage (cookies.cc), or null when the engine does not run or stopped meanwhile. */
 async cookies(scope:'personal'|'practice'):Promise<Record<string,any>[]|null> {
  if(!this.running)return null;
  const q=this.nextQuery++;
  const reply=await new Promise<EngineMessage>(resolve=>{this.queries.set(q,resolve);this.send({t:'cookies',q,scope});});
  return Array.isArray(reply.cookies)?reply.cookies:null;
 }
 /** Sets and deletes cookies in a world's website storage, in order with the messages after it. */
 setCookies(scope:'personal'|'practice',set:Record<string,any>[],remove:{url:string,name:string}[]){
  if(this.running&&(set.length||remove.length))this.send({t:'set-cookies',scope,set,remove});
 }

 /** Ends an engine that stopped drawing its pages: they report gone and reopen on their next load,
  * in a new engine. False when none runs. */
 restart(){
  const child=this.child;if(!child||!this.running)return false;
  this.restartedAt=Date.now();
  try{child.kill('SIGKILL');}catch{return false;}
  return true;
 }
 /** Asks the engine to close its pages and exit; ends it if it does not within a few seconds. */
 stop(){
  const child=this.child;if(!child)return;
  this.stopping=true;
  this.send({t:'quit'});
  const timer=setTimeout(()=>{try{child.kill();}catch{}},5000);timer.unref?.();
  child.once('exit',()=>clearTimeout(timer));
 }
}

let shared:WebEngine|null=null;
/** The app's one engine, created on first use; null when no engine is built for this host. */
export function sharedEngine(profile:Profile):WebEngine|null {
 if(shared)return shared;
 const files=locateEngine(profile);if(!files)return null;
 shared=new WebEngine(profile,files);
 app.once('will-quit',stopSharedEngine);
 return shared;
}
/** The running engine's process id, without starting one (memory.ts). */
export function sharedEnginePid(){return shared?.pid??null;}
/** Asks the engine to exit. Quit Completely calls it itself: `app.exit` skips `will-quit`. */
export function stopSharedEngine(){shared?.stop();}
