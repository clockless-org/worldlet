import {frameClock} from './sprite-frames.ts';
import type {FrameAppletMotion} from '../../contracts/world.ts';
// DOM presentation uses the same authored poses and state clock as Pixi.
export function animateFrameImage(image:HTMLImageElement,spec:FrameAppletMotion,frames:string[],working:()=>boolean,disabled:()=>boolean=()=>false){
 const clock=frameClock(spec),reduced=matchMedia('(prefers-reduced-motion: reduce)');let raf=0,timer:ReturnType<typeof setTimeout>|undefined,last=0,index=-1,closed=false,visible=false;
 const preload=frames.map(src=>{const i=new Image();i.src=src;return i;});
 function tick(now:number){if(closed)return;const dt=last?(now-last)/1000:0;last=now;
  if(!image.hidden&&image.isConnected){if(!visible)clock.update(0,false,false,true);visible=true;const frame=clock.update(dt,true,working(),reduced.matches||disabled());if(frame!==index&&preload[frame].complete){index=frame;image.src=frames[frame];image.dataset.motionFrame=String(frame);}}
  if(image.hidden||!image.isConnected)visible=false;
  // A hidden image (the usual case) looks again four times a second instead of every frame.
  if(visible)raf=requestAnimationFrame(tick);else{last=0;timer=setTimeout(()=>{raf=requestAnimationFrame(tick);},250);}
 }raf=requestAnimationFrame(tick);return ()=>{closed=true;cancelAnimationFrame(raf);clearTimeout(timer);};
}
