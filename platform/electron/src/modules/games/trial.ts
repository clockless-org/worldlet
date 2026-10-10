import {BrowserWindow,session,type Session,type WebContents,type WebContentsView} from 'electron';
import {madeGameTrialProblems,readMadeGameReport} from '../../../../../core/games/index.ts';
import type {Surface} from '../browser/surface.ts';
import type {Row} from '../../host/types.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let configured:Session|null=null;
/** Made games run in a session of their own (core/games/README.md): in memory, no permissions, and every
 * request that is not the page itself (data:) or something it made (blob:) is cancelled, so a game can
 * reach neither the network nor anything of the World's. */
export function gameSession():Session {
 if(configured)return configured;
 const value=session.fromPartition('worldlet-made-games');
 value.setPermissionRequestHandler((_contents,_permission,answer)=>answer(false));
 value.setPermissionCheckHandler(()=>false);
 value.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!/^(?:data|blob):/i.test(details.url)}));
 value.on('will-download',event=>event.preventDefault());
 value.setSpellCheckerEnabled(false);
 configured=value;
 return value;
}
/** A made game's page as a URL of its own: a data document has an opaque origin, so it shares no storage. */
export const gameURL=(document:string)=>'data:text/html;charset=utf-8;base64,'+Buffer.from(document).toString('base64');
export const gameWebPreferences=()=>({session:gameSession(),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:false,javascript:true,backgroundThrottling:false});
/** Every made game's or Moment Applet's contents (trial, Game Factory and Widgets players): no new
 * windows, no navigation, and no WebRTC. Chromium's WebRTC UDP never passes the session's request
 * filter, so without a proxy this policy leaves a peer connection no route at all. */
export function lockGameContents(contents:WebContents){
 contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
 contents.setWindowOpenHandler(()=>({action:'deny'}));
 contents.on('will-navigate',event=>event.preventDefault());
 contents.on('will-redirect',event=>event.preventDefault());
}
/** Places a player's view at the rect its panel reserves: shown and heard only while the whole rect
 * fits the World. Returns false for a rect without numbers. */
export function placeGameView(surface:Surface,view:WebContentsView,rect:Row):boolean {
 const values=[rect?.x,rect?.y,rect?.width,rect?.height];
 if(!values.every(value=>typeof value==='number'&&Number.isFinite(value)))return false;
 const [x,y,w,h]=values as number[],size=surface.size();
 const visible=rect.visible!==false&&w>=160&&h>=120&&x>=0&&y>=0&&x+w<=size.width+1&&y+h<=size.height+1;
 view.setVisible(visible);
 if(!view.webContents.isDestroyed())view.webContents.setAudioMuted(!visible);
 const frame=surface.toParent({x,y,width:Math.max(0,w),height:Math.max(0,h)},false);
 if(frame)view.setBounds(frame);
 if(visible&&rect.focus===true&&!view.webContents.isDestroyed())view.webContents.focus();
 return true;
}
/** Takes a player's view off the World and closes its page. */
export function closeGameView(surface:Surface,view:WebContentsView){
 try{surface.parent()?.removeChildView(view);}catch{}
 if(!view.webContents.isDestroyed()){view.webContents.setAudioMuted(true);view.webContents.close();}
}

/** Plays the game for a few seconds out of sight: it must load, draw something and survive a few keys
 * and a click without a script error. Returns the problems for the model to fix (none when it passed).
 * Widgets (core/artifacts) are tried the same way at phone size, with their own report reader and verdict. */
export async function tryMadeGame(document:string,{width=900,height=600,read=readMadeGameReport,problems=madeGameTrialProblems}:{width?:number;height?:number;read?:(line:string)=>{error?:string}|null;problems?:typeof madeGameTrialProblems}={}):Promise<string[]> {
 const window=new BrowserWindow({show:false,width,height,webPreferences:{...gameWebPreferences(),offscreen:true}});
 const contents=window.webContents,errors:string[]=[];
 let crashed=false,loaded=false;
 lockGameContents(contents);
 contents.on('render-process-gone',()=>{crashed=true;});
 contents.on('console-message',details=>{
  const report=read(details.message);
  if(report?.error)errors.push(report.error);
  else if(!report&&details.level==='error'&&!/^Uncaught\b/.test(details.message))errors.push(details.message.slice(0,300));
 });
 try{
  await Promise.race([contents.loadURL(gameURL(document)).then(()=>{loaded=true;}),sleep(8000)]);
  await sleep(1500);
  if(!crashed&&!contents.isDestroyed()){
   for(const keyCode of ['Enter','Space','Right','Up','Left','Down']){contents.sendInputEvent({type:'keyDown',keyCode});contents.sendInputEvent({type:'keyUp',keyCode});await sleep(60);}
   for(const type of ['mouseDown','mouseUp'] as const)contents.sendInputEvent({type,x:Math.round(width/2),y:Math.round(height/2),button:'left',clickCount:1});
   await sleep(1200);
  }
  let distinctColors:number|undefined;
  if(!crashed&&!contents.isDestroyed())try{distinctColors=colors(await contents.capturePage());}catch{}
  return problems({errors:[...new Set(errors)],distinctColors,crashed,loaded});
 }finally{if(!window.isDestroyed())window.destroy();}
}
/** How many different colors a grid of samples sees; undefined when there was no picture to read. */
function colors(image:Electron.NativeImage):number|undefined {
 const {width,height}=image.getSize();if(width<8||height<8)return undefined;
 const bitmap=image.toBitmap(),seen=new Set<number>();
 for(let y=0;y<16;y++)for(let x=0;x<24;x++){
  const offset=((Math.floor((y+.5)*height/16)*width)+Math.floor((x+.5)*width/24))*4;
  seen.add((bitmap[offset]>>4)<<8|(bitmap[offset+1]>>4)<<4|bitmap[offset+2]>>4);
 }
 return seen.size;
}
