import fs from 'node:fs';
import path from 'node:path';
import {BrowserWindow,session,type BaseWindow,type Rectangle} from 'electron';
import {readBrowserPaperEdge,type BrowserPaperEdge} from '../../../../../contracts/browser-surface.ts';

/** Paint only trusted theme pixels above either browser engine. The separate child window passes every click
 * through, like FoxGlow. No CSS, script or asset is injected into the external website. */
export class PaperEdge {
 private window:BrowserWindow|null=null;
 private parent:BaseWindow|null=null;
 private ready:Promise<void>|null=null;
 private generation=0;
 private offset:Rectangle={x:0,y:0,width:0,height:0};
 private cached:{asset:string;src:string}|null=null;
 private webRoot:()=>string;
 private report:(error:unknown)=>void;
 constructor(webRoot:()=>string,report:(error:unknown)=>void){this.webRoot=webRoot;this.report=report;}
 private create(parent:BaseWindow){
  if(this.window&&!this.window.isDestroyed()&&this.parent===parent)return this.window;
  this.close();
  const overlay=session.fromPartition('worldlet-overlay');
  overlay.setPermissionRequestHandler((_c,_p,answer)=>answer(false));
  const window=new BrowserWindow({parent,show:false,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,focusable:false,skipTaskbar:true,
   webPreferences:{session:overlay,contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false,backgroundThrottling:false}});
  window.setIgnoreMouseEvents(true);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  this.window=window;this.parent=parent;
  this.ready=window.loadFile(path.join(this.webRoot(),'paper-edge.html'));
  return window;
 }
 private image(asset:string){
  if(this.cached?.asset===asset)return this.cached.src;
  const root=fs.realpathSync(path.join(this.webRoot(),'theme-assets')),file=fs.realpathSync(path.join(this.webRoot(),asset));
  if(!file.startsWith(root+path.sep))throw Error('Paper edge asset is outside the bundled theme');
  if(fs.statSync(file).size>8*1024*1024)throw Error('Paper edge asset exceeds 8 MiB');
  const mime=asset.endsWith('.png')?'png':asset.endsWith('.jpg')?'jpeg':'webp';
  const src='data:image/'+mime+';base64,'+fs.readFileSync(file).toString('base64');this.cached={asset,src};return src;
 }
 apply(value:BrowserPaperEdge|undefined,parent:BaseWindow|null,screen:Rectangle|null){
  if(!value||!parent||!screen||screen.width<1||screen.height<1){this.hide();return;}
  try{
   const edge=readBrowserPaperEdge(value),window=this.create(parent),token=++this.generation;
   const f=edge.frame,box=f?edge.image:{x:0,y:0,width:screen.width,height:screen.height};
   this.offset={x:Math.floor(box.x),y:Math.floor(box.y),width:Math.ceil(box.width),height:Math.ceil(box.height)};
   const {x,y}=this.offset;
   window.setBounds({x:screen.x+x,y:screen.y+y,width:this.offset.width,height:this.offset.height});
   const paint={src:this.image(edge.asset),image:{...edge.image,x:edge.image.x-x,y:edge.image.y-y},profile:edge.profile,
    ...f?{frame:{src:this.image(f.asset),source:f.source,target:{...f.target,x:f.target.x-x,y:f.target.y-y}}}:{}};
   void this.ready!.then(()=>{
    if(token!==this.generation||window.isDestroyed())return false;
    return window.webContents.executeJavaScript(`paperEdge.apply(${JSON.stringify(paint)})`,false);
   }).then(ok=>{if(ok&&token===this.generation&&!window.isDestroyed()&&!parent.isDestroyed()&&parent.isVisible()&&!parent.isMinimized())window.showInactive();})
    .catch(error=>{if(token===this.generation)this.hide();this.report(error);});
  }catch(error){this.hide();this.report(error);}
 }
 place(screen:Rectangle){if(this.window&&!this.window.isDestroyed()&&this.window.isVisible())this.window.setBounds({x:screen.x+this.offset.x,y:screen.y+this.offset.y,width:this.offset.width,height:this.offset.height});}
 hide(){++this.generation;if(this.window&&!this.window.isDestroyed())this.window.hide();}
 close(){this.hide();const window=this.window;this.window=null;this.parent=null;this.ready=null;this.cached=null;if(window&&!window.isDestroyed())window.destroy();}
}
