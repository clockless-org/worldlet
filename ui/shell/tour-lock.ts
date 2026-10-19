/**
 * Until the first-run tour is over, only the tour responds (owner request 2026-10-04,
 * ui/shell/ONBOARDING.md#after-arrival-guided-tour-then-a-first-useful-task).
 *
 * - The lock: whenever the World is in front and no spotlight is up (Fox still reading, Fox busy, a
 *   step between boxes), a clear layer takes every click, wheel, key and focus outside Fox's bubble,
 *   so nothing in the World, the corner controls or Fox's input responds. It draws nothing.
 * - **Tutorial**, a switch in the window's bottom-right corner while a tour runs (owner Order 2026-10-07),
 *   turned on: it is the one way out of the first run, and a replayed tour uses it too. It stays above the
 *   spotlight and the lock. Once the tour is over it goes: the tour is shown again from Settings › Help
 *   (owner request 2026-10-11: Tutorial and Feedback go back into Settings), never from a corner of the World.
 */
import {uiIcon} from '../style/index.ts';
// Where the switch stands: the World's corner controls' inset from the window's right and bottom edges.
const BUBBLE='#companionDialogue',RIGHT=24,BOTTOM=22,EDGE=12;
const visible=(e:Element|null)=>{if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0?r:null;};
function tutorialSwitch(className:string,on:boolean){
 const b=document.createElement('button');b.type='button';b.className=className+' tutorial-switch';b.setAttribute('role','switch');b.setAttribute('aria-checked',String(on));
 b.innerHTML=uiIcon('bulb')+'<span class="tutorial-switch-label">Tutorial</span><span class="tutorial-switch-track" aria-hidden="true"><i></i></span>';
 b.addEventListener('pointerdown',event=>event.stopPropagation());
 return b;
}
export function createTourLock(root:HTMLElement,{locked,skippable,turnOff}:{locked:()=>boolean,skippable:()=>boolean,turnOff:()=>void}){
 const layer=document.createElement('div');layer.className='tour-lock';layer.hidden=true;layer.setAttribute('aria-hidden','true');
 // The tour's switch, on: it turns the tutorial off (Skip) while the tour runs.
 const button=tutorialSwitch('tour-switch',true);button.hidden=true;
 button.onclick=event=>{event.preventDefault();event.stopPropagation();turnOff();};
 document.body.append(layer,button);
 let on=false,frame=0,cut='',destroyed=false;
 const allowed=(node:EventTarget|null)=>node instanceof Node&&(button.contains(node)||!!root.querySelector(BUBBLE)?.contains(node));
 const swallow=(event:Event)=>{event.preventDefault();event.stopPropagation();};
 for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','contextmenu'])layer.addEventListener(type,swallow);
 layer.addEventListener('wheel',swallow,{passive:false});
 function keydown(event:KeyboardEvent){
  if(!on)return;
  if(allowed(event.target)&&(['Tab','Enter',' '].includes(event.key)||event.target instanceof HTMLInputElement))return;
  if(event.key==='Tab'){event.preventDefault();(root.querySelector<HTMLElement>(BUBBLE+' button')||button).focus();return;}
  swallow(event);
 }
 function focusin(event:FocusEvent){if(on&&!allowed(event.target)&&event.target instanceof HTMLElement)event.target.blur();}
 function lock(next:boolean){
  if(next===on)return;on=next;layer.hidden=!on;cut='';
  if(on){
   root.dataset.tourLock='true';
   window.addEventListener('keydown',keydown,true);window.addEventListener('focusin',focusin,true);
   const typing=document.activeElement;if(typing instanceof HTMLElement&&!allowed(typing))typing.blur();
  }else{delete root.dataset.tourLock;window.removeEventListener('keydown',keydown,true);window.removeEventListener('focusin',focusin,true);}
 }
 // In the window's bottom-right, where the World's corner controls stand.
 function place(){
  if(button.hidden){button.hidden=false;root.dataset.tourSkippable='true';}
  const w=button.offsetWidth,h=button.offsetHeight,x=innerWidth-RIGHT-w,y=innerHeight-BOTTOM-h;
  button.style.transform=`translate(${Math.round(Math.max(EDGE,x))}px,${Math.round(Math.max(EDGE,y))}px)`;
 }
 const hide=()=>{if(!button.hidden){button.hidden=true;delete root.dataset.tourSkippable;}};
 function draw(){
  frame=0;if(destroyed)return;
  const skipping=skippable();
  // A spotlight takes the clicks itself; the lock covers the moments between.
  lock(locked()&&root.dataset.tourSpotlight!=='true');
  if(skipping)place();else hide();
  if(on){
   const box=visible(root.querySelector(BUBBLE)),next=box?`path(evenodd,"M0 0H${innerWidth}V${innerHeight}H0Z M${Math.round(box.left-4)} ${Math.round(box.top-4)}h${Math.round(box.width+8)}v${Math.round(box.height+8)}h${-Math.round(box.width+8)}Z")`:'';
   if(next!==cut){cut=next;layer.style.clipPath=next;}
  }
  if(skipping||on)frame=requestAnimationFrame(draw);
 }
 // Cheap while idle: the frame loop runs only while the tour is on; otherwise it is checked a few times a second.
 const poll=setInterval(()=>{if(!frame&&(skippable()||locked()))draw();else if(!frame)lock(false);},250);
 return {
  /** The Tutorial switch while a tour runs, else null. */
  get button(){return button.hidden?null:button;},
  refresh(){cancelAnimationFrame(frame);draw();},
  destroy(){destroyed=true;clearInterval(poll);cancelAnimationFrame(frame);lock(false);hide();layer.remove();button.remove();},
 };
}
