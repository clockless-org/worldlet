import {BrowserWindow,session,type BaseWindow,type Rectangle} from 'electron';
import type {Row} from '../../host/types.ts';
import {GLOW_PAGE} from './glow-page.ts';
// Fox's working glow, pointer and the page's one status over the website page while Fox drives it
// (contract: BrowserFoxGlow in contracts/browser-surface.ts). They are drawn in their own transparent
// window above the page that ignores the mouse: a view inside the World window would take the page's
// clicks, and nothing may be added to the website's document. Being outside the page it survives
// page loads; it never moves or resizes the page beneath it. The frame's colors glow inward over the
// page edge, equally deep all round: the glow's strength depends only on the distance from the
// page's edge, so the corners no longer glow twice as strong as the sides (#1619), and it reaches right
// into the corners, leaving no sliver of the page between it and the frame. The status
// is a small card grown from the top edge: Fox's steps, ticked as Fox moves on, then Fox's result in
// the same place. Fox's pointer glides to each control Fox acts on.
export interface GlowStep {text:string;done:boolean}
export interface GlowStyle {label:string;colors:string[];turnSeconds:number;phaseSeconds:number;steps:GlowStep[];earlier:number;result:string;finished:boolean}
export function glowStyle(value:Row|undefined|null):GlowStyle|null {
 if(!value||typeof value.label!=='string'||!value.label||!Array.isArray(value.colors)||value.colors.length<2)return null;
 if(!value.colors.every((color:unknown)=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)))return null;
 const turn=Number(value.turnSeconds),phase=Number(value.phaseSeconds);
 if(!Number.isFinite(turn)||turn<0||!Number.isFinite(phase)||phase<0)return null;
 const steps=Array.isArray(value.steps)?value.steps.filter((step:any)=>step&&typeof step.text==='string'&&step.text).slice(0,8).map((step:any)=>({text:String(step.text).slice(0,80),done:step.done===true})):[];
 const earlier=Number.isInteger(value.earlier)&&value.earlier>0?Math.min(value.earlier,999):0;
 return {label:value.label,colors:[...value.colors],turnSeconds:turn,phaseSeconds:phase,steps,earlier,
  result:typeof value.result==='string'?value.result.slice(0,240):'',finished:value.finished===true};
}

export class FoxGlow {
 private window:BrowserWindow|null=null;
 private parent:BaseWindow|null=null;
 private ready:Promise<void>|null=null;
 style:GlowStyle|null=null;
 get isShowing(){return !!this.style&&!!this.window&&!this.window.isDestroyed()&&this.window.isVisible();}
 private create(parent:BaseWindow){
  if(this.window&&!this.window.isDestroyed()&&this.parent===parent)return this.window;
  this.close();
  const overlay=session.fromPartition('worldlet-overlay');
  overlay.setPermissionRequestHandler((_contents,_permission,answer)=>answer(false));
  const window=new BrowserWindow({parent,show:false,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,focusable:false,skipTaskbar:true,
   webPreferences:{session:overlay,contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false,backgroundThrottling:false}});
  window.setIgnoreMouseEvents(true);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  this.window=window;this.parent=parent;
  this.ready=window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(GLOW_PAGE)).catch(()=>{});
  return window;
 }
 private run(code:string){
  const window=this.window;if(!window||window.isDestroyed())return Promise.resolve(undefined);
  return (this.ready??Promise.resolve()).then(()=>window.isDestroyed()?undefined:window.webContents.executeJavaScript(code,false)).catch(()=>undefined);
 }
 /** Every layout carries the current glow; null means Fox is not driving the page. */
 apply(style:GlowStyle|null,parent:BaseWindow|null,screen:Rectangle|null){
  if(!style||!parent||!screen||screen.width<1||screen.height<1){this.hide();return;}
  const window=this.create(parent);
  this.style=style;
  window.setBounds(screen);
  void this.run(`glow.apply(${JSON.stringify(style)})`);
  if(!window.isVisible())window.showInactive();
 }
 place(screen:Rectangle){if(this.isShowing&&screen.width>=1&&screen.height>=1)this.window!.setBounds(screen);}
 hide(){
  if(!this.style&&!this.window?.isVisible())return;
  this.style=null;
  void this.run('glow.apply(null)');
  if(this.window&&!this.window.isDestroyed())this.window.hide();
 }
 /** Glides Fox's pointer to a point on the page and presses; resolves once the press shows. */
 async point(x:number,y:number){
  if(!this.isShowing)return;
  const seconds=Number(await this.run(`glow.point(${Number(x)},${Number(y)})`))||0;
  if(seconds>0)await new Promise(resolve=>setTimeout(resolve,seconds*1000+200));
 }
 close(){
  this.style=null;
  const window=this.window;this.window=null;this.parent=null;this.ready=null;
  if(window&&!window.isDestroyed())window.destroy();
 }
}
