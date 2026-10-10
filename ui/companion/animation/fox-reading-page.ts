import definition from '../../../resources/styles/builtin/drafts/fox-states-v1/reading-rig.json' with {type:'json'};
import type {RigPoint} from './fox-anatomy.ts';
import {smoother as ease} from './fox-skeleton.ts';
export function readingPagePhase(t:number,reduced=false){
 const phase=((t%9000)+9000)%9000;
 if(reduced)return {reach:0,progress:0,returning:0,opacity:0,contact:false};
 return {reach:ease((phase-4300)/600),progress:ease((phase-4900)/1600),returning:ease((phase-5300)/800),opacity:ease((phase-4820)/80)*(1-ease((phase-6450)/150)),contact:phase>=4900&&phase<=5300};
}
/** A hinged curved page: source corner is also the paw contact target. */
export function readingPagePoint([x,y]:RigPoint,t:number,reduced=false):RigPoint{
 const {progress}=readingPagePhase(t,reduced),{sourcePivot,pivot,scale}=definition.page;
 return [pivot[0]+(x-sourcePivot[0])*scale[0]*Math.cos(progress*Math.PI),pivot[1]+(y-sourcePivot[1])*scale[1]-.03*Math.sin(progress*Math.PI)];
}
export function readingPageHandTarget(t:number,reduced=false):RigPoint{
 const phase=readingPagePhase(t,reduced),grip=definition.turnArm.restGrip,corner=definition.page.sourceCorner as [number,number];
 // Lift the corner, then release while it is still on the near side. Following
 // the leaf across the spine with this planar rig reverses the elbow toward
 // the throat. The page continues independently as the paw returns outside.
 const target=readingPagePoint(corner,t,reduced),weight=phase.reach*(1-phase.returning);
 // Return around the outside of the shoulder, not straight through it. The
 // direct chord passes too close to the IK origin and swings the elbow across
 // the throat. A smooth outward arc vanishes at both release/settlement ends.
 const arc=Math.sin(Math.PI*phase.returning)*phase.reach;
 return [grip[0]+(target[0]-grip[0])*weight+.11*arc,grip[1]+(target[1]-grip[1])*weight+.02*arc];
}
export function solveReadingArm(shoulder:RigPoint,elbow:RigPoint,grip:RigPoint,target:RigPoint,bendSide:1|-1=1){
 const l1=Math.hypot(elbow[0]-shoulder[0],elbow[1]-shoulder[1]),l2=Math.hypot(grip[0]-elbow[0],grip[1]-elbow[1]);
 const dx=target[0]-shoulder[0],dy=target[1]-shoulder[1],raw=Math.hypot(dx,dy),d=Math.max(Math.abs(l1-l2)+1e-7,Math.min(l1+l2-1e-7,raw));
 const sign=(Math.sign((elbow[0]-shoulder[0])*(grip[1]-elbow[1])-(elbow[1]-shoulder[1])*(grip[0]-elbow[0]))||1)*bendSide;
 const bend=sign*Math.acos(Math.max(-1,Math.min(1,(d*d-l1*l1-l2*l2)/(2*l1*l2))));
 const upper=Math.atan2(dy,dx)-Math.atan2(l2*Math.sin(bend),l1+l2*Math.cos(bend));
 const oldUpper=Math.atan2(elbow[1]-shoulder[1],elbow[0]-shoulder[0]),oldLower=Math.atan2(grip[1]-elbow[1],grip[0]-elbow[0]);
 const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
 return {upper:wrap(upper-oldUpper),lower:wrap(upper+bend-oldLower),reachable:Math.abs(d-raw)<1e-6};
}
