// Where a CEF page shows: a trusted, sandboxed view in the World window whose renderer draws the
// engine's frames (surface-preload.ts) and reports the person's input. The view never loads a
// website; the page runs in the engine. Each frame arrives as a shared GPU surface, is imported here
// (Electron's sharedTexture) and handed to the renderer; the engine reuses the surface's slot once
// every reference is released. On Linux a frame is BGRA pixels in a shared-memory slot, read here
// and handed to the renderer; the slot returns to the engine once read.
import {WebContentsView,session,sharedTexture,type SharedTextureImported} from 'electron';
import type {EngineMessage,WebEngine} from './process.ts';

const HTML=`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff;user-select:none;-webkit-user-select:none}
#view{position:absolute;left:0;top:0;width:100%;height:100%}#popup{position:absolute;display:none}
#input{position:absolute;left:0;top:0;width:1px;height:1px;padding:0;border:0;margin:0;opacity:0;resize:none;outline:none;overflow:hidden;pointer-events:none;caret-color:transparent}
</style></head><body><canvas id="view"></canvas><canvas id="popup"></canvas><textarea id="input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-hidden="true"></textarea></body></html>`;

export class SurfaceView {
 readonly view:WebContentsView;
 private ready=false;
 private destroyed=false;
 // Windows: NT handle values the engine announces once per slot generation.
 private handles=new Map<string,number>();
 // The newest generation per slot, and imports still holding older ones (macOS surfaces).
 private generations=new Map<number,number>();
 private inflight=new Map<string,number>();
 // Linux: per element (0 view, 1 popup widget), the newest frame waiting while the renderer draws
 // the one before it, which elements the renderer is drawing, and a buffer to read each into.
 private waiting=new Map<number,{id:number,frame:EngineMessage}>();
 private drawing=new Set<number>();
 private buffers=new Map<number,Buffer>();
 onInput:(message:EngineMessage)=>void=()=>{};
 /** The view's renderer (re)loaded: what was sent or shown before is gone, so the page sends it again. */
 onReady:()=>void=()=>{};
 /** The last reason a frame did not reach the screen (import, hand-over or drawing), for diagnostics. */
 lastError='';
 /** When a frame was last handed to the renderer (ms; 0: never), so a page that stopped drawing is noticed. */
 lastDrawn=0;
 private engine:WebEngine;
 constructor(engine:WebEngine,preload:string){
  this.engine=engine;
  this.view=new WebContentsView({webPreferences:{session:session.fromPartition('worldlet-web-surface'),preload,contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false}});
  this.view.setBackgroundColor('#ffffff');
  const contents=this.view.webContents;
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  contents.on('will-navigate',event=>event.preventDefault());
  contents.on('did-start-loading',()=>{this.ready=false;this.drawing.clear();});
  contents.ipc.on('web-surface',(_event,message)=>{
   if(!message||typeof message!=='object'||typeof message.t!=='string')return;
   if(message.t==='ready'){this.ready=true;this.drawing.clear();this.onReady();}
   else if(message.t==='drawn'){this.drawing.delete(message.k);this.draw(message.k);}
   else if(message.t==='error')this.lastError=String(message.message??'').slice(0,300);
   else this.onInput(message as EngineMessage);
  });
  void contents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(HTML)).catch(()=>{});
 }
 get contents(){return this.view.webContents;}
 send(message:EngineMessage){if(!this.destroyed&&!this.view.webContents.isDestroyed())this.view.webContents.send('web-surface',message);}

 /** Shows one engine frame (`frame` message of page `id`). */
 present(id:number,frame:EngineMessage,attempt=0){
  this.remember(id,frame);
  const ack=()=>this.engine.send({t:'ack',id,k:frame.k,s:frame.s});
  if(this.destroyed||!this.ready||this.view.webContents.isDestroyed()){ack();return;}
  if(process.platform==='linux'){
   // A newer frame replaces one still waiting; that one's slot goes back unread.
   const previous=this.waiting.get(frame.k);
   if(previous)this.engine.send({t:'ack',id:previous.id,k:previous.frame.k,s:previous.frame.s});
   this.waiting.set(frame.k,{id,frame});this.draw(frame.k);
   return;
  }
  const tag=id*256+frame.k*16+frame.s,key=tag+':'+frame.g;
  let handle:Buffer|null=null;
  if(process.platform==='darwin'){
   handle=this.engine.addon?.take(tag,frame.g)??null;
   // The surface's Mach message can trail the frame message by a moment.
   if(!handle&&attempt<25){setTimeout(()=>this.present(id,frame,attempt+1),2);return;}
  }else{
   const value=this.handles.get(key);
   if(value!==undefined){handle=Buffer.alloc(8);handle.writeBigUInt64LE(BigInt(value));}
  }
  if(!handle){ack();return;}
  this.retire(tag,frame.g);
  let imported:SharedTextureImported;
  try{
   imported=sharedTexture.importSharedTexture({
    textureInfo:{pixelFormat:frame.f==='rgba'?'rgba':'bgra',codedSize:{width:frame.w,height:frame.h},visibleRect:{x:0,y:0,width:frame.w,height:frame.h},
     handle:process.platform==='darwin'?{ioSurface:handle}:{ntHandle:handle}},
    allReferencesReleased:()=>{this.release(key);ack();}
   });
  }catch(error){this.lastError='import: '+String((error as Error)?.message??error);ack();return;}
  this.inflight.set(key,(this.inflight.get(key)??0)+1);this.lastDrawn=Date.now();
  void sharedTexture.sendSharedTexture({frame:this.view.webContents.mainFrame,importedSharedTexture:imported},{k:frame.k}).catch(error=>{this.lastError='hand-over: '+String(error?.message??error);}).finally(()=>imported.release());
 }
 /** Linux: hands the element's waiting frame to the renderer once it has drawn the one before. */
 private draw(k:number){
  const next=this.waiting.get(k);
  if(!next||this.drawing.has(k)||this.destroyed||!this.ready||this.view.webContents.isDestroyed())return;
  this.waiting.delete(k);
  const {id,frame}=next,data=this.engine.readFrame(id,frame,this.buffers.get(k));
  this.engine.send({t:'ack',id,k,s:frame.s});
  if(!data){this.lastError=`read: slot ${frame.s} of page ${id} is gone`;return;}
  this.buffers.set(k,data);this.drawing.add(k);this.lastDrawn=Date.now();
  this.send({t:'pixels',k,w:frame.w,h:frame.h,data:data.subarray(0,frame.w*frame.h*4)});
 }
 /** Returns a frame that is not shown (hidden page, covered opener) to the engine, keeping what it announces. */
 skip(id:number,frame:EngineMessage){this.remember(id,frame);this.engine.send({t:'ack',id,k:frame.k,s:frame.s});}
 /** Windows: the engine announces a slot's handle only with that generation's first frame, so it is kept even when that
  * frame is not shown (the view not ready yet, the page hidden); otherwise the slot never shows again (RC d7cbd7f1, #1233). */
 private remember(id:number,frame:EngineMessage){
  if(process.platform==='darwin'||typeof frame.handle!=='number')return;
  const tag=id*256+frame.k*16+frame.s;
  this.retire(tag,frame.g);
  this.handles.set(tag+':'+frame.g,frame.handle);
 }
 /** A newer generation of a slot replaces the older surface once nothing imports it. */
 private retire(tag:number,generation:number){
  const previous=this.generations.get(tag);
  if(previous===generation)return;
  this.generations.set(tag,generation);
  if(previous===undefined)return;
  const key=tag+':'+previous;
  this.handles.delete(key);
  if(!this.inflight.get(key))this.engine.addon?.drop(tag,previous);
 }
 private release(key:string){
  const count=(this.inflight.get(key)??1)-1;
  if(count>0){this.inflight.set(key,count);return;}
  this.inflight.delete(key);
  const [tag,generation]=key.split(':').map(Number);
  if(this.generations.get(tag)!==generation)this.engine.addon?.drop(tag,generation);
 }
 destroy(parent:{removeChildView(view:WebContentsView):void}|null){
  if(this.destroyed)return;
  this.destroyed=true;
  for(const {id,frame} of this.waiting.values())this.engine.send({t:'ack',id,k:frame.k,s:frame.s});
  this.waiting.clear();
  try{parent?.removeChildView(this.view);}catch{}
  if(!this.view.webContents.isDestroyed())this.view.webContents.close();
 }
}
