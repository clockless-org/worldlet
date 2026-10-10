import {addPoint as add,mixPoint as mix,type RigPoint} from './fox-anatomy.ts';
import {draftingArmPoint} from './fox-drafting-registration.ts';
import {solveReadingArm} from './fox-reading-page.ts';
import {smoother as ease} from './fox-skeleton.ts';
const rotate=([x,y]:RigPoint,a:number):RigPoint=>[Math.cos(a)*x-Math.sin(a)*y,Math.sin(a)*x+Math.cos(a)*y];
const sub=(a:RigPoint,b:RigPoint):RigPoint=>[a[0]-b[0],a[1]-b[1]];
const shoulder=draftingArmPoint('writing',[270,470]),elbow=draftingArmPoint('writing',[200,795]),wrist=draftingArmPoint('writing',[430,807]);
const tip=draftingArmPoint('writing',[715,912]),eraser=draftingArmPoint('writing',[509,578]);
const dockTip:RigPoint=[.685,.785],dockAngle=.25-Math.atan2(tip[1]-eraser[1],tip[0]-eraser[0]);
const dockWrist=sub(dockTip,rotate(sub(tip,wrist),dockAngle));

/** Explicit held -> place -> release -> reach -> grasp -> held study.
 * Paper moves under the pencil before release. No opacity or object teleport.
 * This is a geometric ownership study, not yet a live entry/exit choreography. */
export function draftingRelease(time:number){
 if(!Number.isFinite(time)||time<0)throw Error('Invalid release time');
 const place=ease(time/1400)*(1-ease((time-4600)/1400));
 const withdraw=ease((time-1800)/700)*(1-ease((time-3500)/700));
 const attached=time<1600||time>=4400;
 const angle=dockAngle*place,target=add(mix(wrist,dockWrist,place),[-.04*withdraw,-.03*withdraw]);
 const arm=solveReadingArm(shoulder,elbow,wrist,target),movedElbow=add(shoulder,rotate(sub(elbow,shoulder),arm.upper));
 const vertex=(p:RigPoint,segment:'upper'|'forearm'|'paw'):RigPoint=>{
  const q=draftingArmPoint('writing',p);
  if(segment==='upper')return add(shoulder,rotate(sub(q,shoulder),arm.upper));
  if(segment==='forearm')return add(movedElbow,rotate(sub(q,elbow),arm.lower));
  return add(target,rotate(sub(q,wrist),angle));
 };
 const pencil=(p:RigPoint):RigPoint=>attached?vertex(p,'paw'):add(dockWrist,rotate(sub(draftingArmPoint('writing',p),wrist),dockAngle));
 const paperOffset:RigPoint=[-.05*place,-.03*place];
 const a=draftingArmPoint('support',[1330,470]),e=draftingArmPoint('support',[1380,800]),g=draftingArmPoint('support',[1020,808]),r=solveReadingArm(a,e,g,add(g,paperOffset));
 const moved=add(a,rotate(sub(e,a),r.upper));
 const support=(p:RigPoint,segment:'upper'|'forearm')=>segment==='upper'?add(a,rotate(sub(draftingArmPoint('support',p),a),r.upper)):add(moved,rotate(sub(draftingArmPoint('support',p),e),r.lower));
 return {attached,place,withdraw,reachable:arm.reachable&&r.reachable,paperOffset,vertex,pencil,support};
}
