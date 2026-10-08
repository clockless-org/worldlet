/**
 * Until the first-run tour is over, only the tour responds (owner request 2026-10-04,
 * ui/onboarding/README.md#after-arrival-guided-tour-then-a-first-useful-task).
 *
 * - The lock: whenever the World is in front and no spotlight is up (Fox still reading, Fox busy, a
 *   step between boxes), a clear layer takes every click, wheel, key and focus outside Fox's bubble,
 *   so nothing in the World, the corner controls or Fox's input responds. It draws nothing.
 * - **Tutorial**, a switch in the World's top-right corner under the sound line (owner Order
 *   2026-10-07; Settings beside Fox now opens Settings directly). Off, it reopens the tour; on, it is the
 *   one way out of the first run, and a replayed tour uses it too. While the tour runs, the lock's own
 *   copy of the switch, turned on, stands exactly over the corner's and stays above the spotlight and the
 *   lock; without a corner (a World without its date and weather line) it stands in the window's top-right.
 */
import {uiIcon} from '../components/index.ts';
const BUBBLE='#companionDialogue',CORNER='.world-environment',GAP=8,EDGE=12;
const visible=(e:Element|null)=>{if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0?r:null;};
function tutorialSwitch(className:string,on:boolean){
 const b=document.createElement('button');b.type='button';b.className=className+' tutorial-switch';b.setAttribute('role','switch');b.setAttribute('aria-checked',String(on));
 b.innerHTML=uiIcon('bulb')+'<span class="tutorial-switch-label">Tutorial</span><span class="tutorial-switch-track" aria-hidden="true"><i></i></span>';
 b.addEventListener('pointerdown',event=>event.stopPropagation());
 return b;
}
export function createTourLock(root:HTMLElement,{locked,skippable,offered,turnOn,turnOff}:{locked:()=>boolean,skippable:()=>boolean,offered:()=>boolean,turnOn:()=>void,turnOff:()=>void}){
 const layer=document.createElement('div');layer.className='tour-lock';layer.hidden=true;layer.setAttribute('aria-hidden','true');
 // The corner's switch, off: it turns the tutorial on (a replay) once the first run is over.
 const corner=tutorialSwitch('world-tutorial',false);corner.hidden=true;
 corner.onclick=event=>{event.preventDefault();event.stopPropagation();turnOn();};
 // The tour's switch, on: it turns the tutorial off (Skip) while the tour runs.
 const button=tutorialSwitch('tour-switch',true);button.hidden=true;
 button.onclick=event=>{event.preventDefault();event.stopPropagation();turnOff();};
 document.body.append(layer,button);
 const attach=()=>{if(corner.isConnected)return;const parent=root.querySelector(CORNER);if(parent)parent.append(corner);};
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
 // The corner keeps its place while the tour runs (hidden under the tour's copy), so the switch never jumps.
 function syncCorner(skipping:boolean){attach();const show=skipping||offered();if(corner.hidden===show)corner.hidden=!show;}
 // Over the corner's own switch; without one, in the window's top-right.
 function place(){
  if(button.hidden){button.hidden=false;root.dataset.tourSkippable='true';}
  const own=visible(corner),w=button.offsetWidth,h=button.offsetHeight;
  // It wears the corner's colours, so the switch only flips when the tour starts and ends.
  if(own){const look=getComputedStyle(corner);if(button.style.color!==look.color)button.style.color=look.color;if(button.style.textShadow!==look.textShadow)button.style.textShadow=look.textShadow;}
  const x=own?own.right-w:innerWidth-EDGE-w,y=own?own.top+(own.height-h)/2:EDGE+GAP;
  button.style.transform=`translate(${Math.round(Math.max(EDGE,x))}px,${Math.round(Math.max(EDGE,Math.min(innerHeight-EDGE-h,y)))}px)`;
 }
 const hide=()=>{if(!button.hidden){button.hidden=true;delete root.dataset.tourSkippable;}};
 function draw(){
  frame=0;if(destroyed)return;
  const skipping=skippable();
  // A spotlight takes the clicks itself; the lock covers the moments between.
  lock(locked()&&root.dataset.tourSpotlight!=='true');
  syncCorner(skipping);
  if(skipping)place();else hide();
  if(on){
   const box=visible(root.querySelector(BUBBLE)),next=box?`path(evenodd,"M0 0H${innerWidth}V${innerHeight}H0Z M${Math.round(box.left-4)} ${Math.round(box.top-4)}h${Math.round(box.width+8)}v${Math.round(box.height+8)}h${-Math.round(box.width+8)}Z")`:'';
   if(next!==cut){cut=next;layer.style.clipPath=next;}
  }
  if(skipping||on)frame=requestAnimationFrame(draw);
 }
 // Cheap while idle: the frame loop runs only while the tour is on; the corner is checked a few times a second.
 const poll=setInterval(()=>{if(!frame&&(skippable()||locked()))draw();else if(!frame){lock(false);syncCorner(false);}},250);
 return {
  /** The Tutorial switch in sight: the tour's copy while the tour runs, else the corner's own. */
  get button(){return button.hidden?corner:button;},
  refresh(){cancelAnimationFrame(frame);draw();},
  destroy(){destroyed=true;clearInterval(poll);cancelAnimationFrame(frame);lock(false);hide();layer.remove();button.remove();corner.remove();},
 };
}
