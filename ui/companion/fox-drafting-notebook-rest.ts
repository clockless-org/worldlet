import {addPoint as add,rotatePoint as rotate,type RigPoint} from './fox-anatomy.ts';
import {draftingRelease} from './fox-drafting-release.ts';
import {draftingArmPoint,draftingPaperPoint} from './fox-drafting-registration.ts';
import {solveReadingArm} from './fox-reading-page.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';
/** Put the notebook onto the lap, not into an invented invisible inventory.
 * Paper and parked pencil share one planar tilt/projection. The supporting
 * paw follows its edge until release, then withdraws; the notebook stays put. */
export function draftingNotebookRest(time:number){
 if(!Number.isFinite(time)||time<0)throw Error('Invalid notebook rest clock');
 const held=draftingRelease(2500),lower=ease(time/1700),withdraw=ease((time-2100)/800);
 const tilt=lower*Math.acos(.28),project=([x,y]:RigPoint):RigPoint=>[x,.8+.11*lower+(y-.8)*Math.cos(tilt)];
 const paper=(p:RigPoint)=>project(add(draftingPaperPoint(p),held.paperOffset));
 const a=draftingArmPoint('support',[1330,470]),e=draftingArmPoint('support',[1380,800]),g=draftingArmPoint('support',[1020,808]);
 const target=add(project(add(g,held.paperOffset)),[.035*withdraw,-.025*withdraw]);
 const rotation=solveReadingArm(a,e,g,target),movedElbow=rotate(e,a,rotation.upper);
 const support=(p:RigPoint,segment:'upper'|'forearm'):RigPoint=>{
  const q=draftingArmPoint('support',p);if(segment==='upper')return rotate(q,a,rotation.upper);
  const v=rotate(q,e,rotation.lower);return [v[0]+movedElbow[0]-e[0],v[1]+movedElbow[1]-e[1]];
 };
 // The empty hand settles independently after the notebook starts descending.
 // Solve the wrist, not the fingertips: neither forearm nor palm is stretched.
 const relax=ease((time-900)/1700),wa=draftingArmPoint('writing',[270,470]),we=draftingArmPoint('writing',[200,795]),ww=draftingArmPoint('writing',[430,807]);
 const start=held.vertex([430,807],'paw'),end:RigPoint=[.48,.86];
 const wrist:RigPoint=[start[0]+(end[0]-start[0])*relax-.012*Math.sin(Math.PI*relax)**2,start[1]+(end[1]-start[1])*relax];
 const arm=solveReadingArm(wa,we,ww,wrist),elbow=rotate(we,wa,arm.upper);
 const originalTip=draftingArmPoint('writing',[715,912]),heldTip=held.vertex([715,912],'paw');
 const initialAngle=Math.atan2(heldTip[1]-start[1],heldTip[0]-start[0])-Math.atan2(originalTip[1]-ww[1],originalTip[0]-ww[0]);
 const angle=initialAngle+(.8-initialAngle)*relax;
 const vertex=(p:RigPoint,segment:'upper'|'forearm'|'paw'):RigPoint=>{
  const q=draftingArmPoint('writing',p);
  if(segment==='upper')return rotate(q,wa,arm.upper);
  const origin=segment==='paw'?ww:we,offset=segment==='paw'?wrist:elbow,v=rotate(q,origin,segment==='paw'?angle:arm.lower);
  return [v[0]+offset[0]-origin[0],v[1]+offset[1]-origin[1]];
 };
 return {paper,pencil:(p:RigPoint)=>project(held.pencil(p)),support,vertex,reachable:rotation.reachable&&arm.reachable,attached:time<1900,tilt,lower};
}
