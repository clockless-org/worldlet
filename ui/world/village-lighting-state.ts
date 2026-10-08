import {environmentPresentation} from './environment-presentation.ts';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const safe=(v:any,f:number)=>Number.isFinite(v)?v:f;
const smooth=(v:number)=>{v=clamp(v);return v*v*(3-2*v);};
export function villageLightingState(environment:any={}){
 const daylight=clamp(safe(environment.daylight,1)),progress=clamp(safe(environment.progress,.5));
 const kind=environment.kind||'unknown',cloud=clamp(safe(environment.cloud,0));
 const rain=kind==='rain'||kind==='storm'?1:0,snow=kind==='snow'?1:0;
 // Weather is an atmospheric detail, not a global exposure control. The painted
 // world follows the sun only: clouds and precipitation must never darken it.
 const night=1-daylight,twilight=4*daylight*night;
 const warmth=twilight*(progress<.5?.65:1);
 const rgb=[.34+.66*daylight,.43+.57*daylight,.60+.40*daylight];
 rgb[0]+=warmth*.08;rgb[1]-=warmth*.065;rgb[2]-=warmth*.13;
 const lamps=smooth((.8-daylight)/.75);
 const celestial=environmentPresentation({...environment,daylight,progress});
 return {daylight,progress,night,twilight,warmth,cloud,rgb,lamps,rain,snow,smoke:daylight>.9,
  fog:kind==='fog'?1:0,wet:rain,sunVisibility:daylight,
  moonVisibility:night,stars:night*night,celestial,
  wind:Math.max(0,Math.min(80,safe(environment.wind,0))),windFrom:safe(environment.windFrom,270),
  phase:daylight<.15?'night':daylight>.9?'day':progress<.5?'morning':'dusk'};
}
