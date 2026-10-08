import type {FrameAppletMotion} from '../../contracts/world.ts';

// One clock for authored frames. Hover/open is a pose, activity is a loop.
// Reverse on exit; reduced motion is always the authored neutral frame.
export function frameClock(spec:FrameAppletMotion){
 let position=0,clock=0;
 return {update(dt:number,engaged:boolean,working:boolean,reduced:boolean){
  if(reduced){position=clock=0;return 0;}
  const step=Math.min(.1,Math.max(0,dt))*spec.fps;
  if(working||spec.ambient){clock+=step*(working?1:.35);const period=2*(spec.frames-1);position=(clock%period);if(position>spec.frames-1)position=period-position;}
  else position=Math.max(0,Math.min(spec.frames-1,position+(engaged?step:-step)));
  return Math.round(position);
 }};
}
