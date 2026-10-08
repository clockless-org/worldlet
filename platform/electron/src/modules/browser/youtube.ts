import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {WebContentsView,shell,type Session} from 'electron';
import {digest,readJSON,writeJSON,WorldletError} from '../../files.ts';
import {VAULT,type VaultService} from '../../host/services.ts';
import {publicPage} from './rules.ts';
import type {Surface} from './surface.ts';
import type {Host,Row} from '../../host/types.ts';

interface Video {id:string;title:string;channel:string}
interface Queue {videos:Video[];current?:Video|null;seconds:number}
const card=(video:Video)=>({id:video.id,title:video.title,channel:video.channel,kind:'video',thumbnail:`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`});
const clip=(value:unknown,count:number,fallback='')=>[...(typeof value==='string'?value:fallback)].slice(0,count).join('');
export function videoID(input:unknown):string {
 const value=String(input??'').trim();
 if(/^[a-zA-Z0-9_-]{11}$/.test(value))return value;
 let url:URL;try{url=new URL(value);}catch{throw new WorldletError('Paste a valid YouTube video link.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw new WorldletError('Paste a valid YouTube video link.');
 const parts=url.pathname.split('/').filter(Boolean),host=url.hostname.toLowerCase();
 let id:string|null|undefined;
 if(host==='youtu.be'&&parts.length===1)id=parts[0];
 if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)){
  if(url.pathname==='/watch'){const v=url.searchParams.getAll('v');if(v.length===1)id=v[0];}
  if(parts.length===2&&['shorts','embed','live'].includes(parts[0]))id=parts[1];
 }
 if(!id||!/^[a-zA-Z0-9_-]{11}$/.test(id))throw new WorldletError('Paste a YouTube video link, not a channel or playlist.');
 return id;
}
/** The Applet plays public videos and keeps a local queue (Mac YouTubeService). It holds no
 * Google account; docs/GOOGLE-OAUTH-REVIEW.md says why the shared OAuth client asks for nothing here. */
export class YouTubeService {
 private host:Host;
 private forgot=false;
 constructor(host:Host){this.host=host;}
 private get sample(){return this.host.store.sampleEnabled();}
 private get key(){return 'youtube-'+digest(this.host.store.root);}
 private get file(){return path.join(this.host.store.root,'youtube-sample.json');}
 /** The personal queue is the World's (`world_settings` 'youtube', before 2026-10-05 `youtube.json`); the practice world keeps its own file. */
 private load():Row|null {return this.sample?readJSON(this.file):this.host.store.worldSetting('youtube');}
 queue():Queue {try{const value=this.load()??{};return {videos:Array.isArray(value.videos)?value.videos:[],current:value.current??null,seconds:typeof value.seconds==='number'?value.seconds:0};}catch{return {videos:[],current:null,seconds:0};}}
 private save(value:Queue){const stored:Row={videos:value.videos,seconds:value.seconds};if(value.current)stored.current=value.current;if(this.sample)writeJSON(this.file,stored);else this.host.store.saveWorldSetting('youtube',stored);}
 authorizeAgent(){if(this.sample||!this.host.store.state.cloudConsent)throw new WorldletError('Allow private content processing in Fox preferences before using YouTube through Fox. Sample worlds keep their own queue.');}
 /** Drops the grant, client registration and connection row left by a build that still asked for
  * `youtube.readonly`, so no refresh token outlives the feature. */
 private forgetAccount(){
  const vault=this.host.use<VaultService>(VAULT);vault.delete(this.key);vault.delete(this.key+'-client');
  const store=this.host.store;
  if(!store.state.connections.some((c:Row)=>c.provider==='youtube'))return;
  store.state.connections=store.state.connections.filter((c:Row)=>c.provider!=='youtube');store.changed();
 }
 status(){const q=this.queue();return {sample:this.sample,queue:q.videos.map(card),current:q.current?card(q.current):null,seconds:q.seconds};}
 async command(body:Row):Promise<Row> {
  const op=typeof body.operation==='string'?body.operation:'status',agent=body.agent===true;
  if(agent)this.authorizeAgent();
  if(!this.forgot){this.forgot=true;try{this.forgetAccount();}catch{}}
  if(op==='external'){
   const id=videoID(body.id);
   try{await shell.openExternal('https://www.youtube.com/watch?v='+id);}catch{throw new WorldletError('Could not open your browser.');}
   return {ok:true};
  }
  if(op==='status')return this.status();
  if(['queue','add_to_queue','remove_from_queue','remember'].includes(op)){
   const q=this.queue();
   if(op==='add_to_queue'||op==='remember'){
    const id=videoID(body.id),video:Video={id,title:clip(body.title,300,'YouTube video'),channel:clip(body.channel,200)};
    if(op==='add_to_queue'){
     if(q.videos.length>=200&&!q.videos.some(v=>v.id===id))throw new WorldletError('Your local queue is full (200 videos).');
     if(!q.videos.some(v=>v.id===id))q.videos.push(video);
    }else{q.current=video;const seconds=typeof body.seconds==='number'?body.seconds:0;q.seconds=Number.isFinite(seconds)?Math.max(0,Math.min(seconds,604800)):0;}
   }
   if(op==='remove_from_queue')q.videos=q.videos.filter(v=>v.id!==body.id);
   if(op!=='queue')this.save(q);
   return {queue:q.videos.map(card),untrusted:true};
  }
  throw new WorldletError('Unknown YouTube operation.');
 }
}

/** Restricted media document (Mac YouTubePlayer). Playback events are its only channel to the
 * host; it runs in the website session, never the World's. */
export class YouTubePlayer {
 private host:Host;
 private surface:Surface;
 private sessionFor:()=>Session;
 private view:WebContentsView|null=null;
 private videoID='';
 private hidden=false;
 snapshot:Row={state:-1};
 constructor(host:Host,surface:Surface,sessionFor:()=>Session){this.host=host;this.surface=surface;this.sessionFor=sessionFor;}
 private get origin(){return 'https://'+(this.host.profile.channel==='release'?'app.worldlet.mac':'app.worldlet.mac.dev');}
 private emit(value:Row){void this.host.page.call('worldletYouTubePlayer',value);}
 show(body:Row){
  const parent=this.surface.parent();
  if(!parent)throw new WorldletError('The player window is unavailable.');
  const id=videoID(body.id);
  if(id===this.videoID&&this.view){this.layout(body.rect??{});return;}
  this.stop();this.videoID=id;
  const seconds=typeof body.seconds==='number'&&Number.isFinite(body.seconds)?Math.max(0,Math.min(body.seconds,604800)):0;
  const nonce=crypto.randomBytes(16).toString('hex');
  // The page reports through the console with a secret only this document knows; the embedded
  // YouTube frame cannot read it.
  const bridge=`<script>Object.defineProperty(window,'worldletPlayerReport',{value:value=>console.log(${JSON.stringify(nonce)}+JSON.stringify(value))});</script>`;
  const html=fs.readFileSync(path.join(this.host.profile.webRoot,'youtube-player.html'),'utf8')
   .replace('__WORLDLET_VIDEO__',JSON.stringify({id,seconds})).replace('__WORLDLET_ORIGIN__',JSON.stringify(this.origin)).replace('<head>','<head>'+bridge);
  const view=new WebContentsView({webPreferences:{session:this.sessionFor(),contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false,backgroundThrottling:false}});
  view.setBorderRadius(12);view.setBackgroundColor('#151717');
  const contents=view.webContents;
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  // The player document never navigates; its frames stay on public pages.
  contents.on('will-frame-navigate',details=>{if(details.isMainFrame||!(publicPage(details.url)||details.url==='about:blank'||details.url==='about:srcdoc'))details.preventDefault();});
  contents.on('will-redirect',details=>{if(details.isMainFrame)details.preventDefault();});
  contents.on('console-message',details=>{
   if(this.view!==view||details.frame!==contents.mainFrame||!details.message.startsWith(nonce)||details.message.length>16384+nonce.length)return;
   try{const value=JSON.parse(details.message.slice(nonce.length));if(value&&typeof value==='object')this.receive(value);}catch{}
  });
  contents.on('did-finish-load',()=>{if(this.view===view)this.suspendIfHidden();});
  this.view=view;parent.addChildView(view);
  // Served as a document of the player's own HTTPS origin, as YouTube's embed requires.
  void contents.loadURL('data:text/html;charset=utf-8;base64,'+Buffer.from(html).toString('base64'),{baseURLForDataURL:this.origin+'/'}).catch(()=>{});
  this.layout(body.rect??{});this.snapshot={id,state:-1};this.emit(this.snapshot);
 }
 layout(rect:Row){
  const view=this.view;if(!view)return;
  const values=[rect.x,rect.y,rect.width,rect.height];
  if(!values.every(value=>typeof value==='number'&&Number.isFinite(value)))return;
  const [x,y,w,h]=values as number[],size=this.surface.size();
  const visible=rect.visible!==false&&w>=200&&h>=200&&x>=0&&y>=0&&x+w<=size.width+1&&y+h<=size.height+1;
  this.hidden=!visible;view.setVisible(visible);
  if(!view.webContents.isDestroyed())view.webContents.setAudioMuted(!visible);
  if(!visible)this.suspendIfHidden();
  const frame=this.surface.toParent({x,y,width:Math.max(0,w),height:Math.max(0,h)},false);
  if(frame)view.setBounds(frame);
 }
 stop(){
  const old=this.view;if(!old)return;
  this.view=null;this.videoID='';
  try{this.surface.parent()?.removeChildView(old);}catch{}
  if(!old.webContents.isDestroyed()){old.webContents.setAudioMuted(true);old.webContents.close();}
  this.snapshot={state:-1,closed:true};this.emit(this.snapshot);
 }
 async command(body:Row):Promise<Row> {
  const op=typeof body.operation==='string'?body.operation:'status';
  if(op==='status')return this.snapshot;
  const view=this.view;
  if(!['play','pause','seek'].includes(op)||!view||this.hidden)throw new WorldletError('Open a video in the YouTube Applet first.');
  const seconds=typeof body.seconds==='number'?body.seconds:0;
  if(!Number.isFinite(seconds)||seconds<0||seconds>604800)throw new WorldletError('Invalid playback position.');
  try{await view.webContents.executeJavaScript(`window.worldletPlayerCommand(${JSON.stringify(op)},${seconds})`,true);}
  catch{throw new WorldletError('This page could not complete the browser operation.');}
  return {accepted:true,playback:this.snapshot};
 }
 private suspendIfHidden(){
  const view=this.view;if(!view||!this.hidden||view.webContents.isDestroyed())return;
  void view.webContents.executeJavaScript(`window.worldletPlayerCommand?.('pause',0)`,false).catch(()=>{});
 }
 private receive(body:Row){
  if(body.id!==this.videoID)return;
  const state=typeof body.state==='number'?body.state:-1,seconds=typeof body.seconds==='number'?body.seconds:0,duration=typeof body.duration==='number'?body.duration:0;
  if(![-1,0,1,2,3,5].includes(state)||!Number.isFinite(seconds)||!Number.isFinite(duration))return;
  this.snapshot={id:this.videoID,state,seconds:Math.max(0,seconds),duration:Math.max(0,duration),title:clip(body.title,300),ready:body.ready===true||this.snapshot.ready===true};
  if(typeof body.error==='number'&&Number.isInteger(body.error))this.snapshot.error=body.error;
  this.emit(this.snapshot);
  if(state===1)this.suspendIfHidden();
 }
}
