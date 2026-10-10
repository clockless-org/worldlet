import {WORLD_WIDTH,WORLD_HEIGHT} from '../world-design.ts';
import {THEME_WORLD} from '../world-layout.ts';
import {ROOM_FOREGROUND} from './village-pack.ts';
// Placement coordinates cover the full plate; overview is only its inner frame.
export const WORLD_EXTENT={x:0,y:0,width:WORLD_WIDTH,height:WORLD_HEIGHT};
export const WORLD_OVERVIEW=THEME_WORLD.camera.overview;
export const OVERVIEW_CENTER=[WORLD_OVERVIEW[0]+WORLD_OVERVIEW[2]/2,WORLD_OVERVIEW[1]+WORLD_OVERVIEW[3]/2];
export function villageCamera(width:number,height:number,zoom:number,anchor:number[]){
 const base=Math.max(width/(WORLD_WIDTH*WORLD_OVERVIEW[2]),height/(WORLD_HEIGHT*WORLD_OVERVIEW[3]));
 const scale=base*Math.max(1,zoom);
 const w=WORLD_WIDTH*scale,h=WORLD_HEIGHT*scale;
 const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
 const x=clamp(width*.5-anchor[0]*w,width-w,0);
 const y=clamp(height*.5-anchor[1]*h,height-h,0);
 // The opened Applet stands where the theme's room layout puts it (Village: right of centre).
 const [fx,fy]=ROOM_FOREGROUND;
 return {scale,x,y,left:0,foregroundX:width*fx,foregroundY:height*fy};
}

// Interpolate the projected camera, not zoom and world anchor independently.
// A straight path between two covered views stays covered and cannot overshoot.
export function approachVillageCamera(current:ReturnType<typeof villageCamera>|null,target:ReturnType<typeof villageCamera>,amount:number){
 if(!current)return target;
 const t=Math.max(0,Math.min(1,amount));
 return {...target,scale:current.scale+(target.scale-current.scale)*t,x:current.x+(target.x-current.x)*t,y:current.y+(target.y-current.y)*t};
}

/** Frame a dimensional area with its props above their ground anchors and HUD breathing room. */
export function areaCameraFrame(id:string,width:number,height:number){
 const area=THEME_WORLD.areas.find(a=>a.id===id||a.legacyIds.includes(id));
 if(!area)return {zoom:1,anchor:OVERVIEW_CENTER};
 const [x,y,w,h]=area.bounds;
 const left=Math.min(x,...area.slots.map(s=>s.anchor[0]-s.maxSize[0]/2));
 const top=Math.min(y,...area.slots.map(s=>s.anchor[1]-s.maxSize[1]));
 const right=Math.max(x+w,...area.slots.map(s=>s.anchor[0]+s.maxSize[0]/2));
 const bottom=Math.max(y+h,area.label[1]+.02);
 const base=villageCamera(width,height,1,OVERVIEW_CENTER).scale;
 const fit=Math.min(width*.68/((right-left)*WORLD_WIDTH),height*.55/((bottom-top)*WORLD_HEIGHT))/base;
 return {zoom:Math.max(1.25,Math.min(3,fit)),anchor:[(left+right)/2,(top+bottom)/2]};
}
