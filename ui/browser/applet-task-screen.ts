/**
 * Where a running Applet shows in the World (owner decision 2026-10-02):
 * - While Fox drives an Applet's website page and the person has left the Applet, a small live screen
 *   sits above that Applet's device ("over its head"), and the host draws Fox's page into its slot
 *   (browser-device.ts sends the slot as the page's rect, with `press`). Pressing it opens the Applet.
 *   Picture in picture at the World's bottom-right stays for videos only.
 * - Work without a browser page (reading mail, syncing) gets no screen: the device's lamp shows it.
 * - The screen's bar says the step Fox is on ("Filling in the form…", "Thinking…").
 * - When Fox's turn ends with the page out of sight, the screen gives way to a green check over the
 *   same device until the person opens the Applet (or presses the mark, which opens it). An
 *   exclamation over a device means something needs fixing (the lamp's notice), never "done".
 * The screen follows the device: every animation frame while it moves, a few times a second while it
 * is still. Where the device is not drawn, or the screen would cover Fox, its dialogue or a panel,
 * the screen hides and the page waits out of sight (a zero rect), still Fox's.
 */
import type {SurfaceRect} from '../../contracts/browser-surface.ts';
import {getApp} from '../../core/applets/index.ts';
import {taskPictureInPictureAspect} from '../../core/browser/index.ts';
import {appHudIcon} from '../applets/index.ts';
import {node} from '../components/index.ts';

export const TASK_SCREEN=Object.freeze({width:188,rim:4,bar:24,tail:9,gap:6,margin:8,stillMs:250});
// The screen draws over these, so it hides while it would touch one.
const COVERS=['.companion-avatar','#companionDialogue','#companionInfo','#attentionPreview','#notionDialog[open]','#notionContent:not([hidden])','.world-area','.browser-pip'];
const ZERO:SurfaceRect={x:0,y:0,width:0,height:0};
const el=(tag:string,className='')=>node(tag,className);

/** Where the screen goes over a device whose visible top centre is (x, top), inside a root of the
 * given size: its frame (bar, rim and slot) and the slot the host fills. Null when there is no room. */
export function taskScreenPlacement({x,top,aspect,root}:{x:number;top:number;aspect:number;root:{width:number;height:number}}):{frame:SurfaceRect;slot:SurfaceRect}|null {
 const {width,rim,bar,tail,gap,margin}=TASK_SCREEN;
 const slotWidth=width-2*rim,slotHeight=Math.round(slotWidth/aspect),height=bar+slotHeight+rim;
 if(!(root.width>=width+2*margin))return null;
 const left=Math.round(Math.min(Math.max(x-width/2,margin),root.width-margin-width)),y=Math.round(top-gap-tail-height);
 if(y<margin)return null;
 return {frame:{x:left,y,width,height},slot:{x:left+rim,y:y+bar,width:slotWidth,height:slotHeight}};
}

export function createAppletTaskScreen({root,openApplet,place}:{root:HTMLElement;openApplet:(id:string)=>void;place:(rect:SurfaceRect)=>void}){
 const frame=el('section','applet-task-screen'),bar=el('button','applet-task-screen-bar') as HTMLButtonElement,slot=el('div','applet-task-screen-slot');
 const dot=el('span','applet-task-screen-dot'),logo=el('img') as HTMLImageElement,label=el('span','applet-task-screen-label');
 frame.hidden=true;bar.type='button';logo.alt='';dot.setAttribute('aria-hidden','true');
 bar.append(dot,label,logo);frame.append(bar,slot);root.append(frame);
 frame.style.setProperty('--task-screen-rim',TASK_SCREEN.rim+'px');frame.style.setProperty('--task-screen-bar',TASK_SCREEN.bar+'px');frame.style.setProperty('--task-screen-tail',TASK_SCREEN.tail+'px');
 let applet='',page={width:16,height:9},sent='',frameID=0,timer=0,last='',measured=ZERO;
 const done=new Map<string,HTMLButtonElement>();
 bar.onclick=event=>{event.stopPropagation();if(applet)openApplet(applet);};
 // The bar says what Fox is doing on the page now ("Filling in the form…"), from the conversation's
 // turn or from the Applet task working on this Applet (owner decision 2026-10-03).
 let step='';
 window.addEventListener('worldlet:fox-step',(event:any)=>{
  const {text,applet:from}=event.detail||{};
  if(typeof text!=='string'||!text||(from&&(getApp(from)?.id||from)!==applet))return;
  step=text;if(applet&&frame.classList.contains('is-working')&&label.textContent!==step)label.textContent=step;
 });

 /** The device's visible top centre in root coordinates, or null where it is not drawn. */
 function head(id:string){
  if((root.dataset.depth||'overview')==='object')return null;
  const module=((root as any).sceneMetrics?.modules||[]).find((m:any)=>m.id===id&&m.visible!==false);
  const bounds=module?.peekBounds,canvas=root.querySelector<HTMLElement>('[data-renderer="sim-dom"],canvas[data-renderer="pixi-webgl"]')||root.querySelector('canvas');
  if(!bounds||!canvas||!(bounds.width>0))return null;
  const base=canvas.getBoundingClientRect(),box=root.getBoundingClientRect(),sx=canvas.clientWidth?base.width/canvas.clientWidth:1,sy=canvas.clientHeight?base.height/canvas.clientHeight:1;
  let top=base.top-box.top+bounds.y*sy;
  // Above the device's own saved-findings mark, never over it.
  const mark=root.querySelector<HTMLElement>(`.notion-pin[data-page$="${CSS.escape(id)}"] .applet-attention`);
  if(mark){const r=mark.getBoundingClientRect();if(r.height>0)top=Math.min(top,r.top-box.top);}
  return {x:base.left-box.left+(bounds.x+bounds.width/2)*sx,top,box};
 }
 const covered=(r:SurfaceRect,box:DOMRect)=>[...root.querySelectorAll<HTMLElement>(COVERS.join(','))].some(node=>{
  if(frame.contains(node))return false;const b=node.getBoundingClientRect();
  return b.width>0&&b.height>0&&getComputedStyle(node).visibility!=='hidden'&&b.left<box.left+r.x+r.width&&b.right>box.left+r.x&&b.top<box.top+r.y+r.height&&b.bottom>box.top+r.y;
 });
 function update(){
  frameID=0;clearTimeout(timer);timer=0;
  let slotRect=ZERO;
  const at=applet?head(applet):null;
  const spot=at?taskScreenPlacement({x:at.x,top:at.top,aspect:taskPictureInPictureAspect(page),root:{width:root.clientWidth,height:root.clientHeight}}):null;
  const shows=!!spot&&!covered(spot.frame,at!.box);
  if(frame.hidden===shows)frame.hidden=!shows;
  if(shows){
   const f=spot!.frame;
   const style=`translate(${f.x}px,${f.y}px)`,w=f.width+'px',h=f.height+'px';
   if(frame.style.transform!==style||frame.style.width!==w||frame.style.height!==h){
    Object.assign(frame.style,{transform:style,width:w,height:h});frame.style.setProperty('--task-screen-tail-x',Math.round(at!.x-f.x)+'px');
    // The host fills the slot exactly as laid out, borders and rounding included.
    const r=slot.getBoundingClientRect();measured={x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
   }
   slotRect=measured;
  }
  const key=JSON.stringify(slotRect);if(key!==sent){sent=key;place(slotRect);}
  for(const [id,mark] of done){
   const where=head(id),hidden=!where;
   if(mark.hidden!==hidden)mark.hidden=hidden;
   if(where){const style=`translate(${Math.round(where.x)}px,${Math.round(where.top-TASK_SCREEN.gap)}px) translate(-50%,-100%)`;if(mark.style.transform!==style)mark.style.transform=style;}
  }
  schedule(key+[...done.values()].map(m=>m.style.transform).join());
 }
 // Every frame while anything moves; a few times a second once all is still.
 function schedule(state:string){
  if(!applet&&!done.size)return;
  const moving=state!==last;last=state;
  if(moving)frameID=requestAnimationFrame(update);else timer=window.setTimeout(()=>{frameID=requestAnimationFrame(update);},TASK_SCREEN.stillMs);
 }
 function wake(){cancelAnimationFrame(frameID);clearTimeout(timer);last='';update();}
 return {
  /** Fox drives `key`'s page out of sight; the page is `size` in the panel. */
  show(key:string,size:{width:number;height:number}){
   const app:any=getApp(key),id=app?.id||key,title=app?.title||'this Applet',icon=app?appHudIcon(app).source:'';
   if(applet!==id)step='';
   applet=id;page=size;sent='';frame.style.transform='';clear(id);
   logo.hidden=!icon;if(icon)logo.src=icon;
   bar.setAttribute('aria-label','Fox is working on '+title+'. Open it');bar.title='Fox is working on '+title+' · Open';
   frame.setAttribute('aria-label','Fox is working on '+title);
   wake();
  },
  /** Whether Fox is still working on the page in the screen. */
  working(busy:boolean){frame.classList.toggle('is-working',busy);label.textContent=busy?step||'Fox is working':'Fox is done';if(!busy)step='';},
  /** The page left the screen (opened, or left like any page). */
  hide(){applet='';sent='';frame.hidden=true;place(ZERO);if(!done.size){cancelAnimationFrame(frameID);clearTimeout(timer);}},
  /** Fox's turn ended with `key`'s page out of sight: a Done mark over the device until it is opened. */
  done(key:string){
   const app:any=getApp(key),id=app?.id||key,title=app?.title||'this Applet';
   if(done.has(id))return;
   const mark=el('button','applet-task-done') as HTMLButtonElement;mark.type='button';mark.hidden=true;
   // A green check over its head (owner decision 2026-10-03); the exclamation is for something to fix.
   const check=el('span','applet-task-check');check.textContent='✓';check.setAttribute('aria-hidden','true');
   mark.append(check,Object.assign(el('span','applet-task-done-label'),{textContent:'Done'}));
   mark.title='Fox finished on '+title+' · Open';mark.setAttribute('aria-label','Fox finished on '+title+'. Open it');
   mark.onclick=event=>{event.stopPropagation();clear(id);openApplet(id);};
   root.append(mark);done.set(id,mark);wake();
  },
  /** The person opened `key`: its Done mark has been seen. */
  seen(key:string){clear(getApp(key)?.id||key);},
  get applet(){return applet;},
  get finished(){return [...done.keys()];},
  destroy(){cancelAnimationFrame(frameID);clearTimeout(timer);frame.remove();for(const mark of done.values())mark.remove();done.clear();},
 };
 function clear(id:string){const mark=done.get(id);if(mark){mark.remove();done.delete(id);}}
}
