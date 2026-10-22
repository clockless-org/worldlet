import {callHost} from '../../platform/bridge/host.ts';
import {pageFeatures} from '../../platform/bridge/features.ts';
import {isDesktopCompanion} from './world-surface.ts';
import {companionStill} from '../style/index.ts';
/** World frames drawn so far (pixi-world.ts metrics), or null when no World with a frame count is shown. */
const worldFrames=():number|null=>{const n=(document.querySelector('#notionWorld') as any)?.sceneMetrics?.performance?.frames;return typeof n==='number'?n:null;};
/** Settles once the World has drawn two more frames, at most WORLD_DRAWN_MS later (a hidden page draws none). */
const WORLD_DRAWN_MS=1500;
function worldDrawn(){
 const from=worldFrames();if(from===null)return Promise.resolve();
 return new Promise<void>(resolve=>{
  const until=setTimeout(resolve,WORLD_DRAWN_MS);
  const check=()=>{if((worldFrames()??Infinity)>=from+2){clearTimeout(until);resolve();}else requestAnimationFrame(check);};
  requestAnimationFrame(check);
 });
}
// Only Fox, its card and its message bar are portable; global world chrome and the buttons beside Fox are not.
export function installDesktopCompanion(){
 // Native may preserve the inactive world's last frame while the one live
 // page moves to the desktop. Exclude the portable cluster from that frame.
 // Resolves once the change could paint, so the snapshot taken next shows it.
 (window as any).worldletCompanionBackdrop=async(enabled:boolean)=>{
  document.documentElement.classList.toggle('companion-backdrop-capture',enabled);
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 };
 const fallback=document.createElement('aside');fallback.className='desktop-companion-setup';
 const portrait=document.createElement('img');portrait.src=companionStill();portrait.alt='Fox';
 const note=document.createElement('p');note.textContent='Open World to finish setting up Fox.';
 const reopen=document.createElement('button');reopen.type='button';reopen.className='companion-info-action';reopen.textContent='Open World';
 reopen.onclick=()=>{void callHost('openWorld').catch(()=>{note.textContent='Could not reopen World. Try again.';});};
 fallback.append(portrait,note,reopen);document.body.append(fallback);
 const capture=(automatic=false)=>{
  const hud=document.querySelector<HTMLElement>('#notionHUD');
  // OAuth legitimately activates a browser before the world/Companion exists.
  // Do not detach that setup page or create a second fallback Fox on blur.
  if(automatic&&(document.querySelector('#worldStartup')||!hud?.querySelector('.companion-avatar')))return null;
  const elements=hud?[...hud.querySelectorAll<HTMLElement>('.companion-pet,.companion-hide-button,.fox-name-tag,.companion-avatar canvas,.companion-controls>button,.companion-text-entry,.companion-input-handle,#notionCommand,.companion-input-wave,.companion-controls,.companion-dialogue')]:[fallback];
  if(hud&&!isDesktopCompanion())document.documentElement.style.setProperty('--companion-desktop-transform',getComputedStyle(hud).transform);
  const rects=elements.filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);
  // The bar widens when the pointer is on it or on Fox (controls.css). Crop around its open width from the start:
  // resizing the native window on every frame of that widening shook Fox on the desktop (owner Order 2026-10-12).
  const bar=hud?.querySelector<HTMLElement>('.companion-text-entry');
  if(bar?.getClientRects().length){
   const open=parseFloat(getComputedStyle(bar).getPropertyValue('--companion-bar-open'))||0,box=bar.getBoundingClientRect(),half=Math.min(open,innerWidth-32)/2,center=box.left+box.width/2;
   if(half>0)rects.push(new DOMRect(center-half,box.bottom-44,half*2,44));
  }
  if(!rects.length)return null;
  const x=Math.max(0,Math.floor(Math.min(...rects.map(r=>r.left))-16)),y=Math.max(0,Math.floor(Math.min(...rects.map(r=>r.top))-16));
  return {x,y,width:Math.min(innerWidth,Math.ceil(Math.max(...rects.map(r=>r.right))+16))-x,height:Math.min(innerHeight,Math.ceil(Math.max(...rects.map(r=>r.bottom))+16))-y};
 };
 (window as any).worldletCompanionGeometry=capture;
 // The desktop window covers the whole World view and lets the pointer through except over Fox's cluster
 // (modules/companion/window.ts pointer); while it lets it through, the window still hears the pointer move.
 let over:boolean|null=null;
 const PORTABLE='.companion-pet,.companion-dialogue,.companion-text-entry,.desktop-companion-setup,dialog[open]';
 const point=(next:boolean)=>{if(!isDesktopCompanion()||next===over)return;over=next;void callHost('desktopCompanionPointer',{over:next}).catch(()=>{over=null;});};
 document.addEventListener('mousemove',event=>{
  const target=event.target as Element|null;
  point(document.documentElement.classList.contains('is-dragging-fox')||!!document.querySelector('.is-dragging-fox')||!!target?.closest?.(PORTABLE));
 },{capture:true,passive:true});
 document.documentElement.addEventListener('mouseleave',()=>{if(!document.querySelector('.is-dragging-fox'))point(false);});
 let lastBounds='',frame=0;
 const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
  if(!isDesktopCompanion())return;
  // Transforms do not trigger ResizeObserver; keep the native crop around the
  // moving icon row until its actual CSS transitions finish (including reversals).
  const moving=document.querySelector('.companion-controls')?.getAnimations({subtree:true}).some(a=>a.playState==='running');
  if(moving)resize();
  const rect=capture(),key=JSON.stringify(rect);if(!rect||key===lastBounds)return;lastBounds=key;
  void callHost('desktopCompanionSize',{rect}).catch(()=>{lastBounds='';});
 });};
 new MutationObserver(resize).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','data-entry-expanded','data-entry-hover','data-entry-held'],childList:true});
 document.addEventListener('transitionrun',event=>{if((event.target as Element)?.closest('.companion-controls'))resize();});
 const observer=new ResizeObserver(resize);observer.observe(document.body);window.addEventListener('resize',resize);
 const apply=(enabled:boolean)=>{
  // A World page in a web browser has no desktop Companion window (contracts/web-world.ts): it stays the World.
  if(enabled&&pageFeatures().desktopCompanion===false)return;
  if(enabled===isDesktopCompanion())return;
  if(enabled)capture();
  if(enabled)document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close());
  document.documentElement.classList.toggle('desktop-companion',enabled);
  window.dispatchEvent(new CustomEvent('worldlet:desktop-companion',{detail:enabled}));
  window.dispatchEvent(new Event('resize'));lastBounds='';over=null;resize();
  if(!enabled)document.documentElement.style.removeProperty('--companion-desktop-transform');
  const hud=document.querySelector('#notionHUD');if(hud){observer.observe(hud);for(const element of hud.querySelectorAll('.companion-dialogue,#notionCommand'))observer.observe(element);}
 };
 (window as any).worldletDesktopCompanion=apply;
 // Returning from a reparented WebView needs a paint opportunity, not merely
 // a DOM/class acknowledgment. Native keeps the old frame above us meanwhile.
 // The World itself draws again only once its own frames resume (it stops while Fox is on the desktop), so wait
 // for two of them as well, or the native frame goes and the World shows its bare sky and labels (Mac Alpha 4132, #182).
 (window as any).worldletRestoreWorld=async()=>{
  apply(false);
  await worldDrawn();
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 };
 void callHost('desktopCompanionState').then(value=>{if(typeof value?.enabled==='boolean')apply(value.enabled);}).catch(()=>{});
}
