import type {SurfaceRect} from '../../contracts/browser-surface.ts';
import {getApp} from '../../core/applets/index.ts';
import {PICTURE_IN_PICTURE,pictureInPicturePlacement,pictureInPictureShare,pictureInPictureShows,tabApplet} from '../../core/browser/index.ts';
import {appHudIcon} from '../applets/index.ts';
import {node,uiIcon} from '../components/index.ts';

// Picture in picture in the World (core/browser/picture-in-picture.ts). The host's page is a
// native view above this HTML, so the controls sit around it: a bar above the video and a thin
// rim, sized here so the frame's slot is exactly the 16:9 video the host draws.
const RIM=6,BAR=32,CHROME={top:RIM+BAR,right:RIM,bottom:RIM,left:RIM};
// What the window must not cover: Fox, its dialogue and the footer, and also open panels and
// the World's own controls. Hidden and empty elements do not count.
const AVOID=['.companion-avatar','.companion-dock','#notionHUD','#companionDialogue','.world-watermark','.world-update-dock','.world-environment','#notionContent','#notionDialog','#companionInfo','#attentionPreview','.world-area','.world-task-tracker'];
const WATCHED=['hidden','open','style','class'];
const el=(tag:string,className='')=>node(tag,className);

/**
 * The Applet's control that offers picture in picture, in the top bar right of the title (#951;
 * among the Applet's own controls, .applet-bar-controls, when the HUD has made them); the Browser panel says when it shows. It is only an
 * icon; its label stays the accessible name. It is offered for videos only: Fox's pages stay in
 * their Applet (owner feedback 2026-10-02).
 */
export function createPictureInPictureOffer(root:HTMLElement,choose:()=>void){
 const offer=el('button','scene-control browser-pip-offer') as HTMLButtonElement;
 offer.type='button';offer.hidden=true;
 offer.innerHTML=uiIcon('pip');offer.append(Object.assign(el('span'),{textContent:'Picture in picture'}));
 offer.title='Keep the video playing in a small window and go back to the World';
 offer.onclick=event=>{event.stopPropagation();if(!offer.hidden)choose();};
 (root.querySelector('.applet-bar-controls')||root).append(offer);
 // Only a change is written: the panel asks on every layout pass.
 return {sync(visible:boolean){if(offer.hidden===visible)offer.hidden=!visible;}};
}

/**
 * The window's frame in the World's right third: a corner grip that resizes it, the Applet's name
 * and a plain Back button, both of which leave picture in picture for the Applet in one click, and
 * Close, above the slot the host's page fills. The grip's icon is a corner handle, not the arrows
 * that read as full screen (owner feedback 2026-10-02); pointing at the window lights up Back. It shows only in the World and is
 * placed again whenever what it avoids moves; `place` gets the slot in viewport CSS pixels,
 * zero-size while it waits out of sight. The size the person chooses is kept on this device.
 */
export function createPictureInPictureWindow({root,place,open,close,aspect=()=>PICTURE_IN_PICTURE.aspect}:{root:HTMLElement;place:(rect:SurfaceRect)=>void;open:()=>void;close:()=>void;aspect?:()=>number}){
 const frame=el('section','browser-pip'),bar=el('div','browser-pip-bar'),slot=el('div','browser-pip-video');
 frame.hidden=true;frame.style.setProperty('--pip-rim',RIM+'px');frame.style.setProperty('--pip-bar',BAR+'px');
 const grip=el('button','browser-pip-grip') as HTMLButtonElement,title=el('button','browser-pip-open') as HTMLButtonElement,logo=el('img') as HTMLImageElement,name=el('span');
 const shut=el('button','browser-pip-close') as HTMLButtonElement,back=el('button','browser-pip-back') as HTMLButtonElement;
 grip.type='button';grip.innerHTML=uiIcon('cornerGrip');grip.setAttribute('aria-label','Resize picture in picture');grip.title='Drag to resize';
 title.type='button';logo.alt='';title.append(logo,name);
 shut.type='button';shut.textContent='×';shut.setAttribute('aria-label','Close picture in picture');shut.title='Close; the video pauses';
 back.type='button';back.innerHTML=uiIcon('back');back.append(Object.assign(el('span'),{textContent:'Back'}));
 title.onclick=back.onclick=event=>{event.stopPropagation();open();};shut.onclick=event=>{event.stopPropagation();close();};
 bar.append(grip,title,back,shut);frame.append(bar,slot);root.append(frame);
 let active=false,sent='',frameID=0,timer=0,poll=0,watching=new WeakSet<Element>(),share=pictureInPictureShare(readShare(SIZE_KEY));
 const observer=new MutationObserver(schedule),resize=new ResizeObserver(schedule);
 // Animation frames may pause while the window is covered; the timer still places it.
 function schedule(){
  if(!active||frameID)return;
  const run=()=>{cancelAnimationFrame(frameID);clearTimeout(timer);frameID=0;update();};
  frameID=requestAnimationFrame(run);timer=window.setTimeout(run,80);
 }
 function update(){
  if(!active)return;
  // Inside an Applet, content or search the window waits out of sight, still playing.
  const shows=pictureInPictureShows(root.dataset.depth||'overview'),avoid=[];
   for(const node of shows?root.querySelectorAll<HTMLElement>(AVOID.join(',')):[]){
   if(frame.contains(node))continue;
   // Elements that appear later are watched from the first placement that sees them; once,
   // since observing again restarts a resize observation and would place the window forever.
   if(!watching.has(node)){watching.add(node);resize.observe(node);observer.observe(node,{attributes:true,attributeFilter:WATCHED});}
   const r=node.getBoundingClientRect();
   if(r.width>0&&r.height>0&&getComputedStyle(node).visibility!=='hidden')avoid.push({x:r.x,y:r.y,width:r.width,height:r.height});
  }
  const spot=shows?pictureInPicturePlacement({viewport:{width:innerWidth,height:innerHeight},avoid,chrome:CHROME,share,aspect:aspect()}):null;
  let rect={x:0,y:0,width:0,height:0};
  if(frame.hidden===!!spot)frame.hidden=!spot;
  if(spot){
   const box=root.getBoundingClientRect();
   Object.assign(frame.style,{left:spot.frame.x-box.left+'px',top:spot.frame.y-box.top+'px',width:spot.frame.width+'px',height:spot.frame.height+'px'});
   const r=slot.getBoundingClientRect();rect={x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
  }
  const key=JSON.stringify(rect);
  if(key!==sent){sent=key;place(rect);}
 }
 // The window keeps to the bottom-right, so it grows from its top-left corner; 16:9 holds.
 const resizeTo=(width:number)=>{share=pictureInPictureShare((width+2*PICTURE_IN_PICTURE.margin)/innerWidth);schedule();};
 grip.onpointerdown=event=>{
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();grip.setPointerCapture(event.pointerId);
  const start={x:event.clientX,y:event.clientY,width:frame.getBoundingClientRect().width};
  const move=(e:PointerEvent)=>resizeTo(start.width+Math.max(start.x-e.clientX,(start.y-e.clientY)*aspect()));
  const end=()=>{grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',end);grip.removeEventListener('pointercancel',end);saveShare(SIZE_KEY,share);};
  grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);
 };
 grip.onkeydown=event=>{
  const step={ArrowLeft:1,ArrowUp:1,ArrowRight:-1,ArrowDown:-1}[event.key];if(!step)return;
  event.preventDefault();share=pictureInPictureShare(share+step*0.02);saveShare(SIZE_KEY,share);schedule();
 };
 return {
  show(key:string){
   const app:any=getApp(tabApplet(key)),label=app?.title||'the website',icon=app?appHudIcon(app).source:'';
   name.textContent=app?.title||'Website';logo.hidden=!icon;if(icon)logo.src=icon;
   title.setAttribute('aria-label','Return to '+label);title.title='Return to '+label;back.setAttribute('aria-label','Back to '+label+', leaving picture in picture');back.title='Back to '+label;frame.setAttribute('aria-label',(app?.title||'Website')+', picture in picture');
   active=true;sent='';frame.hidden=false;
   window.addEventListener('resize',schedule);root.addEventListener('transitionend',schedule,true);root.addEventListener('animationend',schedule,true);
   observer.observe(root,{attributes:true,attributeFilter:['data-depth','data-view-level','data-detail-open','data-attention-preview']});resize.observe(root);
   // A slow sweep catches anything that moves without telling us.
   poll=window.setInterval(schedule,1000);
   update();
  },
   hide(){
   active=false;frame.hidden=true;sent='';
   cancelAnimationFrame(frameID);clearTimeout(timer);frameID=0;clearInterval(poll);
   observer.disconnect();resize.disconnect();watching=new WeakSet();
   window.removeEventListener('resize',schedule);root.removeEventListener('transitionend',schedule,true);root.removeEventListener('animationend',schedule,true);
  },
 };
}
// The chosen size is a convenience on this device; without storage the window keeps its default.
const SIZE_KEY='worldlet-pip-share-v1';
function readShare(key:string){try{return JSON.parse(globalThis.localStorage?.getItem(key)||'null');}catch{return null;}}
function saveShare(key:string,share:number){try{globalThis.localStorage?.setItem(key,JSON.stringify(share));}catch{}}
