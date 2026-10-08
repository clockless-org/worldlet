import {app,BaseWindow,dialog,session,type Rectangle,type Session,type View,type WebContents} from 'electron';
import path from 'node:path';
import {chromiumUserAgent,withClientHints} from '../../../../../core/browser/index.ts';
import {pageOf} from './page.ts';
import {downloadPath} from './download-path.ts';
import type {Host,Row} from '../../host/types.ts';
// Where website views sit: siblings above the trusted World view in the World window, at rects
// the World page reserves in its own CSS pixels.
export class Surface {
 private host:Host;
 constructor(host:Host){this.host=host;}
 window(){const window=this.host.window();return window&&!window.isDestroyed()?window:null;}
 parent():View|null {return this.window()?.contentView??null;}
 private world(){const view=this.host.worldView();return view&&!view.webContents.isDestroyed()?view:null;}
 private zoom(){const world=this.world();const zoom=world?world.webContents.getZoomFactor():1;return zoom>0?zoom:1;}
 /** The World viewport in CSS pixels. */
 size(){const world=this.world();if(!world)return {width:0,height:0};const bounds=world.getBounds(),zoom=this.zoom();return {width:bounds.width/zoom,height:bounds.height/zoom};}
 /** A rect in World viewport CSS pixels as bounds in the window's content view, optionally clipped to the World (Mac hostFrame). */
 toParent(rect:Row,clip=true):Rectangle|null {
  const world=this.world();if(!world)return null;
  const values=[rect?.x,rect?.y,rect?.width,rect?.height];
  if(!values.every(value=>typeof value==='number'&&Number.isFinite(value)))return null;
  let [x,y,width,height]=values as number[];
  if(clip){const size=this.size();width=Math.max(0,Math.min(width,size.width-x));height=Math.max(0,Math.min(height,size.height-y));x=Math.max(0,x);y=Math.max(0,y);}
  const bounds=world.getBounds(),zoom=this.zoom();
  return {x:Math.round(bounds.x+x*zoom),y:Math.round(bounds.y+y*zoom),width:Math.max(0,Math.round(width*zoom)),height:Math.max(0,Math.round(height*zoom))};
 }
 /** Content-view bounds as screen coordinates. */
 toScreen(rect:Rectangle):Rectangle|null {const window=this.window();if(!window)return null;const content=window.getContentBounds();return {x:content.x+rect.x,y:content.y+rect.y,width:rect.width,height:rect.height};}
 appActive(){return BaseWindow.getFocusedWindow()!==null;}
 windowVisible(){const window=this.window();return !!window&&window.isVisible()&&!window.isMinimized();}
}

const configured=new Map<string,Session>();
/** Website sessions present the Chromium the page actually runs on, consistently (#1089): the
 * reduced user agent without Electron or app tokens, and the default UA client hint headers that
 * Electron leaves out but Chromium browsers send (core/browser/client-hints.ts). */
export function presentEngine(value:Session){
 value.setUserAgent(chromiumUserAgent(value.getUserAgent()));
 const engine={chromium:process.versions.chrome??'',os:process.platform};
 value.webRequest.onBeforeSendHeaders({urls:['https://*/*','wss://*/*','http://localhost/*','http://127.0.0.1/*']},(details,callback)=>{
  const headers=withClientHints(details.url,details.requestHeaders,engine);
  callback(headers?{requestHeaders:headers}:{});
 });
}
export interface DownloadSink {(contents:WebContents,message:string):void}
/** Website storage per world, separate from the World's own session (and from each other:
 * the practice world never sees the person's website sign-ins). */
export function websiteSession(scope:'personal'|'practice',notify:DownloadSink):Session {
 const partition=scope==='practice'?'persist:website-practice':'persist:website';
 const existing=configured.get(partition);if(existing)return existing;
 const value=session.fromPartition(partition);
 presentEngine(value);
 value.setSpellCheckerEnabled(false);
 const granted=new Set<string>();
 const key=(contents:WebContents,permission:string,origin:string)=>`${contents.id} ${permission} ${origin}`;
 value.setPermissionRequestHandler((contents,permission,answer,details)=>{
  if(['fullscreen','clipboard-sanitized-write','pointerLock'].includes(permission)){answer(true);return;}
  const page=pageOf(contents);
  let origin='';try{origin=new URL((details as any).requestingUrl||contents.getURL()).origin;}catch{}
  if(!page||!origin||!['geolocation','media'].includes(permission)){answer(false);return;}
  const types:string[]=(details as any).mediaTypes??[];
  if(permission==='media'&&(!types.length||types.some(type=>!['audio','video'].includes(type)))){answer(false);return;}
  const media=(types.includes('audio')?1:0)|(types.includes('video')?2:0);
  let done=false;
  page.onPermission({kind:permission==='geolocation'?'location':'media',origin,media,answer:allow=>{
   if(done)return;done=true;
   if(allow&&!contents.isDestroyed())granted.add(key(contents,permission,origin));
   answer(allow&&!contents.isDestroyed());
  }});
 });
 value.setPermissionCheckHandler((contents,permission,origin)=>{
  if(['fullscreen','clipboard-sanitized-write'].includes(permission))return true;
  if(!contents||!['geolocation','media'].includes(permission))return false;
  try{return granted.has(key(contents,permission,new URL(origin).origin));}catch{return false;}
 });
 value.setDisplayMediaRequestHandler((_request,callback)=>callback({} as any));
 value.on('will-download',(_event,item,contents)=>{
  if(!contents||!pageOf(contents)){item.cancel();return;}
  // Saved straight into Downloads, with no save dialog (download-path.ts).
  item.setSavePath(downloadPath(app.getPath('downloads'),item.getFilename()||''));
  let started=false;
  item.on('updated',(_e,state)=>{if(!started&&state==='progressing'&&item.getSavePath()){started=true;notify(contents,'Downloading '+path.basename(item.getSavePath())+'…');}});
  item.once('done',(_e,state)=>{
   const file=item.getSavePath();if(!file)return;
   notify(contents,state==='completed'?'Saved '+path.basename(file):'Download interrupted: '+state+'. Try the download again.');
  });
 });
 configured.set(partition,value);
 return value;
}
