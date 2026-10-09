/**
 * The guided tour's spotlight (ui/onboarding/README.md#after-arrival-guided-tour-then-a-first-useful-task).
 * The World dims and one ringed box stays bright around what Fox is talking about; Fox and its
 * bubble stay bright too. While it shows, only the bubble's buttons respond: a click anywhere
 * else (blank space included), Enter, Space or → is `next`; a click inside the box is `act` when
 * the step asks the person to use what is boxed. There is no way out but the steps, the Tutorial
 * switch in the World's corner (tour-lock.ts) and Esc, for a step with `exit` (a replayed tour): the World, its Applets
 * and Fox's input take no clicks, focus or typing. Boxes follow their targets each frame.
 *
 * A coach mark is the quieter form for pages the host draws above the HTML (a website page can't
 * be dimmed): a small note beside one control, with a pulsing ring, that blocks nothing.
 */
export interface Box {x:number;y:number;width:number;height:number}
export interface SpotlightStep {
 /** The bright, ringed box, in viewport pixels; null dims everything but Fox. */
 target:()=>Box|null;
 /** A click outside the bubble, Enter, Space or →. Without it those do nothing. */
 next?:()=>void;
 /** A click inside the box: the person uses what is boxed (opens the item, presses the control). */
 act?:()=>void;
 /** Esc: leave the tour (a replay only; the first run leaves by turning the Tutorial switch off). */
 exit?:()=>void;
 /** Controls inside the box that keep working (the card's source links): cut out of the catcher like the bubble. */
 open?:string;
 /** The box is a framed surface of its own (Attention's card, whose paper art fills it): the light is
  * cut to its exact edge, with no margin, feathering or ring around it (owner feedback 2026-10-02, #1617). */
 flush?:boolean;
}
const PAD=10,RADIUS=22,FLUSH_RADIUS=26,BUBBLE='#companionDialogue',FOX='.companion-avatar',TAG='#companionDialogue .companion-topic',GUIDE_PAD=16,EARS=18;
const visible=(e:Element|null)=>{if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
const grow=(b:Box,pad:number)=>({x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad});
const union=(boxes:(Box|null)[])=>{const list=boxes.filter(Boolean) as Box[];if(!list.length)return null;
 const x=Math.min(...list.map(b=>b.x)),y=Math.min(...list.map(b=>b.y));
 return {x,y,width:Math.max(...list.map(b=>b.x+b.width))-x,height:Math.max(...list.map(b=>b.y+b.height))-y};};
const inside=(outer:Box,inner:Box)=>inner.x>=outer.x-1&&inner.y>=outer.y-1&&inner.x+inner.width<=outer.x+outer.width+1&&inner.y+inner.height<=outer.y+outer.height+1;
/** Fox, its ears, its bubble and the bubble's name tag: one lit area (owner feedback 2026-10-02). */
export function guideBox(root:ParentNode):Box|null {
 const fox=visible(root.querySelector(FOX));
 return union([fox&&{...fox,y:fox.y-EARS,height:fox.height+EARS},visible(root.querySelector(BUBBLE)),visible(root.querySelector(TAG))]);
}

/** An element's box, or null while it is hidden. */
export function elementBox(root:ParentNode,selector:string):Box|null {return visible(root.querySelector(selector));}

/** An Applet's painted device on the World canvas, in viewport pixels, or null when it is not drawn. */
export function appletBox(root:HTMLElement,id:string):Box|null {
 const module=((root as any).sceneMetrics?.modules||[]).find((m:any)=>m.id===id&&m.visible!==false);
 const bounds=module?.peekBounds,canvas=root.querySelector<HTMLElement>('[data-renderer="sim-dom"],canvas[data-renderer="pixi-webgl"]');
 if(!bounds||!canvas||!(bounds.width>0&&bounds.height>0))return null;
 const base=canvas.getBoundingClientRect(),sx=canvas.clientWidth?base.width/canvas.clientWidth:1,sy=canvas.clientHeight?base.height/canvas.clientHeight:1;
 return {x:base.left+bounds.x*sx,y:base.top+bounds.y*sy,width:bounds.width*sx,height:bounds.height*sy};
}

// The last box a spotlight showed on each World, so the next spotlight (the tour's second half
// takes over from its first) glides on from it instead of starting from the whole window.
const lastBox=new WeakMap<HTMLElement,{box:Box,at:number}>();
const HANDOVER=4000;

export function createTourSpotlight(root:HTMLElement){
 const svg='http://www.w3.org/2000/svg';
 const layer=document.createElement('div');layer.className='tour-spotlight';layer.hidden=true;layer.setAttribute('aria-hidden','true');
 const art=document.createElementNS(svg,'svg'),mask=document.createElementNS(svg,'mask'),field=document.createElementNS(svg,'rect'),shade=document.createElementNS(svg,'rect');
 const id='tour-spotlight-mask-'+Math.random().toString(36).slice(2);
 mask.id=id;field.setAttribute('fill','white');field.setAttribute('width','100%');field.setAttribute('height','100%');mask.append(field);
 shade.setAttribute('class','tour-spotlight-shade');shade.setAttribute('width','100%');shade.setAttribute('height','100%');shade.setAttribute('mask',`url(#${id})`);
 // Holes have soft, feathered edges rather than a hard cut.
 const soft=document.createElementNS(svg,'filter'),blur=document.createElementNS(svg,'feGaussianBlur');
 soft.id=id+'-soft';for(const [k,v] of Object.entries({x:'-50%',y:'-50%',width:'200%',height:'200%'}))soft.setAttribute(k,v);blur.setAttribute('stdDeviation','7');soft.append(blur);
 const defs=document.createElementNS(svg,'defs');defs.append(mask,soft);art.append(defs,shade);
 const ring=document.createElement('div');ring.className='tour-spotlight-ring';
 const guideRing=document.createElement('div');guideRing.className='tour-spotlight-ring is-guide';
 // Clicks land on the catcher, which has the bubble cut out so the bubble's buttons still work;
 // the shade above it only draws.
 const catcher=document.createElement('div');catcher.className='tour-spotlight-catcher';
 layer.append(catcher,art,guideRing,ring);document.body.append(layer);
 let step:SpotlightStep|null=null,frame=0,drawn='',shown:Box|null=null,from:Box|null=null,began=0;
 const MOVE=600,still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const holes:SVGRectElement[]=[];
 function hole(i:number,box:Box|null,radius:number){
  let rect=holes[i];if(!rect){rect=document.createElementNS(svg,'rect');rect.setAttribute('fill','black');rect.setAttribute('filter',`url(#${id}-soft)`);mask.append(rect);holes[i]=rect;}
  rect.style.display=box?'':'none';
  if(i===0)rect.setAttribute('filter',step?.flush?'':`url(#${id}-soft)`);
  if(box)for(const [k,v] of Object.entries({x:box.x,y:box.y,width:box.width,height:box.height,rx:radius}))rect.setAttribute(k,String(Math.round(v)));
 }
 function draw(){
  frame=0;if(!step)return;
  const target=step.target();let focus=target&&grow(target,step.flush?0:PAD);
  // Like a camera, the box glides from the last one (or the whole window) to the new target.
  if(focus&&from){
   const t=Math.min(1,(performance.now()-began)/MOVE),e=1-(1-t)**3,mix=(a:number,b:number)=>a+(b-a)*e;
   focus={x:mix(from.x,focus.x),y:mix(from.y,focus.y),width:mix(from.width,focus.width),height:mix(from.height,focus.height)};
   if(t>=1)from=null;
  }
  shown=focus;
  const bubble=visible(root.querySelector(BUBBLE)),guided=guideBox(root),guide=guided&&grow(guided,GUIDE_PAD);
  // What Fox shows inside its own area (Fox itself) needs no second box.
  const lit=focus&&!(guide&&inside(guide,focus))?focus:null;
  const key=JSON.stringify([lit,guide,bubble,openBoxes(),innerWidth,innerHeight]);
  if(key!==drawn){
   drawn=key;
   hole(0,lit&&(step.flush?lit:grow(lit,4)),step.flush?FLUSH_RADIUS:RADIUS);hole(1,guide&&grow(guide,4),32);
   ring.hidden=!lit||!!step.flush;guideRing.hidden=!guide;
   if(lit)Object.assign(ring.style,{left:lit.x+'px',top:lit.y+'px',width:lit.width+'px',height:lit.height+'px'});
   if(guide)Object.assign(guideRing.style,{left:guide.x+'px',top:guide.y+'px',width:guide.width+'px',height:guide.height+'px'});
   // The bubble is cut out of the layer itself, so its buttons take clicks; nothing else does.
   const cut=[bubble&&grow(bubble,4),...openBoxes()].filter(Boolean) as Box[];
   catcher.style.clipPath=cut.length?`path(evenodd,"M0 0H${innerWidth}V${innerHeight}H0Z${cut.map(b=>` M${Math.round(b.x)} ${Math.round(b.y)}h${Math.round(b.width)}v${Math.round(b.height)}h${-Math.round(b.width)}Z`).join('')}")`:'';
  }
  frame=requestAnimationFrame(draw);
 }
 const openBoxes=()=>step?.open?[...root.querySelectorAll(step.open)].map(visible).filter(Boolean) as Box[]:[];
 // The tour's Tutorial switch (tour-lock.ts) sits above the layer in the World's corner and keeps its keyboard too.
 const inBubble=(node:EventTarget|null)=>node instanceof Node&&(!!root.querySelector(BUBBLE)?.contains(node)||node instanceof Element&&!!node.closest('.tour-switch')||!!step?.open&&node instanceof Element&&!!node.closest(step.open));
 catcher.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();if(!step)return;
  const box=shown,inside=!!box&&event.clientX>=box.x&&event.clientX<=box.x+box.width&&event.clientY>=box.y&&event.clientY<=box.y+box.height;
  if(inside&&step.act)step.act();else step.next?.();
 });
 layer.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
 layer.addEventListener('contextmenu',event=>event.preventDefault());
 function keydown(event:KeyboardEvent){
  if(!step)return;
  // The bubble's own buttons keep the keyboard (Tab between them, Enter on one).
  if(event.key!=='Escape'&&inBubble(event.target)&&(['Tab','Enter',' '].includes(event.key)||event.target instanceof HTMLInputElement))return;
  if(event.key==='Tab'){event.preventDefault();root.querySelector<HTMLElement>(BUBBLE+' button')?.focus();return;}
  event.preventDefault();event.stopPropagation();
  if(event.key==='Escape')step.exit?.();
  else if(['Enter',' ','ArrowRight'].includes(event.key))step.next?.();
 }
 // Focus that lands outside the bubble (a click before the layer, a shortcut) is taken back.
 function focusin(event:FocusEvent){if(step&&!inBubble(event.target)&&event.target instanceof HTMLElement&&!layer.contains(event.target))event.target.blur();}
 return {
  get active(){return !!step;},
  show(next:SpotlightStep){
   const first=!step;step=next;drawn='';
   const handed=lastBox.get(root),recent=handed&&Date.now()-handed.at<HANDOVER?handed.box:null;
   from=still()?null:shown??recent??{x:0,y:0,width:innerWidth,height:innerHeight};began=performance.now();
   if(first){
    layer.hidden=false;root.dataset.tourSpotlight='true';
    window.addEventListener('keydown',keydown,true);window.addEventListener('focusin',focusin,true);
    const typing=document.activeElement;if(typing instanceof HTMLElement&&!inBubble(typing))typing.blur();
   }
   cancelAnimationFrame(frame);draw();
  },
  hide(){
   if(!step)return;if(shown)lastBox.set(root,{box:shown,at:Date.now()});step=null;shown=from=null;cancelAnimationFrame(frame);frame=0;layer.hidden=true;delete root.dataset.tourSpotlight;
   window.removeEventListener('keydown',keydown,true);window.removeEventListener('focusin',focusin,true);
  },
  destroy(){this.hide();layer.remove();},
 };
}

/** A note beside one control the person may use now, with a pulsing ring; it blocks nothing. */
export function createCoachMark(){
 const note=document.createElement('div');note.className='tour-coach';note.hidden=true;note.setAttribute('role','status');
 const ring=document.createElement('div');ring.className='tour-coach-ring';ring.hidden=true;
 document.body.append(ring,note);
 let target:Element|null=null,frame=0;
 function place(){
  frame=0;const box=target&&visible(target);
  if(!box){note.hidden=ring.hidden=true;frame=requestAnimationFrame(place);return;}
  note.hidden=ring.hidden=false;
  Object.assign(ring.style,{left:box.x-6+'px',top:box.y-6+'px',width:box.width+12+'px',height:box.height+12+'px'});
  // Beside the control where there is room (the companion lane next to the Applet bar), else
  // above it (the task window sits at the World's bottom-right), never over the page itself.
  // A website page is drawn by the host above all HTML, so a note reaching into it loses its lower
  // half (owner feedback 2026-10-02): beside the control it widens to fit above the page's top edge.
  const page=visible(document.querySelector('.browser-viewport'));
  const gap=14;let x=box.x+box.width+gap;
  note.style.maxWidth=page&&page.y>box.y?Math.max(260,Math.min(560,innerWidth-12-x))+'px':'';
  const w=note.offsetWidth,h=note.offsetHeight;
  let y=box.y;
  if(x+w>innerWidth-12){x=Math.max(12,Math.min(box.x+box.width-w,innerWidth-12-w));y=box.y-h-gap;}
  if(y<12)y=box.y+box.height+gap;
  if(page&&x<page.x+page.width&&x+w>page.x&&y<page.y+page.height&&y+h>page.y)y=Math.max(4,Math.min(y,page.y-h-4));
  Object.assign(note.style,{left:Math.round(x)+'px',top:Math.round(y)+'px'});
  frame=requestAnimationFrame(place);
 }
 return {
  get target(){return target;},
  show(next:Element,text:string){
   if(note.textContent!==text)note.textContent=text;
   if(target===next)return;target=next;cancelAnimationFrame(frame);place();
  },
  hide(){target=null;cancelAnimationFrame(frame);frame=0;note.hidden=ring.hidden=true;},
  destroy(){this.hide();note.remove();ring.remove();},
 };
}
