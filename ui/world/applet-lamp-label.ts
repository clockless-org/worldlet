import {lampLabels,type LampSignal} from './applet-lamp.ts';

type LampBox={x:number;bottom:number;width:number;height:number};
type Label=ReturnType<typeof createLampLabel>;
const labelsByRoot=new WeakMap<HTMLElement,Set<Label>>();
const STACK_GAP=6,STACK_MIN_TOP=8;

/** Neighbouring devices (Mail and Calendar share Home) anchor their notices a few
 * dozen pixels apart, closer than a notice is wide. Each notice keeps its own action,
 * so they are stacked, never merged or drawn over each other. Boxes are anchored at
 * their bottom centre; the lowest keeps its place and each later one rises above
 * whatever it would cover, or drops below when there is no room above. Returns the
 * resolved bottom edge for every box, in input order. */
export function stackLampBoxes(boxes:LampBox[],gap=STACK_GAP,minTop=STACK_MIN_TOP):number[]{
 const order=boxes.map((_,i)=>i).sort((a,b)=>boxes[b].bottom-boxes[a].bottom||boxes[a].x-boxes[b].x||a-b);
 const placed:{left:number;right:number;top:number;bottom:number}[]=[],bottoms=boxes.map(b=>b.bottom);
 const collide=(left:number,right:number,top:number,bottom:number)=>placed.find(p=>left<p.right&&right>p.left&&top<p.bottom+gap&&bottom>p.top-gap);
 for(const i of order){
  const {x,width,height}=boxes[i],left=x-width/2,right=x+width/2;
  let bottom=boxes[i].bottom,hit;
  for(let n=0;n<=placed.length&&(hit=collide(left,right,bottom-height,bottom));n++)bottom=hit.top-gap;
  if(bottom-height<minTop){
   bottom=boxes[i].bottom;
   for(let n=0;n<=placed.length&&(hit=collide(left,right,bottom-height,bottom));n++)bottom=hit.bottom+gap+height;
  }
  bottoms[i]=bottom;placed.push({left,right,top:bottom-height,bottom});
 }
 return bottoms;
}

/** Resolve overlaps between every visible over-world notice on this root, including
 * copies drawn over HTML device artwork. Sizes are measured only when a notice's
 * content changes, so a moving camera costs style writes, not layout reads. */
export function stackLampLabels(root:HTMLElement){
 const labels=[...(labelsByRoot.get(root)||[])].filter(label=>label.anchor&&!label.element.hidden);
 if(!labels.length)return;
 const boxes=labels.map(label=>({x:label.anchor.left,bottom:label.anchor.top,...label.size()}));
 const bottoms=labels.length>1?stackLampBoxes(boxes):boxes.map(b=>b.bottom);
 labels.forEach((label,i)=>label.shift(bottoms[i]-boxes[i].bottom));
}

/** Shared non-color status/action for projected devices and HTML artwork copies.
 * Keep the same node while snapshots change so keyboard focus is not discarded. */
export function createLampLabel(root:HTMLElement,key:string){
 const element=document.createElement('div');element.className='applet-lamp-label';element.dataset.applet=key;element.hidden=true;
 const mark=document.createElement('span');mark.className='applet-lamp-exclamation';mark.textContent='!';mark.setAttribute('aria-hidden','true');
 const copy=document.createElement('span'),action=document.createElement('button');action.type='button';
 element.append(mark,copy,action);root.append(element);
 let current:LampSignal,offset=0,measured='',box={width:0,height:0};
 action.onclick=e=>{e.stopPropagation();current?.action?.run();};
 element.addEventListener('pointerdown',e=>e.stopPropagation());
 const place=(top:number)=>{const value=top+'px';if(element.style.top!==value)element.style.top=value;};
 const label={element,
  /** Unstacked position of a visible, over-world notice; null when hidden or foreground. */
  anchor:null as null|{left:number;top:number},
  size(){const key=element.dataset.state+'\u0000'+element.textContent+'\u0000'+root.clientWidth;if(measured!==key){measured=key;box={width:element.offsetWidth,height:element.offsetHeight};}return box;},
  shift(value:number){if(!label.anchor||value===offset)return;offset=value;place(label.anchor.top+offset);},
  update(signal:LampSignal,title:string,visible:boolean,x:number,y:number,foreground=false){
  current=signal;const alert=signal.state==='error';
  // Work in progress has no notice of its own: the lamp breathes and the world log says
  // what is happening ("Reading Mail…"). Only a failure with something to do gets one.
  const hidden=!visible||!alert;if(element.hidden!==hidden)element.hidden=hidden;
  if(hidden){label.anchor=null;offset=0;return;}
  if(element.dataset.state!==signal.state)element.dataset.state=signal.state;
  if(element.dataset.foreground!==String(foreground))element.dataset.foreground=String(foreground);
  const text=lampLabels[signal.state];if(copy.textContent!==text)copy.textContent=text;
  if(mark.hidden===alert)mark.hidden=!alert;if(action.hidden===!!signal.action)action.hidden=!signal.action;
  const actionText=signal.action?.label||'';if(action.textContent!==actionText)action.textContent=actionText;
  const accessible=title+': '+text+(signal.action?'. '+signal.action.label:'');
  if(action.getAttribute('aria-label')!==accessible)action.setAttribute('aria-label',accessible);
  if(element.getAttribute('aria-label')!==accessible)element.setAttribute('aria-label',accessible);
  const width=root.clientWidth,left=Math.max(90,Math.min(foreground&&width<=600?90:x,width-90)),top=Math.max(foreground?55:90,y);
  if(element.style.left!==left+'px')element.style.left=left+'px';
  // The foreground notice sits alone at the top of Open/Focus and is never stacked.
  if(foreground){label.anchor=null;offset=0;}else label.anchor={left,top};
  place(top+offset);
 },destroy(){element.remove();labelsByRoot.get(root)?.delete(label);}};
 if(!labelsByRoot.has(root))labelsByRoot.set(root,new Set());
 labelsByRoot.get(root).add(label);
 return label;
}
