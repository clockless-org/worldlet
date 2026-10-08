import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {nativeImage,type NativeImage,type Rectangle,type WebContents} from 'electron';
import {WorldletError} from '../../files.ts';
import type {Host,Row} from '../../host/types.ts';
import type {OrderReply} from '../../../../../contracts/platform.ts';
import {ORDER_FRAMES,ORDER_FRAME_BYTES,ORDER_LOG,orderAvailable,orderItem,orderLog,orderMessage,orderOverlay,orderSessions,type UpdateChannel} from '../../../../../core/distribution/index.ts';
import {buildNumber,versionText} from './release.ts';
import {machineCredential} from './machine-credential.ts';
import {orderDiagnostics,orderLogFiles} from './diagnostics.ts';
import {ANALYTICS,BROWSER,type AnalyticsService,type BrowserService} from '../../host/services.ts';

/** This computer's Claude Code CLI (the places its installers use; Electron's PATH is the system's). */
function claudeCLI():string {
 const home=os.homedir(),win=process.platform==='win32';
 const places=win?[path.join(home,'.local/bin/claude.exe')]
  :[path.join(home,'.local/bin/claude'),'/opt/homebrew/bin/claude','/usr/local/bin/claude',path.join(home,'.claude/local/claude')];
 return places.find(p=>{try{return fs.statSync(p).isFile();}catch{return false;}})||'';
}
/** `claude -p <message> --cloud <session>`: queues the message into the owner's project conversation and exits. */
function wake(cli:string,message:string,session:string):Promise<{ok:boolean;error?:string}> {
 const env={...process.env};for(const k of ['CLAUDECODE','CLAUDE_CODE_ENTRYPOINT','CLAUDE_CODE_REMOTE','CLAUDE_CODE_SSE_PORT'])delete env[k];
 env.PATH=[path.dirname(cli),env.PATH||'','/usr/bin:/bin:/usr/sbin:/sbin'].filter(Boolean).join(path.delimiter);
 return new Promise(resolve=>execFile(cli,['-p',message,'--cloud',session,'--output-format','json'],{env,timeout:60_000,maxBuffer:1_000_000,windowsHide:true},(error,stdout,stderr)=>{
  let out:Row|null=null;try{out=JSON.parse(String(stdout).trim().split('\n').pop()||'');}catch{}
  if(out?.ok===true)return resolve({ok:true});
  resolve({ok:false,error:String(out?.error||stderr||error?.message||'no answer').trim().slice(0,200)});
 }));
}

/** The sessions admin says to try, best first (gatehouse/order-target.mjs), or null: a missing or slow answer
 * keeps the built-in one. Older services answer `session` alone. */
async function adminSessions(found:{url:string;token:string}|null):Promise<string[]|null> {
 if(!found)return null;
 try{
  const response=await fetch(new URL('/api/machine/order-target',found.url),{redirect:'manual',headers:{Authorization:'Bearer '+found.token,'User-Agent':'worldlet-order'},signal:AbortSignal.timeout(5_000)});
  if(!response.ok)return null;
  const body=await response.json();
  return Array.isArray(body?.sessions)?body.sessions:typeof body?.session==='string'?[body.session]:null;
 }catch{return null;}
}
/** Tells admin a session did not take the Order, so the next one skips it until it is alive again. Best effort. */
function reportMiss(found:{url:string;token:string}|null,session:string,error:string){
 if(!found)return Promise.resolve();
 return fetch(new URL('/api/machine/order-target',found.url),{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+found.token,'Content-Type':'application/json','User-Agent':'worldlet-order'},body:JSON.stringify({session,error:error.slice(0,200)}),signal:AbortSignal.timeout(5_000)}).then(()=>{},()=>{});
}
const capture=async(contents:WebContents)=>{
 if(contents.isDestroyed())return null;
 const image=await contents.capturePage().catch(()=>null);
 return image&&!image.isEmpty()?image:null;
};
/** A JPEG of one picture, at most ORDER_FRAME_BYTES: smaller and softer until it fits. */
function jpegOf(image:NativeImage):string|null {
 for(const [width,quality] of [[1600,72],[1280,62],[1024,55],[800,50]] as const){
  const size=image.getSize(),scaled=size.width>width?image.resize({width,quality:'good'}):image;
  const jpeg=scaled.toJPEG(quality);
  if(jpeg.length<=ORDER_FRAME_BYTES)return jpeg.toString('base64');
 }
 return null;
}
/** Where a view whose page is `contents` sits in the window, searched one nesting deep. */
function boundsOf(root:any,contents:WebContents):Rectangle|null {
 for(const view of root?.children??[]){
  if(view?.webContents===contents)return view.getBounds();
  for(const inner of view?.children??[])if(inner?.webContents===contents){const a=view.getBounds(),b=inner.getBounds();return {x:a.x+b.x,y:a.y+b.y,width:b.width,height:b.height};}
 }
 return null;
}
/** The World's picture with the page's own picture laid over the white frame the World view shows where the
 * page is, so the first picture is what the person saw (orderOverlay); the plain World picture when it cannot. */
function withPage(world:NativeImage,worldAt:Rectangle,page:NativeImage,pageAt:Rectangle):NativeImage {
 try{
  const width=Math.min(1600,world.getSize().width);if(width<1||worldAt.width<1)return world;
  const base=world.resize({width,quality:'good'}),size=base.getSize(),scale=size.width/worldAt.width;
  const w=Math.round(pageAt.width*scale),h=Math.round(pageAt.height*scale);if(w<1||h<1)return world;
  const top=page.resize({width:w,height:h,quality:'good'});
  const pixels=Buffer.from(base.toBitmap());
  if(!orderOverlay({width:size.width,height:size.height,pixels},{width:w,height:h,pixels:top.toBitmap()},Math.round((pageAt.x-worldAt.x)*scale),Math.round((pageAt.y-worldAt.y)*scale)))return world;
  return nativeImage.createFromBitmap(pixels,{width:size.width,height:size.height});
 }catch{return world;}
}
/** The World view, then each other page shown in the window (an open website), as the person sees them. */
async function pictures(host:Host):Promise<{label:string;jpeg:string}[]> {
 const out:{label:string;jpeg:string}[]=[],world=host.worldView(),root=host.window()?.contentView;
 // The website panel's page on either engine: the World view shows only a white frame where it is, and on the
 // engine (CEF) the page is drawn by a view of its own whose address is not the site's (owner report 2026-10-06).
 const page=host.optional<BrowserService>(BROWSER)?.visiblePage(),shown=page&&!page.hidden&&!page.isClosed?page.pictureContents:null;
 const pageShot=shown?await capture(shown):null;
 let worldShot=world?await capture(world.webContents):null;
 const worldAt=world?boundsOf(root,world.webContents):null,pageAt=shown?boundsOf(root,shown):null;
 if(worldShot&&pageShot&&worldAt&&pageAt)worldShot=withPage(worldShot,worldAt,pageShot,pageAt);
 const worldJpeg=worldShot?jpegOf(worldShot):null;if(worldJpeg)out.push({label:'the Worldlet window',jpeg:worldJpeg});
 if(shown&&pageShot){
  let site='';try{site=new URL(page!.url).host;}catch{}
  const jpeg=jpegOf(pageShot);if(jpeg)out.push({label:`the page shown in Worldlet's browser${site?` (${site})`:''}`,jpeg});
 }
 const children=(host.window()?.contentView as any)?.children as any[]|undefined;
 for(const view of children??[]){
  if(out.length>=ORDER_FRAMES)break;
  const contents:WebContents|undefined=view?.webContents;
  if(!contents||view===world||contents===shown||view.getVisible?.()===false)continue;
  const b=view.getBounds?.();if(!b||b.width<80||b.height<80)continue;
  let url='';try{url=new URL(contents.getURL()).host;}catch{}
  if(!url||url==='worldlet.local')continue;
  const shot=await capture(contents),jpeg=shot?jpegOf(shot):null;if(jpeg)out.push({label:`the page shown in Worldlet's browser (${url})`,jpeg});
 }
 return out;
}

/** Order: the team's spoken tasks for the owner's Claude project (core/distribution/order.ts). Only the
 * Alpha and Dev channels answer; on any other the action refuses whatever the page asks. Every task
 * sent is also kept in the World's database (`orders`), whether or not it arrived. */
export function order(host:Host,channel:()=>UpdateChannel){
 return async(request:Row):Promise<OrderReply>=>{
  const on=channel();
  if(!orderAvailable(on))return {available:false,reason:'Only the Alpha and Dev apps can send an Order.'};
  const found=machineCredential(host),cli=claudeCLI();
  if(request.operation==='status')return found||cli?{available:true,ready:true}:{available:true,ready:false,reason:'This computer has neither Claude Code nor a Gatehouse enrolment, so tasks cannot be sent from it.'};
  const analytics=host.optional<AnalyticsService>(ANALYTICS);
  // An Order that ended before it was sent (the page says why, as one bucket the analytics allowlist keeps).
  if(request.operation==='stopped'){analytics?.recordProductEvent('order_stopped','',{order_stop:request.reason});return {available:true,ready:true};}
  if(request.operation!=='send')throw new WorldletError('Unknown Order operation.');
  const said=typeof request.said==='string'?request.said:'';
  if(!said.trim())throw new WorldletError('I didn’t catch a task. Try again.');
  const id=typeof request.id==='string'&&/^[a-f0-9]{8}$/.test(request.id)?request.id:crypto.randomBytes(4).toString('hex');
  const now=Date.now(),place=typeof request.place==='string'?request.place.slice(0,300):undefined;
  const version=versionText(host)||'development',build=buildNumber(host);
  const log=orderLog(host.store.ledger().history({since:now/1000-ORDER_LOG.minutes*60,limit:400}),now/1000);
  // 1. The whole task (words, pictures, log) in admin's inbox, the one place this computer and the project both reach.
  let stored:{id:string;screenshots:number}|null=null,storeError='';
  if(found){
   const frames=await pictures(host);
   let diagnostics,files:{name:string;text:string}[]=[];
   try{diagnostics=orderDiagnostics(host,host.optional<AnalyticsService>(ANALYTICS)?.installation()??'',now);}catch{}
   try{files=orderLogFiles(host);}catch(error){host.diagnostics.record(error,'order');}
   const item=orderItem({said,at:new Date(now),id,channel:on,version,build,platform:process.platform,place,log,frames,diagnostics,files});
   const post=(body:unknown)=>fetch(new URL('/api/machine/inbox',found.url),{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+found.token,'Content-Type':'application/json','User-Agent':'worldlet-order'},body:JSON.stringify(body),signal:AbortSignal.timeout(60_000)});
   try{
    let response=await post(item);
    // An admin service that does not take log files yet refuses the larger item; the words and pictures still go.
    if(!response.ok&&item.files&&[400,413].includes(response.status)){const {files:_,...bare}=item;response=await post(bare);}
    if(response.ok)stored={id:'order:'+item.sourceId,screenshots:item.frames.length};
    else{let reason='';try{reason=String((await response.json())?.error||'').slice(0,160);}catch{}storeError=`Gatehouse answered ${response.status}${reason?': '+reason:''}`;}
   }catch{storeError='Gatehouse could not be reached';}
  }else storeError='this computer is not enrolled with Gatehouse';
  // 2. The project conversation, at once, through this computer's Claude Code.
  // Each candidate in turn until one takes it: a replaced coordinator is archived and refuses, the next is the live one.
  let woke:{ok:boolean;error?:string}={ok:false,error:'Claude Code is not installed here'};
  if(cli){
   const message=orderMessage({said,at:new Date(now),channel:on,version,build,place,item:stored?.id??null,screenshots:stored?.screenshots??0});
   for(const session of orderSessions(process.env.WORLDLET_ORDER_SESSION,await adminSessions(found))){
    woke=await wake(cli,message,session);
    if(woke.ok)break;
    host.diagnostics.log(`Order: session …${session.slice(-8)} did not take it (${woke.error}).`);
    await reportMiss(found,session,woke.error||'');
   }
  }
  if(!woke.ok)host.diagnostics.log(`Order: the project was not woken (${woke.error}); the hourly report claims the inbox item.`);
  // 3. The World keeps its own copy of what was said and where it went (the pictures stay with admin).
  try{host.store.ledger().saveOrder(id,now/1000,{id,said,at:new Date(now).toISOString(),...(place?{place}:{}),channel:on,version,build,
   admin:stored?{item:stored.id,screenshots:stored.screenshots}:{error:storeError},project:woke.ok?{woke:true}:{woke:false,error:woke.error}});}
  catch(error){host.diagnostics.record(error,'order');}
  // Where it went, as one bucket: the project at once (woke), only admin's inbox (stored), or nowhere (failed).
  analytics?.recordProductEvent('order_sent','',{order_result:woke.ok?'woke':stored?'stored':'failed'});
  if(!stored&&!woke.ok)throw new WorldletError(`The task did not reach Claude (${storeError}; ${woke.error}).`);
  return {available:true,ready:true,sent:{id:stored?.id??'',screenshots:stored?.screenshots??0,logLines:log.length,woke:woke.ok,...(woke.ok?{}:{wakeError:woke.error})}};
 };
}
