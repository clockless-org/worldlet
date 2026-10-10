// Entering an Applet zooms in and leaving it zooms out (owner Order 2026-10-07: 「Applet到Area 然后到我们的World 这个进出
//都要有一个放大缩小的效果」). Opening and closing an area panel already zooms the World's camera (pixi-world.ts frameArea);
// this is the step below it. The renderer hands over a picture of what was on screen just before the move: going in, the
// World swells toward the point the Applet came from (the device, or the area panel's row) and dissolves while the Applet's
// own surface grows out of that point; coming out, the Applet's room shrinks back into that point while the World settles
// from slightly zoomed in. Short (a third of a second), never blocks input (the veil takes no pointer events and every
// navigation applies at once), and nothing moves under reduced motion.
export type ZoomDirection='in'|'out';
export type ZoomPoint={x:number;y:number};
export const LEVEL_ZOOM_MS=300;
// A pointer press this recent is what started the move, so the zoom starts where the person clicked.
const POINTER_FRESH_MS=1200;

export function createLevelZoom(shell:HTMLElement,host:HTMLElement){
 let pointer={x:0,y:0,at:-Infinity};
 const remember=(event:PointerEvent)=>{pointer={x:event.clientX,y:event.clientY,at:performance.now()};};
 document.addEventListener('pointerdown',remember,true);
 // Where each Applet was entered from, so leaving it shrinks back to the same place.
 const entries=new Map<string,ZoomPoint>();
 let running:{veil:HTMLElement;animations:Animation[];frame:number}|null=null,count=0,last:ZoomDirection|null=null;
 const finish=()=>{if(!running)return;cancelAnimationFrame(running.frame);for(const a of running.animations)a.cancel();running.veil.remove();for(const c of running.veil.querySelectorAll('canvas'))c.width=c.height=0;running=null;};
 const recentPointer=():ZoomPoint|null=>performance.now()-pointer.at<POINTER_FRESH_MS?{x:pointer.x,y:pointer.y}:null;
 const visible=(el:Element)=>{const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&!(el as HTMLElement).hidden;};
 // The Applet's own surfaces: its stage panels and the reader, never the World canvas, the pins or the veil itself.
 // A website panel never grows either: the host places its native page at the panel's rect as measured, and a
 // transform ends without a resize, so a page placed mid-zoom stayed at 60% of the panel (owner Order 2026-10-08).
 const surfaces=()=>[...host.children,shell.querySelector('#notionContent')].filter((el):el is HTMLElement=>!!el&&el instanceof HTMLElement&&!(el instanceof HTMLCanvasElement)&&el.id!=='notionPins'&&!el.classList.contains('world-level-zoom')&&!el.classList.contains('ui-theme-world-scene')&&el.dataset.template!=='browser'&&visible(el));
 function run(direction:ZoomDirection,picture:HTMLCanvasElement,origin:ZoomPoint,{settle}:{settle:()=>boolean}){
  finish();count++;last=direction;
  const shellRect=shell.getBoundingClientRect(),rect=host.getBoundingClientRect();
  const veil=document.createElement('div');veil.className='world-level-zoom';veil.dataset.direction=direction;veil.setAttribute('aria-hidden','true');
  Object.assign(veil.style,{position:'absolute',left:rect.left-shellRect.left+'px',top:rect.top-shellRect.top+'px',width:rect.width+'px',height:rect.height+'px',zIndex:'35',pointerEvents:'none',overflow:'hidden',contain:'strict'});
  Object.assign(picture.style,{width:'100%',height:'100%',display:'block'});veil.append(picture);
  // Inserted at once, so the frame that first shows the new level is still covered by the old one.
  shell.append(veil);
  const at=(el:Element)=>{const r=el.getBoundingClientRect();return `${origin.x-r.left}px ${origin.y-r.top}px`;};
  const state={veil,animations:[] as Animation[],frame:0};running=state;
  state.frame=requestAnimationFrame(()=>{
   if(running!==state)return;
   const timing={duration:LEVEL_ZOOM_MS,easing:'cubic-bezier(.3,.6,.2,1)',fill:'none' as const};
   const veilOrigin=at(veil);
   if(direction==='in'){
    state.animations.push(veil.animate([{transformOrigin:veilOrigin,scale:'1',opacity:1},{transformOrigin:veilOrigin,scale:'2.4',opacity:0}],{...timing,easing:'cubic-bezier(.5,0,.75,.6)'}));
    for(const el of surfaces()){const o=at(el);state.animations.push(el.animate([{transformOrigin:o,scale:'.6',opacity:0},{transformOrigin:o,scale:'1',opacity:1}],timing));}
   }else{
    state.animations.push(veil.animate([{transformOrigin:veilOrigin,scale:'1',opacity:1,offset:0},{opacity:.9,offset:.35},{transformOrigin:veilOrigin,scale:'.08',opacity:0}],timing));
    // The World settles from slightly zoomed in, unless the camera itself is already zooming into an area panel.
    if(settle()){const o=at(host);state.animations.push(host.animate([{transformOrigin:o,scale:'1.3'},{transformOrigin:o,scale:'1'}],timing));}
   }
   const ending=state.animations[0];if(!ending){finish();return;}
   ending.finished.then(()=>{if(running===state)finish();},()=>{});
  });
 }
 return {
  /** The point a move into `id` starts from: the press that started it, else the device, else the middle. */
  enter(id:string,device:ZoomPoint|null){const point=recentPointer()||device||center();entries.set(id,point);return point;},
  /** The point leaving `id` shrinks back to: where it was entered from, else its device, else the middle. */
  leave(id:string,device:ZoomPoint|null){return entries.get(id)||device||center();},
  run,finish,
  get metrics(){return {running:!!running,direction:running?last:null,count,last};},
  dispose(){finish();document.removeEventListener('pointerdown',remember,true);}
 };
 function center(){const r=host.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
}
