import {anatomyMatrices,anatomyArmVertex,type AnatomyPose,type JointControl,type RigPoint} from './fox-anatomy.ts';
import {FOX_WORKING_RIG,workingDevicePoint} from './fox-working-device.ts';
import {smoother as ease} from './fox-skeleton.ts';

/** Registered key contact, not a general arm IK solver. Small shoulder
 * translations preserve the authored joint angles/painted limb lengths while
 * preventing the distal contact from skating sideways on each keystroke. */
export function workingContact(pose:AnatomyPose,reach:number,left:number,right:number):AnatomyPose{
 const weight=ease((reach-.85)/.15);
 if(!weight)return pose;
 const result:Record<string,JointControl>={...pose},matrices=anatomyMatrices(pose),parent=matrices.get('chest')!;
 for(const [side,lift] of [['L',left],['R',right]] as const){
  const [px,py]=FOX_WORKING_RIG.pawContacts[side],point:RigPoint=[px,py];
  const [kx,ky]=FOX_WORKING_RIG.keyContacts[side],key=workingDevicePoint([kx,ky]),actual=anatomyArmVertex(side,point,matrices);
  const dx=(key[0]-actual[0])*weight,dy=(key[1]-.011*lift-actual[1])*weight,id='upperArm'+side,control=result[id]??{};
  result[id]={...control,x:(control.x??0)+parent[0]*dx+parent[1]*dy,y:(control.y??0)+parent[2]*dx+parent[3]*dy};
 }
 return result;
}
