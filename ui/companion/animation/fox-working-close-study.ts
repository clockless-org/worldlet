import {anatomyMatrices,anatomyArmVertex,type AnatomyPose,type JointControl,type RigPoint} from './fox-anatomy.ts';
import {workingStudy} from './fox-working-study.ts';
import {workingLidPoint} from './fox-working-device.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';

// Bound the evaluated result too: near-endpoint cancellation otherwise sends
// closure above one and throws before the next portrait RAF can be scheduled.
export const WORKING_CLOSE_CONTACT={paw:[.677,.923] as RigPoint,lid:[.875,.665] as RigPoint};
function blend(a:AnatomyPose,b:AnatomyPose,w:number):AnatomyPose{
 const result:Record<string,JointControl>={};
 for(const id of new Set([...Object.keys(a),...Object.keys(b)])){
  const control:JointControl={};
  for(const key of ['angle','x','y','closure'] as const)if(a[id]?.[key]!==undefined||b[id]?.[key]!==undefined)control[key]=(a[id]?.[key]??0)*(1-w)+(b[id]?.[key]??0)*w;
  result[id]=control;
 }
 return result;
}
/** Standalone contact choreography, not yet a live work-exit controller.
 * Starts at a stopped keyboard pose. The pad presses the outer lid edge;
 * fingers do not teleport to the hinge, and the elbow stays on one branch. */
export function workingCloseStudy(milliseconds:number,reduced=false){
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid working close time');
 const t=reduced?4400:Math.min(milliseconds,4400),reach=ease(t/1000),closure=ease((t-1000)/1800),release=ease((t-2800)/700),settle=ease((t-3500)/900);
 const stopped=workingStudy(4800,false,true,true),entry=stopped.pose;
 const closePose:AnatomyPose={
  upperArmR:{angle:-15.5+38*closure*closure-26*ease((closure-.75)/.25)},
  forearmR:{angle:-95+35*ease((closure-.75)/.25)},pawR:{angle:-20},
  head:{angle:2,y:.006},earL:{angle:-2},earR:{angle:-3}
 };
 // Preserve the full paused body on entry; the contact solve uses actual skin
 // position, not the wrist pivot. No limb or head scale is introduced.
 let pose=blend(entry,closePose,reach);
 const matrices=anatomyMatrices(pose),actual=anatomyArmVertex('R',WORKING_CLOSE_CONTACT.paw,matrices),target=workingLidPoint(WORKING_CLOSE_CONTACT.lid,closure),parent=matrices.get('chest')!;
 const dx=(target[0]-actual[0])*reach,dy=(target[1]-actual[1])*reach;
 pose={...pose,upperArmR:{...pose.upperArmR,x:(pose.upperArmR?.x??0)+parent[0]*dx+parent[1]*dy,y:(pose.upperArmR?.y??0)+parent[2]*dx+parent[3]*dy}};
 // Lift away from the closed surface before bringing the hands down.
 const withdrawn:AnatomyPose={...pose,upperArmR:{...pose.upperArmR,x:(pose.upperArmR?.x??0)+.025,y:(pose.upperArmR?.y??0)-.035}};
 pose=blend(blend(pose,withdrawn,release),{},settle);
 return {pose,frontPaws:['L','R'] as const,gazeDown:(stopped.gazeDown*(1-reach)+.7*reach)*(1-settle),workstation:1,workingLidClosure:closure,contact: t>=1000&&t<=2800};
}
