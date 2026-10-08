import {isDesktopCompanion} from './world-surface.ts';
// A single anchor for the lower Companion cluster. No world/content transforms.
export function companionPosition(root:HTMLElement,hud:HTMLElement,avatar:HTMLElement){
 let anchor:number[]|null=null,offset=[0,0],start:number[]|null=null,frame=0;
 try{const p=JSON.parse(localStorage.getItem('worldlet.companion.position')||'null');if(Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1))anchor=p;}catch{}
 const reading=()=>root.dataset.detailOpen==='true'||root.dataset.depth==='object';
 function apply(){
  if(isDesktopCompanion())return;
  // Reader mode owns a reserved lane. Restore the user's world anchor on exit.
  if(reading()){offset=[0,0];hud.style.translate='';delete hud.dataset.positioned;const dialogue=hud.querySelector<HTMLElement>('.companion-dialogue');if(dialogue)dialogue.style.translate='';return;}
  if(!anchor)return;
  const r=root.getBoundingClientRect(),a=avatar.getBoundingClientRect();
  const x=Math.max(r.left+80,Math.min(r.right-80,r.left+anchor[0]*r.width));
  // Fox may sit lower than its usual place, but never so low that the message bar and its buttons under it
  // leave the window (owner Order 2026-10-08: dragged down, the bar was cut off at the bottom edge).
  const below=Math.max(0,...[...hud.querySelectorAll<HTMLElement>('.companion-text-entry,#notionCommand,.companion-controls')].filter(e=>!e.hidden&&e.getClientRects().length).map(e=>e.getBoundingClientRect().bottom))-(a.top+a.height/2);
  const y=Math.max(r.top+170,Math.min(r.bottom-Math.max(100,below+16),r.top+anchor[1]*r.height));
  const scale=r.width/(root.clientWidth||r.width);
  offset=[offset[0]+(x-(a.left+a.width/2))/scale,offset[1]+(y-(a.top+a.height/2))/scale];
  hud.style.translate=offset.map(v=>v+'px').join(' ');hud.dataset.positioned='true';
  for(const dialogue of hud.querySelectorAll<HTMLElement>('.companion-dialogue,#notionCommand'))if(!dialogue.hidden){
   dialogue.style.translate='0px';
   const d=dialogue.getBoundingClientRect();
   const correction=d.left<r.left+12?r.left+12-d.left:d.right>r.right-12?r.right-12-d.right:0;
   dialogue.style.translate=correction/scale+'px';
  }
 }
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(apply);};
 new ResizeObserver(schedule).observe(root);
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-depth','data-detail-open']});
 window.addEventListener('worldlet:desktop-companion',schedule);
 hud.addEventListener('transitionend',schedule);
 new MutationObserver(schedule).observe(hud,{subtree:true,attributes:true,attributeFilter:['hidden']});
 schedule();
 return {start(x:number,y:number){const a=avatar.getBoundingClientRect();start=[x,y,a.left+a.width/2,a.top+a.height/2];},move(x:number,y:number){if(!start)return;const r=root.getBoundingClientRect();anchor=[(start[2]+x-start[0]-r.left)/r.width,(start[3]+y-start[1]-r.top)/r.height];apply();},end(){start=null;if(anchor){anchor=anchor.map(v=>Math.min(1,Math.max(0,v)));try{localStorage.setItem('worldlet.companion.position',JSON.stringify(anchor));}catch{}}}};
}
